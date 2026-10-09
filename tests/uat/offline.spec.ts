import { test, expect, type Page } from '@playwright/test';
import { ui, waitForHydration } from '../helpers';
import { extractPdfText } from '../pdf-text';

/**
 * Werkt de app echt zonder netwerk?
 *
 * Dit is de hele claim achter de service worker, en hij is alleen hier te
 * toetsen: de registratie staat uit buiten de gepubliceerde build (zie
 * components/ServiceWorker.tsx), dus in de gewone suite tegen `next dev`
 * bestaat dit gedrag niet.
 *
 * Een losse test en niet een stap in reis.spec.ts: die reis is één doorlopende
 * staat, en de verbinding daarin wegnemen zou de stappen erna iets anders laten
 * toetsen dan waarvoor ze geschreven zijn.
 *
 * Wat er bewezen moet worden is niet dat er een service worker geregistreerd is
 * — dat zegt niets — maar dat je met de stekker eruit nog steeds een factuur
 * kunt maken die klopt.
 */
test('offline blijft de app een complete factuur maken', async ({ page, context }) => {
    test.setTimeout(120_000);

    await test.step('eerst één keer online, zodat de bestanden hier staan', async () => {
        await page.goto('./');
        await waitForHydration(page);
        await expect(ui(page).preview).toBeVisible();

        // Wachten tot de service worker het overneemt. Zonder dit is de cache
        // nog leeg en toetst de stap hierna alleen of Chromium een foutpagina
        // kan tonen.
        await page.waitForFunction(
            () => navigator.serviceWorker?.controller !== null,
            null,
            { timeout: 30_000 },
        );

        /*
         * Nog één keer laden, en dan wachten tot het PDF-pad is opgewarmd.
         *
         * Bij het állereerste bezoek gaan de verzoeken langs de worker heen: die
         * neemt het pas over als hij geactiveerd is. Pas op de tweede lading
         * worden de brokken onderschept en bewaard, en pas dán kan Download PDF
         * het offline ook.
         *
         * Dit nabootsen is geen kunstgreep maar precies wat een gebruiker doet:
         * de app openen, hem gebruiken, en later nog eens terugkomen zonder
         * verbinding.
         */
        await page.reload();
        await waitForHydration(page);
        await page.waitForFunction(
            async () => {
                const namen = await caches.keys();
                for (const naam of namen) {
                    const sleutels = await (await caches.open(naam)).keys();
                    // De twee zware brokken van het PDF-pad: react-pdf (1,2 MB)
                    // en fontkit plus pdf-lib (420 kB). Op grootte en niet op
                    // naam, want die draagt een hash die per build verandert.
                    const groot = await Promise.all(sleutels
                        .filter((r) => r.url.includes('/_next/static/chunks/'))
                        .map(async (r) => (await (await caches.open(naam)).match(r))?.headers.get('content-length')));
                    if (groot.filter((n) => Number(n) > 300_000).length >= 2) return true;
                }
                return false;
            },
            null,
            { timeout: 60_000 },
        );
    });

    await test.step('netwerk eruit', async () => {
        await context.setOffline(true);
        // Bewijs dat offline ook echt offline is: zonder deze controle zou de
        // test net zo goed slagen met een werkende verbinding.
        const bereikbaar = await page.evaluate(() =>
            fetch('https://example.com', { mode: 'no-cors' }).then(() => true).catch(() => false));
        expect(bereikbaar, 'de verbinding staat nog aan').toBe(false);
    });

    await test.step('de app opent nog steeds, uit de cache', async () => {
        await page.reload();
        await waitForHydration(page);
        await expect(ui(page).preview).toBeVisible();
    });

    await test.step('en rekent een factuur gewoon uit', async () => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.clientName.fill('Klant Offline BV');
        await app.itemQuantity().fill('3');
        await app.itemPrice().fill('100');

        await expect(app.preview).toContainText('Klant Offline BV');
        // 3 × 100 plus 21% btw: de btw-regels zitten in de bundel en niet
        // ergens achter een verbinding.
        await expect(app.preview).toContainText('€ 363,00');
    });

    /*
     * En de PDF, want dat is waar het offline om begonnen is.
     *
     * Dit ontbrak, en er zat een echte fout achter. react-pdf wordt pas bij een
     * klik geladen, en de worker legt bij het installeren alleen de adressen
     * vast die in de HTML staan; een brok die daar niet in staat, belandt nooit
     * in de cache. Download PDF deed offline dus niets, en zweeg daar ook nog
     * over. Het is precies het geval dat het beveiligingspaneel belooft:
     * "factureren in de trein of bij een klant zonder wifi".
     *
     * Alle vier de documenten, want ze lopen niet door dezelfde code: factuur en
     * offerte hebben eigen koppen en een eigen voettekst, en de taal bepaalt wat
     * daarin komt te staan. Eén variant toetsen zou de andere drie dekken op
     * niets anders dan hoop.
     */
    const GEVALLEN = [
        { soort: 'Factuur', taal: 'nl', kop: 'FACTUUR', zin: 'Wij verzoeken u' },
        { soort: 'Factuur', taal: 'en', kop: 'INVOICE', zin: 'Please transfer' },
        { soort: 'Offerte', taal: 'nl', kop: 'OFFERTE', zin: 'Geldig tot' },
        { soort: 'Offerte', taal: 'en', kop: 'QUOTATION', zin: 'Valid until' },
    ] as const;

    const haalPdf = async (bladzijde: Page) => {
        const [download] = await Promise.all([
            bladzijde.waitForEvent('download'),
            ui(bladzijde).downloadPdf.click(),
        ]);
        const stream = await download.createReadStream();
        const stukken: Buffer[] = [];
        for await (const stuk of stream!) stukken.push(stuk as Buffer);
        return { naam: download.suggestedFilename(), tekst: await extractPdfText(Buffer.concat(stukken)) };
    };

    for (const { soort, taal, kop, zin } of GEVALLEN) {
        await test.step(`offline een ${soort.toLowerCase()} als PDF, in het ${taal}`, async () => {
            const app = ui(page);
            await app.tab(soort).click();
            await app.clientName.fill('Klant Offline BV');
            await app.itemPrice().fill('100');
            await app.documentTaal.selectOption(taal);

            const { naam, tekst } = await haalPdf(page);
            expect(naam.toLowerCase()).toContain(soort.toLowerCase());
            expect(tekst, `de kop ${kop} staat er niet op`).toContain(kop);
            expect(tekst, `de vaste tekst in het ${taal} ontbreekt`).toContain(zin);
        });
    }

    await test.step('de voorwaarden zijn offline ook te lezen', async () => {
        await page.getByRole('link', { name: 'gebruiksvoorwaarden' }).click();
        await expect(page.getByRole('heading', { level: 1 }))
            .toContainText('Gebruiksvoorwaarden');
    });

    await test.step('en met het netwerk terug werkt alles door', async () => {
        await context.setOffline(false);
        await page.goto('./');
        await waitForHydration(page);
        await expect(ui(page).preview).toBeVisible();
    });
});

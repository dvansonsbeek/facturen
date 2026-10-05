import { test, expect } from '@playwright/test';
import { ui, normalise, openFoldout, previewHeaders, waitForHydration } from '../helpers';

/**
 * De volledige reis door de app, tegen de gepubliceerde build.
 *
 * Dit is geen unittest en geen tweede exemplaar van de andere suites. Die
 * toetsen elk één regel in isolatie, met een schone browser per test. Deze
 * loopt één keer de weg af die een gebruiker aflegt — bedrijf invullen, twee
 * klanten factureren, er een weggooien, een offerte omzetten, alles
 * versleutelen, ontgrendelen, opruimen — en vindt daarmee wat alleen in de
 * volgorde zit: een nummer dat niet meeloopt, een archief dat na een
 * verwijdering de verkeerde regel toont, een vergrendeling die de rest blokkeert.
 *
 * Daarom is het **één test met stappen** en niet een reeks tests: Playwright
 * geeft elke test een eigen browsercontext, en dan is localStorage en
 * IndexedDB elke keer weer leeg. De staat moet juist meelopen.
 *
 * Hij draait tegen out/ onder hetzelfde voorvoegsel als GitHub Pages, en met
 * UAT_BASE_URL tegen de echt gepubliceerde site. Zie
 * playwright.productie.config.ts.
 */
const ZIN = 'de lange zin van de uat';

const KLANT_A = 'Klant A Holding BV';
const KLANT_B = 'Klant B Diensten BV';

test('de hele reis: twee klanten factureren, opruimen en versleutelen', async ({ page }) => {
    const app = ui(page);
    // Eén lange reis met een trage sleutelafleiding erin; de standaard van
    // 30 seconden is daar te krap voor.
    test.setTimeout(180_000);

    await test.step('de app opent en is bruikbaar', async () => {
        await page.goto('./');
        await waitForHydration(page);
        await expect(app.preview).toBeVisible();
        await expect(app.documentNumber).toHaveValue(/\d{4}-\d{3}/);
    });

    await test.step('mijn bedrijfsgegevens invullen', async () => {
        await openFoldout(page, 'Mijn Bedrijfsgegevens');
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.companyKvk.fill('87654321');
        await app.companyVat.fill('NL123456789B01');
        await app.companyEmail.fill('info@sonsbeekadvies.nl');

        await openFoldout(page, 'Mijn Betaalgegevens');
        await app.iban.fill('NL91ABNA0417164300');

        // Ze horen meteen op het document te staan, en te blijven staan.
        await expect(app.preview).toContainText('Sonsbeek Advies BV');
        await expect(app.preview).toContainText('87654321');
    });

    let nummerA = '';
    await test.step('factuur voor klant A, klant opslaan in het boek', async () => {
        nummerA = await app.documentNumber.inputValue();

        await app.clientName.fill(KLANT_A);
        await app.clientAddress.fill('Keizersgracht 10');
        await app.clientZip.fill('1015 CJ');
        await app.clientCity.fill('Amsterdam');
        await app.saveClient.click();

        // Opgeslagen: de velden klappen dicht en hij staat in de keuzelijst.
        await expect(app.clientPicker.locator('option', { hasText: KLANT_A })).toHaveCount(1);

        await app.itemDescription().fill('Strategisch advies');
        await app.itemQuantity().fill('10');
        await app.itemUnit().fill('uur');
        await app.itemPrice().fill('125');

        await expect(app.preview).toContainText('€ 1.250,00');
        await expect(app.preview).toContainText('€ 1.512,50');
    });

    await test.step('factuur A ook als e-factuur, met klantreferentie', async () => {
        // Zonder referentie weigert hij, en dat hoort hij te zeggen.
        await app.downloadUbl.click();
        await expect(app.status.filter({ hasText: 'referentie van je klant' })).toBeVisible();

        await app.buyerReference.fill('INKOOP-A-2026-001');
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            app.downloadUbl.click(),
        ]);
        expect(download.suggestedFilename()).toMatch(/^efactuur_.*\.xml$/);
    });

    await test.step('factuur A bewaren', async () => {
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(1);
        expect(await app.archiveRow().text()).toContain(nummerA);
        expect(await app.archiveRow().text()).toContain(KLANT_A);
    });

    let nummerB = '';
    await test.step('volgende factuur: het nummer loopt op', async () => {
        page.once('dialog', (d) => d.accept());
        await app.nextDocument.click();

        nummerB = await app.documentNumber.inputValue();
        expect(nummerB, 'het nummer is niet opgehoogd').not.toBe(nummerA);
        // De regels zijn leeg, de klant blijft staan — je factureert vaak
        // dezelfde klant twee keer achter elkaar.
        await expect(app.preview).not.toContainText('€ 1.512,50');
    });

    await test.step('factuur voor klant B, ook in het boek', async () => {
        await app.clientPicker.selectOption('');
        await app.clientName.fill(KLANT_B);
        await app.clientAddress.fill('Coolsingel 5');
        await app.clientZip.fill('3012 AA');
        await app.clientCity.fill('Rotterdam');
        await app.saveClient.click();
        await expect(app.clientPicker.locator('option', { hasText: KLANT_B })).toHaveCount(1);

        await app.itemDescription().fill('Onderhoud');
        await app.itemQuantity().fill('1');
        await app.itemPrice().fill('500');
        await expect(app.preview).toContainText('€ 605,00');

        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();
    });

    await test.step('beide facturen staan in het archief, nieuwste eerst', async () => {
        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(2);
        expect(await app.archiveRow(0).text()).toContain(nummerB);
        expect(await app.archiveRow(1).text()).toContain(nummerA);
    });

    await test.step('het klantenboek kent ze allebei', async () => {
        await expect(app.clientPicker.locator('option')).toHaveCount(3); // incl. "Nieuwe klant"
    });

    await test.step('factuur A is nog als PDF te downloaden', async () => {
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            app.archiveRowFor(nummerA).pdf.click(),
        ]);
        expect(download.suggestedFilename()).toContain('factuur');
    });

    await test.step('factuur A bekijken: hij staat vast', async () => {
        await app.archiveRowFor(nummerA).view.click();
        await expect(app.archiveDialog).toBeVisible();
        const bewaard = normalise(await app.archiveDialogPreview.innerText());
        expect(bewaard).toContain(KLANT_A);
        expect(bewaard).toContain('€ 1.512,50');
        // Niets om in te typen: een uitgereikt stuk wijzig je niet.
        await expect(app.archiveDialog.locator('input, textarea, select')).toHaveCount(0);
        await page.keyboard.press('Escape');
        await expect(app.archiveDialog).not.toBeVisible();
    });

    await test.step('de factuur van klant A verwijderen', async () => {
        page.once('dialog', (d) => d.accept());
        await app.archiveRowFor(nummerA).remove.click();

        await expect(app.archiveRows).toHaveCount(1);
        await expect(app.archiveRowFor(nummerA).row).toHaveCount(0);
        expect(await app.archiveRowFor(nummerB).text()).toContain(KLANT_B);
    });

    await test.step('klant A blijft wel in het klantenboek staan', async () => {
        // Het document weggooien is iets anders dan de klant kwijtraken.
        await expect(app.clientPicker.locator('option', { hasText: KLANT_A })).toHaveCount(1);
    });

    await test.step('een offerte voor klant A, en die omzetten naar factuur', async () => {
        await app.tab('Offerte').click();
        const offerteNummer = await app.documentNumber.inputValue();
        expect(offerteNummer).toMatch(/^OFF-/);

        await app.clientPicker.selectOption({ label: KLANT_A });
        await app.itemDescription().fill('Vervolgtraject');
        await app.itemPrice().fill('2000');
        await expect(app.preview).toContainText('€ 2.420,00');

        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

        page.once('dialog', (d) => d.accept());
        await app.convertToInvoice.click();

        // De factuur verwijst nu naar het offertenummer.
        await expect(app.notes).toHaveValue(new RegExp(offerteNummer));
        await expect(app.preview).toContainText(offerteNummer);
    });

    await test.step('de kleineondernemersregeling laat de btw weg', async () => {
        await app.korToggle.check();

        // Geen btw-kolom in de regeltabel. Let op: "BTW" op zichzelf staat wél
        // op het document, want je eigen btw-nummer hoort erop. Het gaat om de
        // tarieven en bedragen.
        expect(await previewHeaders(page)).toEqual(['Beschrijving', 'Aantal', 'Prijs', 'Totaal']);

        const tekst = normalise(await app.preview.innerText());
        expect(tekst).toContain('€ 2.000,00');
        expect(tekst, 'een KOR-factuur mag geen btw-regels tonen').not.toContain('BTW (');
        expect(tekst, 'een subtotaal gelijk aan het totaal is ruis').not.toContain('Subtotaal');
        expect(tekst, 'vrijgesteld is niet hetzelfde als het nultarief').not.toContain('€ 420,00');
        expect(tekst).toContain('art. 25 Wet OB 1968');

        await app.korToggle.uncheck();
        await expect(app.preview).toContainText('€ 2.420,00');
    });

    await test.step('alles versleutelen met een wachtwoordzin', async () => {
        await openFoldout(page, 'Beveiliging en privacy');
        await app.newPassphrase.fill(ZIN);
        await app.repeatPassphrase.fill(ZIN);
        page.once('dialog', (d) => d.accept());
        await app.encryptArchive.click();
        await expect(app.securityStatus.filter({ hasText: 'nu versleuteld' }))
            .toBeVisible({ timeout: 60_000 });
    });

    await test.step('op schijf staat geen klantnaam meer', async () => {
        const klanten = await page.evaluate(() => localStorage.getItem('facturen.klanten'));
        expect(klanten).not.toContain(KLANT_A);
        expect(klanten).not.toContain(KLANT_B);

        const documenten = await page.evaluate(() => new Promise<string>((klaar, mislukt) => {
            const verzoek = indexedDB.open('facturen');
            verzoek.onsuccess = () => {
                const db = verzoek.result;
                const alles = db.transaction('documenten', 'readonly')
                    .objectStore('documenten').getAll();
                alles.onsuccess = () => { klaar(JSON.stringify(alles.result)); db.close(); };
                alles.onerror = () => mislukt(alles.error);
            };
            verzoek.onerror = () => mislukt(verzoek.error);
        }));
        expect(documenten).not.toContain(KLANT_A);
        expect(documenten).not.toContain(KLANT_B);
    });

    await test.step('na herladen is alles vergrendeld, maar de app werkt', async () => {
        await page.reload();
        await waitForHydration(page);

        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(0);
        await expect(page.locator('.archief-vergrendeld')).toBeVisible();
        await expect(page.locator('.klantenboek-vergrendeld')).toBeVisible();

        // Mijn eigen gegevens blijven wel staan: daarmee is de app bruikbaar.
        await openFoldout(page, 'Mijn Bedrijfsgegevens');
        await expect(app.companyName).toHaveValue('Sonsbeek Advies BV');
        await expect(app.preview).toContainText('87654321');
    });

    await test.step('de verkeerde zin opent niets', async () => {
        await openFoldout(page, 'Beveiliging en privacy');
        await app.passphrase.fill('een heel andere zin');
        await app.unlockArchive.click();
        await expect(app.securityStatus.filter({ hasText: 'klopt niet' }))
            .toBeVisible({ timeout: 60_000 });
    });

    await test.step('de juiste zin opent alles weer', async () => {
        await app.passphrase.fill(ZIN);
        await app.unlockArchive.click();

        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(2, { timeout: 60_000 });
        await expect(app.clientPicker.locator('option', { hasText: KLANT_A })).toHaveCount(1);
        await expect(app.clientPicker.locator('option', { hasText: KLANT_B })).toHaveCount(1);
    });

    await test.step('Export levert een versleutelde reservekopie', async () => {
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            app.exportSettings.click(),
        ]);
        const stream = await download.createReadStream();
        const stukken: Buffer[] = [];
        for await (const stuk of stream!) stukken.push(stuk as Buffer);
        const tekst = Buffer.concat(stukken).toString('utf8');

        expect(tekst).not.toContain(KLANT_A);
        expect(tekst).not.toContain(KLANT_B);
        const bestand = JSON.parse(tekst);
        expect(bestand.kluis.kop.zout).toBeTruthy();
        expect(bestand.sender.name).toBe('Sonsbeek Advies BV');
    });

    await test.step('tot slot de factuur van klant B verwijderen', async () => {
        await openFoldout(page, 'Bewaarde documenten');
        const regels = await app.archiveRows.count();
        await expect(app.archiveRowFor(nummerB).row).toHaveCount(1);

        page.once('dialog', (d) => d.accept());
        await app.archiveRowFor(nummerB).remove.click();

        await expect(app.archiveRows).toHaveCount(regels - 1);
        await expect(app.archiveRowFor(nummerB).row).toHaveCount(0);
    });

    await test.step('Wissen ruimt alles op', async () => {
        page.once('dialog', (d) => d.accept());
        await app.clearSettings.click();

        await expect(app.archiveRows).toHaveCount(0);
        await expect(app.clientPicker.locator('option')).toHaveCount(1);

        await page.reload();
        await waitForHydration(page);
        // Geen kluis meer, dus niets vergrendeld en niets om in te voeren.
        await openFoldout(page, 'Beveiliging en privacy');
        await expect(app.newPassphrase).toBeVisible();
        await expect(page.locator('.klantenboek-vergrendeld')).toHaveCount(0);
    });
});

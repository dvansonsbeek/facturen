import { test, expect } from '@playwright/test';
import { ui, openFoldout, openApp } from './helpers';

test.beforeEach(async ({ page }) => {
    await openApp(page);
});

/**
 * Een veld zonder gekoppeld label wordt door een schermlezer aangekondigd als
 * "invoerveld", zonder te zeggen waarvoor. Visueel stond het bijschrift er wel,
 * maar programmatisch was er geen verband: 21 van de 23 labels misten htmlFor.
 */
test('elk invoerveld heeft een toegankelijke naam', async ({ page }) => {
    const app = ui(page);
    await app.tab('Offerte').click();   // zodat ook de offertevelden meedoen
    await app.tab('Factuur').click();

    const zonderNaam = await page.evaluate(() => {
        const velden = [...document.querySelectorAll<HTMLInputElement>(
            '.form-section input, .form-section select, .form-section textarea',
        )];
        return velden
            .filter(veld => {
                const gekoppeld = veld.labels && veld.labels.length > 0;
                const beschreven = veld.getAttribute('aria-label')
                    || veld.getAttribute('aria-labelledby');
                return !gekoppeld && !beschreven;
            })
            .map(veld => veld.id || veld.getAttribute('placeholder') || veld.outerHTML.slice(0, 70));
    });

    expect(zonderNaam).toEqual([]);
});

test('knoppen zonder tekst hebben een omschrijving', async ({ page }) => {
    const naamloos = await page.evaluate(() =>
        [...document.querySelectorAll('button')]
            .filter(knop => !knop.textContent?.trim()
                && !knop.getAttribute('aria-label')
                && !knop.getAttribute('title'))
            .map(knop => knop.outerHTML.slice(0, 70)),
    );
    expect(naamloos).toEqual([]);
});

test('de velden zijn ook via hun label te vinden', async ({ page }) => {
    // Lukt alleen als de koppeling echt klopt.
    await page.getByLabel('Bedrijfsnaam', { exact: true }).fill('Sonsbeek Advies BV');
    // Exact, want de klant heeft inmiddels ook een KvK-veld voor de e-factuur.
    await page.getByLabel('KvK-nummer', { exact: true }).fill('87654321');
    await expect(ui(page).preview).toContainText('KvK: 87654321');
});

/**
 * De sweeps hierboven lopen over wat er op dat moment in de pagina staat, en dat
 * dekt nieuwe velden automatisch — maar alleen in de toestand waarin de test
 * kijkt. Velden die er pas zijn als de app ergens anders staat, komen er nooit
 * langs. Dat zijn precies de twee hieronder.
 */
const veldenZonderNaam = (page: import('@playwright/test').Page, binnen: string) =>
    page.evaluate((selector) => {
        const wortel = document.querySelector(selector);
        if (!wortel) return ['het blok zelf staat er niet'];
        return [...wortel.querySelectorAll<HTMLInputElement>('input, select, textarea')]
            .filter((veld) => {
                const gekoppeld = veld.labels && veld.labels.length > 0;
                return !gekoppeld
                    && !veld.getAttribute('aria-label')
                    && !veld.getAttribute('aria-labelledby');
            })
            .map((veld) => veld.id || veld.getAttribute('placeholder') || veld.outerHTML.slice(0, 70));
    }, binnen);

test('ook het ontgrendelveld heeft een naam', async ({ page }) => {
    const app = ui(page);
    await openFoldout(page, 'Beveiliging en privacy');
    await app.newPassphrase.fill('een lange wachtwoordzin');
    await app.repeatPassphrase.fill('een lange wachtwoordzin');
    page.once('dialog', (d) => d.accept());
    await app.encryptArchive.click();
    await expect(app.securityStatus.filter({ hasText: 'nu versleuteld' }))
        .toBeVisible({ timeout: 30000 });

    // Pas na herladen staat de app vergrendeld, en bestaat dit veld.
    await page.reload();
    await openFoldout(page, 'Beveiliging en privacy');
    await expect(app.passphrase).toBeVisible();

    expect(await veldenZonderNaam(page, '.form-section')).toEqual([]);
});

test.describe('het venster met een bewaard document', () => {
    const opendocument = async (page: import('@playwright/test').Page) => {
        const app = ui(page);
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');
        const nummer = await app.documentNumber.inputValue();
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

        await openFoldout(page, 'Bewaarde documenten');
        await app.archiveRowFor(nummer).view.click();
        await expect(app.archiveDialog).toBeVisible();
        return app;
    };

    test('heeft knoppen met een naam', async ({ page }) => {
        await opendocument(page);
        const naamloos = await page.evaluate(() =>
            [...document.querySelectorAll('dialog.archief-venster button')]
                .filter(knop => !knop.textContent?.trim()
                    && !knop.getAttribute('aria-label')
                    && !knop.getAttribute('title'))
                .map(knop => knop.outerHTML.slice(0, 70)),
        );
        expect(naamloos).toEqual([]);
    });

    /**
     * De focus hóórt in het venster te belanden — dat is waarvoor showModal()
     * gebruikt wordt in plaats van een eigen overlay. Blijft hij erbuiten, dan
     * typt een toetsenbordgebruiker nog in het formulier eronder terwijl er een
     * venster overheen staat.
     *
     * Deze twee tests leggen gedrag vast dat de browser zelf verzorgt, en dat is
     * met opzet: wie showModal() ooit vervangt door een eigen overlay — om de
     * achtergrond anders te kunnen opmaken, bijvoorbeeld — raakt dit geruisloos
     * kwijt. Dan vallen ze om.
     */
    test('neemt de focus mee naar binnen', async ({ page }) => {
        await opendocument(page);

        const focusInVenster = await page.evaluate(() => {
            const venster = document.querySelector('dialog.archief-venster');
            return !!venster && !!document.activeElement && venster.contains(document.activeElement);
        });
        expect(focusInVenster, 'de focus staat nog buiten het venster').toBe(true);
    });

    test('geeft na Escape de focus terug aan de knop die het opende', async ({ page }) => {
        const app = await opendocument(page);
        await page.keyboard.press('Escape');
        await expect(app.archiveDialog).not.toBeVisible();

        // Terug naar Bekijken, en niet naar de bovenkant van de pagina: anders
        // moet je met de toets opnieuw de hele lijst door.
        const terug = await page.evaluate(() => ({
            tekst: document.activeElement?.textContent?.trim() ?? '',
            buitenVenster: !document.querySelector('dialog.archief-venster')
                ?.contains(document.activeElement),
        }));
        expect(terug.buitenVenster, 'de focus hangt nog in een gesloten venster').toBe(true);
        expect(terug.tekst, 'de focus komt niet terug bij Bekijken').toContain('Bekijken');
    });
});

test('het land van de afzender is in te vullen', async ({ page }) => {
    const land = page.getByLabel('Land', { exact: true });
    await expect(land).toHaveValue('Nederland');

    await land.fill('België');
    await expect(ui(page).preview).toContainText('België');
});

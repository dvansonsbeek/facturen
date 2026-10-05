import { test, expect } from '@playwright/test';
import { ui, normalise, openFoldout } from './helpers';

/**
 * Het archief van bewaarde documenten.
 *
 * De kern van deze suite is de bevriezing: een bewaard document moet blijven
 * zoals het is uitgereikt, ook als je daarna je bedrijfsgegevens wijzigt. Dat
 * is niet cosmetisch — je klant heeft dat stuk, en je btw-aangifte verwijst
 * ernaar.
 */
test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

/** Een factuur met één regel, zodat er iets te bewaren valt. */
const vulFactuur = async (page: import('@playwright/test').Page) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.clientName.fill('Klant BV');
    await app.itemDescription().fill('Advies');
    await app.itemPrice().fill('100');
    return app;
};

const openArchief = (page: import('@playwright/test').Page) =>
    openFoldout(page, 'Bewaarde documenten');

test('bewaart een factuur met nummer, klant en totaal', async ({ page }) => {
    const app = await vulFactuur(page);
    const nummer = await app.documentNumber.inputValue();

    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    await openArchief(page);
    await expect(app.archiveRows).toHaveCount(1);
    const regel = normalise(await app.archiveRow().row.innerText());
    expect(regel).toContain(`Factuur ${nummer}`);
    expect(regel).toContain('Klant BV');
    expect(regel).toContain('€ 121,00');
});

test('het archief overleeft een herlaadbeurt', async ({ page }) => {
    const app = await vulFactuur(page);
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    await page.reload();
    await openArchief(page);
    await expect(app.archiveRows).toHaveCount(1);
    expect(normalise(await app.archiveRow().row.innerText())).toContain('Klant BV');
});

test.describe('een bewaard document staat vast', () => {
    /**
     * De belangrijkste test van dit bestand.
     *
     * Bedrijfsgegevens horen bij jou en gelden voor alles wat je maakt. Zonder
     * momentopname bij het bewaren zou een verhuizing of naamswijziging elke
     * eerder uitgereikte factuur met terugwerkende kracht herschrijven.
     */
    test('latere wijzigingen aan je bedrijfsgegevens veranderen hem niet', async ({ page }) => {
        const app = await vulFactuur(page);
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

        // Verhuizen, nadat de factuur al uit is.
        await app.companyName.fill('Sonsbeek Advies Holding BV');
        await expect(app.preview).toContainText('Sonsbeek Advies Holding BV');

        await openArchief(page);
        await app.archiveRow().view.click();
        await expect(app.archiveDialog).toBeVisible();

        const bewaard = normalise(await app.archiveDialogPreview.innerText());
        expect(bewaard).toContain('Sonsbeek Advies BV');
        expect(bewaard).not.toContain('Holding');
    });

    test('latere wijzigingen aan de regels veranderen hem niet', async ({ page }) => {
        const app = await vulFactuur(page);
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

        await app.itemPrice().fill('500');
        await expect(app.preview).toContainText('€ 605,00');

        await openArchief(page);
        await app.archiveRow().view.click();
        const bewaard = normalise(await app.archiveDialogPreview.innerText());
        expect(bewaard).toContain('€ 121,00');
        expect(bewaard).not.toContain('€ 605,00');
    });

    test('het venster biedt geen velden om hem te wijzigen', async ({ page }) => {
        const app = await vulFactuur(page);
        await app.saveDocument.click();
        await openArchief(page);
        await app.archiveRow().view.click();
        await expect(app.archiveDialog).toBeVisible();

        // Niet te wijzigen betekent: er is niets om in te typen.
        await expect(app.archiveDialog.locator('input, textarea, select')).toHaveCount(0);
    });

    test('sluiten met Escape laat het concept ongemoeid', async ({ page }) => {
        const app = await vulFactuur(page);
        await app.saveDocument.click();
        await openArchief(page);
        await app.archiveRow().view.click();
        await expect(app.archiveDialog).toBeVisible();

        await page.keyboard.press('Escape');
        await expect(app.archiveDialog).not.toBeVisible();
        await expect(app.preview).toContainText('€ 121,00');
    });
});

test.describe('dupliceren', () => {
    test('neemt klant en regels over', async ({ page }) => {
        const app = await vulFactuur(page);
        await app.saveDocument.click();
        await openArchief(page);

        // Het concept leegmaken, zodat overnemen zichtbaar is. Volgende factuur
        // vraagt om bevestiging zodra er regels staan.
        page.once('dialog', (d) => d.accept());
        await app.nextDocument.click();
        await expect(app.preview).not.toContainText('€ 121,00');

        await app.archiveRow().duplicate.click();
        await expect(app.preview).toContainText('Klant BV');
        await expect(app.preview).toContainText('€ 121,00');
    });

    /**
     * Twee facturen met hetzelfde nummer zijn een echte fout (art. 35a Wet OB
     * 1968), een gat in de reeks hooguit iets om uit te leggen. Een duplicaat
     * krijgt dus het nummer waar je reeks nu staat, niet dat van het origineel.
     */
    test('neemt het factuurnummer niet over', async ({ page }) => {
        const app = await vulFactuur(page);
        const origineel = await app.documentNumber.inputValue();
        await app.saveDocument.click();
        await openArchief(page);

        page.once('dialog', (d) => d.accept());
        await app.nextDocument.click();
        const volgende = await app.documentNumber.inputValue();
        expect(volgende).not.toBe(origineel);

        await app.archiveRow().duplicate.click();
        await expect(app.documentNumber).toHaveValue(volgende);
    });

    test('laat het bewaarde document zelf staan', async ({ page }) => {
        const app = await vulFactuur(page);
        await app.saveDocument.click();
        await openArchief(page);

        await app.archiveRow().duplicate.click();
        await expect(app.archiveRows).toHaveCount(1);
    });
});

test('verwijderen haalt hem uit het archief en laat het concept staan', async ({ page }) => {
    const app = await vulFactuur(page);
    await app.saveDocument.click();
    await openArchief(page);
    await expect(app.archiveRows).toHaveCount(1);

    page.once('dialog', (d) => d.accept());
    await app.archiveRow().remove.click();

    await expect(app.archiveRows).toHaveCount(0);
    await expect(app.preview).toContainText('€ 121,00');
});

test('waarschuwt als je hetzelfde nummer een tweede keer bewaart', async ({ page }) => {
    const app = await vulFactuur(page);
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    // Hetzelfde nummer nog eens bewaren geeft twee stukken met één nummer; dat
    // mag, maar niet zonder dat je het gevraagd wordt.
    const gevraagd = new Promise<string>((klaar) => {
        page.once('dialog', (d) => { klaar(d.message()); d.dismiss(); });
    });
    await app.saveDocument.click();
    expect(await gevraagd).toContain('staat al in je archief');

    await openArchief(page);
    await expect(app.archiveRows).toHaveCount(1);
});

test('Export neemt het archief mee', async ({ page }) => {
    const app = await vulFactuur(page);
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.exportSettings.click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(chunk as Buffer);
    const bestand = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(bestand.documents).toHaveLength(1);
    expect(bestand.documents[0]).toMatchObject({
        soort: 'factuur',
        klant: 'Klant BV',
        totaal: 121,
    });
    // De momentopname hoort erin te zitten, anders is de back-up onvolledig.
    expect(bestand.documents[0].document.sender.name).toBe('Sonsbeek Advies BV');
});

test('Wissen noemt het aantal bewaarde documenten en verwijdert ze', async ({ page }) => {
    const app = await vulFactuur(page);
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    const gevraagd = new Promise<string>((klaar) => {
        page.once('dialog', (d) => { klaar(d.message()); d.accept(); });
    });
    await app.clearSettings.click();
    expect(await gevraagd).toContain('1 bewaard document');

    await expect(app.archiveRows).toHaveCount(0);
});

test('een offerte wordt als offerte bewaard', async ({ page }) => {
    const app = ui(page);
    await app.tab('Offerte').click();
    await app.clientName.fill('Klant BV');
    await app.itemPrice().fill('100');
    const nummer = await app.documentNumber.inputValue();

    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    await openArchief(page);
    expect(normalise(await app.archiveRow().row.innerText())).toContain(`Offerte ${nummer}`);
});

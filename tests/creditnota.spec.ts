import { test, expect } from '@playwright/test';
import { ui, normalise, openFoldout, openApp } from './helpers';

/**
 * De creditfactuur.
 *
 * Dit is het sluitstuk van een beslissing die eerder genomen is: een bewaard
 * document kan niet gewijzigd worden, omdat je klant het al heeft en je
 * aangifte ernaar verwijst. Daarmee was er alleen geen nette manier meer om een
 * verkeerde factuur recht te zetten. Een creditfactuur neemt de oude terug, met
 * een eigen nummer en een duidelijke verwijzing naar het origineel.
 *
 * Het begint daarom bij het archief en niet bij een leeg formulier: je
 * crediteert een bepaalde factuur, je verzint er geen.
 */
test.beforeEach(async ({ page }) => {
    await openApp(page);
});

/** Een complete factuur, bewaard, zodat er iets te crediteren valt. */
const bewaarFactuur = async (page: import('@playwright/test').Page) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.companyKvk.fill('87654321');
    await app.companyVat.fill('NL123456789B01');
    await openFoldout(page, 'Mijn Betaalgegevens');
    await app.iban.fill('NL91ABNA0417164300');

    await app.clientName.fill('Klant BV');
    await app.clientAddress.fill('Keizersgracht 10');
    await app.clientZip.fill('1015 CJ');
    await app.clientCity.fill('Amsterdam');
    await app.buyerReference.fill('INKOOP-2026-77');

    await app.itemDescription().fill('Advies');
    await app.itemQuantity().fill('10');
    await app.itemPrice().fill('125');

    const nummer = await app.documentNumber.inputValue();
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();
    return { app, nummer };
};

const crediteer = async (page: import('@playwright/test').Page, nummer: string) => {
    const app = ui(page);
    await openFoldout(page, 'Bewaarde documenten');
    await app.archiveRowFor(nummer).view.click();
    await app.archiveDialog.getByRole('button', { name: 'Crediteren' }).click();
    await expect(app.archiveDialog).not.toBeVisible();
    return app;
};

test('crediteren maakt een creditfactuur die naar het origineel verwijst', async ({ page }) => {
    const { nummer } = await bewaarFactuur(page);
    const app = await crediteer(page, nummer);

    const tekst = normalise(await app.preview.innerText());
    expect(tekst).toContain('CREDITFACTUUR');
    // De verwijzing moet duidelijk en ondubbelzinnig zijn: nummer én datum.
    expect(tekst).toContain(`Creditfactuur bij factuur ${nummer} van`);
    // En de regels komen mee, want je neemt terug wat je in rekening bracht.
    expect(tekst).toContain('Advies');
    expect(tekst).toContain('€ 1.512,50');
});

test('de bedragen blijven positief en het totaal heet anders', async ({ page }) => {
    const { nummer } = await bewaarFactuur(page);
    const app = await crediteer(page, nummer);

    const tekst = normalise(await app.preview.innerText());
    // Het document zegt zelf dat het crediteert; een min ervoor zou dat een
    // tweede keer zeggen en daarmee omkeren.
    expect(tekst).toContain('Te crediteren:');
    expect(tekst).not.toContain('Totaal:');
    expect(tekst).not.toContain('-€');
    expect(tekst).not.toContain('€ -');
});

test('er wordt niet om een betaling gevraagd', async ({ page }) => {
    const { nummer } = await bewaarFactuur(page);
    const app = await crediteer(page, nummer);

    // Op een creditfactuur gaat het geld de andere kant op.
    const tekst = normalise(await app.preview.innerText());
    expect(tekst).not.toContain('over te maken naar');
    expect(tekst).toContain('verrekend of aan u terugbetaald');
});

test('een creditfactuur krijgt een eigen nummer uit de factuurreeks', async ({ page }) => {
    const { app, nummer } = await bewaarFactuur(page);

    // Nieuw nummer pakken zoals je dat voor een volgend stuk doet.
    page.once('dialog', (d) => d.accept());
    await app.nextDocument.click();
    const nieuw = await app.documentNumber.inputValue();
    expect(nieuw).not.toBe(nummer);

    await crediteer(page, nummer);
    // Niet het nummer van het origineel: dat zou twee stukken met hetzelfde
    // nummer opleveren (art. 35a Wet OB 1968).
    await expect(app.documentNumber).toHaveValue(nieuw);
});

test('hij wordt als creditfactuur bewaard en is zo terug te vinden', async ({ page }) => {
    const { app, nummer } = await bewaarFactuur(page);
    page.once('dialog', (d) => d.accept());
    await app.nextDocument.click();
    await crediteer(page, nummer);

    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'Creditfactuur' })).toBeVisible();

    await openFoldout(page, 'Bewaarde documenten');
    await expect(app.archiveRows).toHaveCount(2);
    const regels = await app.archiveRows.allInnerTexts();
    expect(regels.join(' ')).toContain('Creditfactuur');
});

test.describe('het mag niet doorlekken naar het volgende document', () => {
    test('Volgende factuur maakt er weer een gewone factuur van', async ({ page }) => {
        const { app, nummer } = await bewaarFactuur(page);
        await crediteer(page, nummer);
        await expect(app.preview).toContainText('CREDITFACTUUR');

        page.once('dialog', (d) => d.accept());
        await app.nextDocument.click();

        const tekst = normalise(await app.preview.innerText());
        expect(tekst).toContain('FACTUUR');
        expect(tekst).not.toContain('CREDITFACTUUR');
        expect(tekst).not.toContain('Creditfactuur bij factuur');
    });

    test('een omgezette offerte wordt geen creditfactuur', async ({ page }) => {
        const { app, nummer } = await bewaarFactuur(page);
        await crediteer(page, nummer);

        await app.tab('Offerte').click();
        await app.clientName.fill('Andere Klant BV');
        await app.itemPrice().fill('200');
        page.once('dialog', (d) => d.accept());
        await app.convertToInvoice.click();

        const tekst = normalise(await app.preview.innerText());
        expect(tekst).not.toContain('CREDITFACTUUR');
        expect(tekst).toContain('over te maken naar');
    });

    test('een offerte wordt nooit een creditfactuur', async ({ page }) => {
        const { nummer } = await bewaarFactuur(page);
        const app = await crediteer(page, nummer);

        await app.tab('Offerte').click();
        const tekst = normalise(await app.preview.innerText());
        expect(tekst).toContain('OFFERTE');
        expect(tekst).not.toContain('Creditfactuur bij factuur');
    });
});

test('een offerte is niet te crediteren', async ({ page }) => {
    const app = ui(page);
    await app.tab('Offerte').click();
    await app.clientName.fill('Klant BV');
    await app.itemPrice().fill('100');
    const nummer = await app.documentNumber.inputValue();
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    await openFoldout(page, 'Bewaarde documenten');
    await app.archiveRowFor(nummer).view.click();
    // Er valt niets terug te nemen: een offerte is geen factuur.
    await expect(app.archiveDialog.getByRole('button', { name: 'Crediteren' })).toHaveCount(0);
});

test('de PDF heet naar wat het is', async ({ page }) => {
    const { app, nummer } = await bewaarFactuur(page);
    page.once('dialog', (d) => d.accept());
    await app.nextDocument.click();
    await crediteer(page, nummer);

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.downloadPdf.click(),
    ]);
    expect(download.suggestedFilename()).toContain('creditfactuur');
});

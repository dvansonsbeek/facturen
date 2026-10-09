import { test, expect } from '@playwright/test';
import { ui, normalise, openFoldout } from './helpers';

/**
 * Het document kan Engels, de app blijft Nederlands.
 *
 * Dit bestond niet terwijl drie van de zes btw-behandelingen er juist zijn omdát
 * de klant in het buitenland zit. Een intracommunautaire levering gaat naar een
 * Duitse ondernemer, uitvoer en een dienst buiten de EU gaan de EU uit, en alle
 * drie kregen een vel papier met FACTUUR erboven en "Wij verzoeken u vriendelijk
 * het totale factuurbedrag over te maken" eronder.
 *
 * Wat hier bewaakt wordt, in volgorde van belang:
 *
 * 1. De vermeldingen die de btw-behandeling juridisch dragen vertalen mee. Geen
 *    validator kijkt daarnaar — de Schematron ziet alleen de categorie — dus als
 *    dit stilletjes Nederlands blijft op een Engels document merkt niemand het.
 * 2. Het formulier blijft Nederlands. Dit is geen i18n van de app.
 * 3. De taal reist mee langs alle vier de paden die een document kopiëren. Zie
 *    "Adding a field to a document? Four paths, every time" in CLAUDE.md; bij het
 *    btw-regime en bij de korting ging dat allebei een keer mis.
 */
test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

const vul = async (page: import('@playwright/test').Page) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.companyKvk.fill('87654321');
    await app.companyVat.fill('NL123456789B01');
    await app.clientName.fill('Müller GmbH');
    await app.itemDescription().fill('Advies');
    await app.itemPrice().fill('100');
    return app;
};

test.describe('het document in het Engels', () => {
    test('vertaalt de koppen, de kolommen en het betaalverzoek', async ({ page }) => {
        const app = await vul(page);
        await expect(app.preview).toContainText('FACTUUR');

        await app.documentTaal.selectOption('en');

        await expect(app.preview).toContainText('INVOICE');
        const tekst = normalise(await app.preview.innerText());
        for (const woord of ['Description', 'Quantity', 'Price', 'Total', 'Date']) {
            expect(tekst, `"${woord}" ontbreekt op het Engelse document`).toContain(woord);
        }
        expect(tekst).toContain('Please transfer the total invoice amount');
        // En het Nederlands is weg, niet alleen aangevuld.
        expect(tekst).not.toContain('Beschrijving');
        expect(tekst).not.toContain('Wij verzoeken u');
    });

    /**
     * De zin die de btw-behandeling draagt is het punt van deze hele functie.
     * Een Engelse factuur met een Nederlandse vrijstellingszin is precies zo
     * onbruikbaar als een volledig Nederlandse.
     */
    const VERMELDINGEN = [
        { regime: 'kor', en: 'Exempt from VAT under the Dutch small businesses scheme', nl: 'Vrijgesteld van btw' },
        { regime: 'verlegd', en: 'VAT reverse-charged', nl: 'Btw verlegd' },
        { regime: 'icp', en: 'Intra-Community supply, 0% VAT', nl: 'Intracommunautaire levering' },
        { regime: 'export', en: 'Export outside the EU, 0% VAT', nl: 'Uitvoer buiten de EU' },
        { regime: 'dienst-buiten-eu', en: 'Service not taxable in the Netherlands', nl: 'Dienst niet belast in Nederland' },
    ] as const;

    for (const { regime, en, nl } of VERMELDINGEN) {
        test(`${regime} krijgt zijn vermelding in het Engels`, async ({ page }) => {
            const app = await vul(page);
            if (regime === 'icp') await app.clientCountry.fill('Duitsland');
            if (regime === 'export' || regime === 'dienst-buiten-eu') {
                await app.clientCountry.fill('Zwitserland');
            }
            if (regime === 'verlegd' || regime === 'icp') {
                await app.clientVat.fill('DE123456789');
            }
            await app.vatScheme.selectOption(regime);
            await expect(app.preview).toContainText(nl);

            await app.documentTaal.selectOption('en');
            await expect(app.preview).toContainText(en);
            expect(normalise(await app.preview.innerText())).not.toContain(nl);
        });
    }

    /**
     * Bedragen en datums zijn geen opmaakdetail.
     *
     * "€ 1.234,56" leest een Engelstalige als duizend keer te weinig, en
     * 09-10-2026 leest een Amerikaan als 10 september. Op een factuur met een
     * betaaltermijn is dat allebei een echt probleem, dus de notatie gaat mee.
     */
    test('schrijft bedragen en datums zo op dat ze niet verkeerd te lezen zijn', async ({ page }) => {
        const app = await vul(page);
        await app.itemPrice().fill('1234.56');
        await expect(app.preview).toContainText('€ 1.234,56');

        await app.documentTaal.selectOption('en');
        const tekst = normalise(await app.preview.innerText());
        expect(tekst).toContain('€1,234.56');
        // De datum staat als "9 Oct 2026" en niet als 09-10-2026 of 10/09/2026.
        expect(tekst).toMatch(/\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4}/);
    });

    /** De app is het gereedschap van een Nederlandse ondernemer en blijft dat. */
    test('laat het formulier zelf met rust', async ({ page }) => {
        const app = await vul(page);
        await app.documentTaal.selectOption('en');

        await expect(page.getByRole('heading', { name: 'Klantgegevens' })).toBeVisible();
        await expect(page.locator('label[for="btwRegime"]')).toHaveText('Btw-behandeling');
    });
});

/**
 * De vier paden uit CLAUDE.md. Bij het btw-regime en bij de korting ging dit
 * allebei een keer mis, op dezelfde manier: het veld werd niet meegekopieerd en
 * geen enkele test merkte het, omdat elke test het document zelf instelde en
 * daarna naar datzelfde document keek.
 */
test.describe('de taal reist mee langs elk pad dat een document kopieert', () => {
    test('wisselen van tabblad', async ({ page }) => {
        const app = await vul(page);
        await app.documentTaal.selectOption('en');

        await app.tab('Offerte').click();
        await expect(app.documentTaal, 'de offerte valt terug op Nederlands').toHaveValue('en');
        await expect(app.preview).toContainText('QUOTATION');
    });

    test('een offerte omzetten naar een factuur', async ({ page }) => {
        const app = await vul(page);
        await app.tab('Offerte').click();
        await app.clientName.fill('Müller GmbH');
        await app.itemPrice().fill('100');
        await app.documentTaal.selectOption('en');

        // De factuur op het andere tabblad heeft al regels, dus er komt een
        // bevestiging dat die vervangen worden.
        page.once('dialog', (d) => d.accept());
        await app.convertToInvoice.click();
        await expect(app.documentTaal).toHaveValue('en');
        await expect(app.preview).toContainText('INVOICE');
    });

    test('een bewaard document dupliceren', async ({ page }) => {
        const app = await vul(page);
        await app.documentTaal.selectOption('en');
        const nummer = await app.documentNumber.inputValue();
        await app.saveDocument.click();

        // Eerst het concept leegmaken, anders bewijst dit niets: zonder deze stap
        // staat de taal nog in het concept en zou de test ook slagen als
        // dupliceren het veld volledig negeert.
        await app.nextDocument.click();
        await expect(app.documentTaal).toHaveValue('en');
        await app.documentTaal.selectOption('nl');

        await openFoldout(page, 'Bewaarde documenten');
        await app.archiveRowFor(nummer).duplicate.click();
        await expect(app.documentTaal).toHaveValue('en');
        await expect(app.preview).toContainText('INVOICE');
    });

    /**
     * En het vierde pad, waar de keuze juist is om hem te láten staan: Volgende
     * factuur laat de klant staan, en de taal hoort bij die klant. Terugzetten
     * op Nederlands zou de volgende factuur aan dezelfde Duitse opdrachtgever
     * stilletjes onleesbaar maken.
     */
    test('en blijft staan bij Volgende factuur, want de klant blijft ook staan', async ({ page }) => {
        const app = await vul(page);
        await app.documentTaal.selectOption('en');

        await app.nextDocument.click();
        await expect(app.documentTaal).toHaveValue('en');
        await expect(app.preview).toContainText('INVOICE');
    });
});

/**
 * Een bewaard document staat vast, ook in zijn taal. Het is uitgereikt; wat de
 * klant kreeg verandert niet meer omdat jij later een ander concept maakt.
 */
test('een bewaard Engels document blijft Engels', async ({ page }) => {
    const app = await vul(page);
    await app.documentTaal.selectOption('en');
    const nummer = await app.documentNumber.inputValue();
    await app.saveDocument.click();

    await app.nextDocument.click();
    await app.documentTaal.selectOption('nl');

    await openFoldout(page, 'Bewaarde documenten');
    await app.archiveRowFor(nummer).view.click();
    await expect(app.archiveDialogPreview).toContainText('INVOICE');
});

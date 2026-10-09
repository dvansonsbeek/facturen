import { test, expect } from '@playwright/test';
import { ui, previewHeaders, verwachtVoorbeeld, openApp } from './helpers';

test.beforeEach(async ({ page }) => {
    await openApp(page);
});

test('biedt alleen de Nederlandse btw-tarieven aan', async ({ page }) => {
    const options = await ui(page).itemVatRate().locator('option').allInnerTexts();
    expect(options).toEqual(['21% BTW', '9% BTW', '0% BTW']);
});

test('rekent het algemene tarief van 21% door', async ({ page }) => {
    const app = ui(page);
    await app.itemPrice().fill('100');

    await verwachtVoorbeeld(page, {
        bevat: ['Subtotaal:', 'BTW (21%):', '€ 21,00', '€ 121,00'],
    });
});

test('rekent het verlaagde tarief van 9% door', async ({ page }) => {
    const app = ui(page);
    await app.itemPrice().fill('100');
    await app.itemVatRate().selectOption('9');

    await verwachtVoorbeeld(page, { bevat: ['BTW (9%):', '€ 9,00', '€ 109,00'] });
});

test('groepeert btw per tarief bij gemengde regels', async ({ page }) => {
    const app = ui(page);
    await app.itemPrice(0).fill('100');
    await app.addItem.click();
    await app.itemPrice(1).fill('100');
    await app.itemVatRate(1).selectOption('9');

    await verwachtVoorbeeld(page, {
        bevat: ['BTW (21%):', 'BTW (9%):', '€ 230,00'], // 200 + 21 + 9
    });
});

test.describe('afronding op centen', () => {
    /**
     * € 2,02 à 21% geeft 0,4242 en € 5,05 à 9% geeft 0,4545. Ongerond opgeteld
     * is dat 0,8787, wat als totaal € 7,95 oplevert terwijl de getoonde
     * btw-regels (0,42 en 0,45) samen met het subtotaal op € 7,94 uitkomen.
     * Wat er staat moet optellen tot wat eronder staat.
     */
    test('de getoonde btw-regels tellen op tot het getoonde totaal', async ({ page }) => {
        const app = ui(page);
        await app.itemPrice(0).fill('2.02');
        await app.addItem.click();
        await app.itemPrice(1).fill('5.05');
        await app.itemVatRate(1).selectOption('9');

        await verwachtVoorbeeld(page, {
            bevat: [
                '€ 7,07',   // subtotaal
                '€ 0,42',   // btw 21%
                '€ 0,45',   // btw 9%
                '€ 7,94',   // totaal: 7,07 + 0,42 + 0,45
            ],
            // Het hele punt van deze test: niet de uitkomst van afronden over
            // het geheel. Pas te beoordelen als de vier hierboven er staan.
            bevatNiet: ['€ 7,95'],
        });
    });

    test('rondt een halve cent van nul af naar boven', async ({ page }) => {
        const app = ui(page);
        // 0,50 à 21% = 0,105 -> 0,11
        await app.itemPrice().fill('0.50');
        await app.itemVatRate().selectOption('21');

        await verwachtVoorbeeld(page, { bevat: ['€ 0,11', '€ 0,61'] });
    });
});

test.describe('kleineondernemersregeling', () => {
    test('laat alle btw-tarieven en -bedragen weg', async ({ page }) => {
        const app = ui(page);
        await app.itemPrice().fill('100');
        await app.vatScheme.selectOption('kor');

        // Geen btw-kolom in de regeltabel.
        expect(await previewHeaders(page)).toEqual([
            'Beschrijving', 'Aantal', 'Prijs', 'Totaal',
        ]);

        await verwachtVoorbeeld(page, {
            // Het bedrag is hier het anker: zodra dat er staat, is het voorbeeld
            // opnieuw getekend en zegt het ontbreken van de rest iets.
            bevat: ['€ 100,00'],
            // Geen btw-regels, en geen subtotaal dat gelijk is aan het totaal.
            bevatNiet: ['BTW (', 'Subtotaal', '€ 121,00'],
        });
    });

    test('vermeldt de vrijstelling op het document', async ({ page }) => {
        await ui(page).vatScheme.selectOption('kor');
        await expect(ui(page).preview).toContainText(
            'Vrijgesteld van btw op grond van de kleineondernemersregeling (art. 25 Wet OB 1968).',
        );
    });

    test('toont het 0%-tarief niet: vrijgesteld is niet hetzelfde als nultarief', async ({ page }) => {
        const app = ui(page);
        await app.itemPrice().fill('100');
        await app.vatScheme.selectOption('kor');

        await verwachtVoorbeeld(page, {
            // De vrijstellingszin als anker: die verschijnt pas als het regime
            // echt is toegepast. Zonder dat zou "er staat geen 0%" ook slagen op
            // een voorbeeld dat nog niet opnieuw getekend is.
            bevat: ['art. 25 Wet OB 1968'],
            bevatNiet: ['0%', '€ 0,00'],
        });
    });

    test('behoudt het tarief van de regel na uit- en weer aanzetten', async ({ page }) => {
        const app = ui(page);
        await app.vatScheme.selectOption('kor');
        await app.vatScheme.selectOption('normaal');

        await expect(app.itemVatRate()).toHaveValue('21');
        await expect(ui(page).preview).toContainText('BTW (21%):');
    });
});

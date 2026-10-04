import { test, expect } from '@playwright/test';
import { ui, previewText, previewHeaders } from './helpers';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('biedt alleen de Nederlandse btw-tarieven aan', async ({ page }) => {
    const options = await ui(page).itemVatRate().locator('option').allInnerTexts();
    expect(options).toEqual(['21% BTW', '9% BTW', '0% BTW']);
});

test('rekent het algemene tarief van 21% door', async ({ page }) => {
    const app = ui(page);
    await app.itemPrice().fill('100');

    const text = await previewText(page);
    expect(text).toContain('Subtotaal:');
    expect(text).toContain('BTW (21%):');
    expect(text).toContain('€ 21,00');
    expect(text).toContain('€ 121,00');
});

test('rekent het verlaagde tarief van 9% door', async ({ page }) => {
    const app = ui(page);
    await app.itemPrice().fill('100');
    await app.itemVatRate().selectOption('9');

    const text = await previewText(page);
    expect(text).toContain('BTW (9%):');
    expect(text).toContain('€ 9,00');
    expect(text).toContain('€ 109,00');
});

test('groepeert btw per tarief bij gemengde regels', async ({ page }) => {
    const app = ui(page);
    await app.itemPrice(0).fill('100');
    await app.addItem.click();
    await app.itemPrice(1).fill('100');
    await app.itemVatRate(1).selectOption('9');

    const text = await previewText(page);
    expect(text).toContain('BTW (21%):');
    expect(text).toContain('BTW (9%):');
    expect(text).toContain('€ 230,00'); // 200 + 21 + 9
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

        const text = await previewText(page);
        expect(text).toContain('€ 7,07');   // subtotaal
        expect(text).toContain('€ 0,42');   // btw 21%
        expect(text).toContain('€ 0,45');   // btw 9%
        expect(text).toContain('€ 7,94');   // totaal: 7,07 + 0,42 + 0,45
        expect(text).not.toContain('€ 7,95');
    });

    test('rondt een halve cent van nul af naar boven', async ({ page }) => {
        const app = ui(page);
        // 0,50 à 21% = 0,105 -> 0,11
        await app.itemPrice().fill('0.50');
        await app.itemVatRate().selectOption('21');

        const text = await previewText(page);
        expect(text).toContain('€ 0,11');
        expect(text).toContain('€ 0,61');
    });
});

test.describe('kleineondernemersregeling', () => {
    test('laat alle btw-tarieven en -bedragen weg', async ({ page }) => {
        const app = ui(page);
        await app.itemPrice().fill('100');
        await app.korToggle.check();

        // Geen btw-kolom in de regeltabel.
        expect(await previewHeaders(page)).toEqual([
            'Beschrijving', 'Aantal', 'Prijs', 'Totaal',
        ]);

        const text = await previewText(page);
        // Geen btw-regels, en geen subtotaal dat gelijk is aan het totaal.
        expect(text).not.toContain('BTW (');
        expect(text).not.toContain('Subtotaal');
        expect(text).toContain('€ 100,00');
        expect(text).not.toContain('€ 121,00');
    });

    test('vermeldt de vrijstelling op het document', async ({ page }) => {
        await ui(page).korToggle.check();
        expect(await previewText(page)).toContain(
            'Vrijgesteld van btw op grond van de kleineondernemersregeling (art. 25 Wet OB 1968).',
        );
    });

    test('toont het 0%-tarief niet: vrijgesteld is niet hetzelfde als nultarief', async ({ page }) => {
        const app = ui(page);
        await app.itemPrice().fill('100');
        await app.korToggle.check();

        const text = await previewText(page);
        expect(text).not.toContain('0%');
        expect(text).not.toContain('€ 0,00');
    });

    test('behoudt het tarief van de regel na uit- en weer aanzetten', async ({ page }) => {
        const app = ui(page);
        await app.korToggle.check();
        await app.korToggle.uncheck();

        await expect(app.itemVatRate()).toHaveValue('21');
        expect(await previewText(page)).toContain('BTW (21%):');
    });
});

import { test, expect } from '@playwright/test';
import { ui, previewText, previewHeaders } from './helpers';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

/**
 * De eerste regel bevatte voorbeeldtekst als wáárde ("Dienstverlening"), terwijl
 * een toegevoegde regel die tekst alleen als placeholder toont. Zo kon die tekst
 * ongemerkt op een echte factuur belanden.
 */
test('de eerste regel is net zo leeg als een toegevoegde regel', async ({ page }) => {
    const app = ui(page);
    await expect(app.itemName(0)).toHaveValue('');
    await expect(app.itemDescription(0)).toHaveValue('');

    await app.addItem.click();
    await expect(app.itemName(1)).toHaveValue('');
    await expect(app.itemDescription(1)).toHaveValue('');
});

test.describe('eenheid per regel', () => {
    test('de prijskolom heet Prijs, niet Stukprijs', async ({ page }) => {
        // "Stukprijs" klopt niet voor uren.
        expect(await previewHeaders(page)).toEqual(
            ['Beschrijving', 'Aantal', 'Prijs', 'BTW', 'Totaal'],
        );
    });

    test('staat achter het aantal op het document', async ({ page }) => {
        const app = ui(page);
        await app.itemName(0).fill('Advies');
        await app.itemQuantity(0).fill('3');
        await app.itemUnit(0).fill('uur');
        await app.itemPrice(0).fill('85');

        const text = await previewText(page);
        expect(text).toContain('3 uur');
        expect(text).toContain('€ 255,00');
    });

    test('blijft weg als je hem leeg laat, voor een vast bedrag', async ({ page }) => {
        const app = ui(page);
        await app.itemName(0).fill('Projectbegeleiding');
        await app.itemPrice(0).fill('1500');

        const text = await previewText(page);
        expect(text).toContain('€ 1.500,00');
        expect(text).not.toMatch(/1\s+(uur|stuk)/);
    });

    test('accepteert ook een eenheid die niet in de lijst staat', async ({ page }) => {
        const app = ui(page);
        await app.itemQuantity(0).fill('120');
        await app.itemUnit(0).fill('km');
        expect(await previewText(page)).toContain('120 km');
    });

    test('verandert niets aan de berekening', async ({ page }) => {
        const app = ui(page);
        await app.itemQuantity(0).fill('3');
        await app.itemUnit(0).fill('uur');
        await app.itemPrice(0).fill('85');

        const text = await previewText(page);
        expect(text).toContain('€ 255,00');   // subtotaal
        expect(text).toContain('€ 53,55');    // 21% btw
        expect(text).toContain('€ 308,55');   // totaal
    });

    test('biedt suggesties aan zonder ze te verplichten', async ({ page }) => {
        const opties = await page.locator('datalist#eenheden option').evaluateAll(
            (nodes) => nodes.map((n) => (n as HTMLOptionElement).value),
        );
        expect(opties).toContain('uur');
        expect(opties).toContain('stuk');
        expect(opties).toContain('km');
    });
});

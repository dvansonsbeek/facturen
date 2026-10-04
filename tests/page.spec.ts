import { test, expect } from '@playwright/test';

/** De pagina zelf: titel, tagline en footer. */

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('draagt de naam Facturen', async ({ page }) => {
    await expect(page).toHaveTitle(/^Facturen/);
    await expect(page.locator('header h1')).toHaveText('Facturen & Offertes');
});

/** Het aantal regels dat een element in beslag neemt. */
const lineCount = (page: import('@playwright/test').Page, selector: string) =>
    page.locator(selector).evaluate((el) => {
        const style = getComputedStyle(el);
        const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
        return Math.round(el.getBoundingClientRect().height / lineHeight);
    });

test.describe('de tagline', () => {
    /**
     * Stond eerder op max-width 600px terwijl de zin er 724px nodig heeft: hij
     * brak dus af op elk scherm, ook op een breedbeeldmonitor.
     */
    test('past op één regel op een normaal scherm', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        expect(await lineCount(page, 'header p')).toBe(1);
    });

    test('past ook op een smalle laptop op één regel', async ({ page }) => {
        await page.setViewportSize({ width: 820, height: 900 });
        expect(await lineCount(page, 'header p')).toBe(1);
    });

    test('breekt af op een telefoon, zonder horizontaal te scrollen', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await lineCount(page, 'header p')).toBeGreaterThan(1);

        const overflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
    });
});

test('noemt de Nederlandse btw-tarieven en de KOR in de tagline', async ({ page }) => {
    await expect(page.locator('header p')).toContainText('Nederlandse btw-tarieven');
    await expect(page.locator('header p')).toContainText('KOR');
});

/**
 * De footer draagt alleen de privacybelofte. Toeschrijving hoort in LICENSE en
 * README; een auteursrechtregel in de interface zou bovendien een jaartal
 * nodig hebben, en dat zou in deze statisch geprerenderde pagina op het
 * bouwmoment worden gebakken en stilletjes verouderen.
 */
test('toont alleen de privacybelofte in de footer', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toHaveText('Geen opslag op servers, alles in jouw browser.');
    await expect(footer).not.toContainText('©');
    await expect(footer.locator('a')).toHaveCount(0);
});

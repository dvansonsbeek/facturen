import { test, expect } from '@playwright/test';

/** De pagina zelf: titel, tagline en footer. */

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('draagt de naam Facturen', async ({ page }) => {
    await expect(page).toHaveTitle(/^Facturen/);
    await expect(page.locator('header h1')).toHaveText('Facturen & Offertes');
});

/**
 * Een gedeelde link hoort een kaart te tonen in plaats van een kale URL. Dat
 * valt pas op als iemand hem deelt, dus controleren we het hier.
 */
test.describe('deelgegevens', () => {
    const meta = (page: import('@playwright/test').Page, selector: string) =>
        page.locator(selector).getAttribute('content');

    test('heeft een titel en omschrijving voor sociale media', async ({ page }) => {
        expect(await meta(page, 'meta[property="og:title"]')).toContain('Facturen');
        expect(await meta(page, 'meta[property="og:description"]')).toContain('KOR');
        expect(await meta(page, 'meta[name="twitter:card"]')).toBe('summary_large_image');
    });

    /** Het basispad stond ooit zowel in metadataBase als in de route: /facturen/facturen/. */
    test('verwijst naar een afbeelding die ook echt bestaat', async ({ page }) => {
        const src = await meta(page, 'meta[property="og:image"]');
        expect(src).toBeTruthy();
        expect(src!).not.toMatch(/(\/[^/]+)\1\//);  // geen verdubbeld pad

        const response = await page.request.get(src!);
        expect(response.status()).toBe(200);
    });

    test('biedt een manifest voor op het beginscherm', async ({ page }) => {
        const href = await page.locator('link[rel="manifest"]').getAttribute('href');
        const manifest = await (await page.request.get(href!)).json();
        expect(manifest.name).toBe('Facturen & Offertes');
        expect(manifest.icons.length).toBeGreaterThan(0);
    });
});

/**
 * react-pdf is ruim een megabyte en wordt alleen gebruikt als iemand op
 * Download PDF klikt. Het stond toch in de eerste paginalading, omdat
 * InvoiceDocument bovenaan werd geïmporteerd: een dynamische import van de
 * bibliotheek zelf helpt dan niets. Deze grens slaat aan als dat terugkomt.
 */
test('de pagina laadt niet meer javascript dan nodig', async ({ page }) => {
    let geladen = 0;
    page.on('response', async (response) => {
        if (!response.url().endsWith('.js')) return;
        const lengte = response.headers()['content-length'];
        if (lengte) geladen += Number(lengte);
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    const kilobytes = Math.round(geladen / 1024);
    // Nu ongeveer 600 KB; met react-pdf erbij was het ruim 1800 KB.
    expect(kilobytes, `${kilobytes} KB bij het openen van de pagina`).toBeLessThan(900);
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

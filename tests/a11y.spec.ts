import { test, expect } from '@playwright/test';
import { ui } from './helpers';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
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

test('het land van de afzender is in te vullen', async ({ page }) => {
    const land = page.getByLabel('Land', { exact: true });
    await expect(land).toHaveValue('Nederland');

    await land.fill('België');
    await expect(ui(page).preview).toContainText('België');
});

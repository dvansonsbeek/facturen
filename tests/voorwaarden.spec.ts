import { test, expect } from '@playwright/test';
import { normalise } from './helpers';

/**
 * De gebruiksvoorwaarden, en de verwijzing ernaar.
 *
 * Twee dingen moeten kloppen. De voettekst moet de twee ontkenningen zélf al
 * uitspreken — wie nooit doorklikt heeft ze dan toch gelezen — en de pagina
 * erachter moet bestaan. Dat laatste is minder vanzelfsprekend dan het lijkt:
 * dit is de eerste route naast /, en een tweede route is precies wat op
 * GitHub Pages omvalt terwijl hij op de ontwikkelserver werkt.
 */
test.describe('de verwijzing in de voettekst', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    /**
     * De twee ontkenningen staan vóór de verwijzing en niet erachter. Een
     * gebruiker die nooit op de voorwaarden klikt — en dat is bijna iedereen —
     * hoort het belangrijkste al gezien te hebben.
     */
    test('zegt zelf al dat dit geen boekhoudpakket en geen belastingadvies is', async ({ page }) => {
        const voet = normalise(await page.locator('footer').innerText());
        expect(voet).toContain('Geen boekhoudpakket en geen belastingadvies');
        expect(voet).toContain('ga je akkoord');
    });

    test('wijst naar de voorwaarden', async ({ page }) => {
        await expect(page.getByRole('link', { name: 'gebruiksvoorwaarden' })).toBeVisible();
    });

    test('en die verwijzing komt er ook echt aan', async ({ page }) => {
        await page.getByRole('link', { name: 'gebruiksvoorwaarden' }).click();
        await expect(page).toHaveURL(/\/voorwaarden\/?$/);
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Gebruiksvoorwaarden');
    });
});

test.describe('de pagina zelf', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/voorwaarden');
    });

    test('is rechtstreeks te openen', async ({ page }) => {
        await expect(page.getByRole('heading', { level: 1 })).toContainText('Gebruiksvoorwaarden');
    });

    /**
     * De inhoud die er juridisch toe doet. Niet de hele tekst woord voor woord —
     * die mag herschreven worden — maar wel dat deze punten erin staan, want dat
     * is waarvoor de pagina bestaat.
     */
    test('ontkent dat dit boekhouding of belastingadvies is', async ({ page }) => {
        const tekst = normalise(await page.locator('article').innerText());
        expect(tekst).toContain('geen boekhoudpakket');
        expect(tekst).toContain('geen belastingadvies');
    });

    test('legt de verantwoordelijkheid bij de ondernemer', async ({ page }) => {
        const tekst = normalise(await page.locator('article').innerText());
        expect(tekst).toContain('zelf verantwoordelijk');
    });

    test('noemt dat er geen garantie is en wie niet aansprakelijk is', async ({ page }) => {
        const tekst = normalise(await page.locator('article').innerText());
        expect(tekst).toContain('zonder enige garantie');
        expect(tekst).toContain('niet aansprakelijk');
    });

    /**
     * De waarschuwing die een gebruiker werkelijk geld kan schelen: er is geen
     * back-up buiten dit apparaat, en een vergeten wachtwoordzin is definitief.
     */
    test('waarschuwt dat de gegevens alleen in deze browser staan', async ({ page }) => {
        const tekst = normalise(await page.locator('article').innerText());
        expect(tekst).toContain('niet naar een server');
        expect(tekst).toContain('wachtwoordzin vergeet');
        expect(tekst).toContain('Export');
    });

    test('vertelt over de bezoekersteller, inclusief wat er niet meegaat', async ({ page }) => {
        const tekst = normalise(await page.locator('article').innerText());
        expect(tekst).toContain('GoatCounter');
        expect(tekst).toContain('Niets van wat je invult gaat mee');
        expect(tekst).toContain('Do Not Track');
    });

    /**
     * Contact loopt via GitHub, met opzet: geen naam en geen e-mailadres op een
     * openbare pagina.
     */
    test('wijst voor vragen naar GitHub en zet er geen e-mailadres op', async ({ page }) => {
        await expect(page.getByRole('link', { name: 'issue' })).toBeVisible();
        const tekst = await page.locator('article').innerText();
        expect(tekst).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    });

    test('is weer terug te verlaten', async ({ page }) => {
        await page.getByRole('link', { name: /Terug naar de app/ }).first().click();
        await expect(page.locator('.preview-wrapper .invoice-preview')).toBeVisible();
    });
});

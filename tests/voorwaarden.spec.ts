import { createHash } from 'node:crypto';
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
     *
     * De verwijzing moet naar /issues/new en niet naar /issues. Dat tweede is de
     * lijst, en bij een project zonder issues is dat een kale pagina waar je
     * niets kunt melden terwijl er "meld hem" boven staat. Precies dat werd
     * gemeld als "hij gaat naar GitHub algemeen".
     */
    test('wijst voor een melding naar het formulier, niet naar de lijst', async ({ page }) => {
        const melden = page.getByRole('link', { name: 'op GitHub' });
        await expect(melden).toBeVisible();
        await expect(melden).toHaveAttribute('href', /\/issues\/new$/);
    });

    /**
     * En de eis staat erbij. /issues/new stuurt je zonder account door naar de
     * inlogpagina van GitHub, en de meeste zzp'ers hebben er geen. Dat mag een
     * beperking zijn — er komt geen e-mailadres op deze pagina — maar dan moet
     * je het wel wéten voordat je klikt.
     */
    test('en zegt erbij dat je daar een account voor nodig hebt', async ({ page }) => {
        const tekst = normalise(await page.locator('article').innerText());
        expect(tekst).toContain('GitHub-account nodig');
        expect(tekst).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    });

    /**
     * De datum bovenaan staat met de hand in de code, en dat is met reden: zie
     * BIJGEWERKT in app/voorwaarden/page.tsx. Het nadeel van met de hand is dat
     * je het vergeet — je herschrijft een alinea en de pagina beweert nog steeds
     * dat er sinds oktober niets veranderd is.
     *
     * Deze test houdt daarom een vingerafdruk bij van de tekst zónder die
     * datumregel. Verandert er iets aan de inhoud, dan gaat hij rood en moet je
     * twee dingen doen: de datum bijwerken en de vingerafdruk hieronder. Alleen
     * de datum bijwerken kan zonder dat deze test klaagt, want die zit er niet
     * in — dat mag ook, dat is nooit een vergissing.
     */
    test('de tekst is niet veranderd zonder dat de datum is bijgewerkt', async ({ page }) => {
        const ruw = normalise(await page.locator('article').innerText());
        const zonderDatum = ruw
            .split('\n')
            .filter((regel) => !regel.includes('Laatst bijgewerkt op'))
            .join('\n')
            .replace(/\s+/g, ' ')
            .trim();

        const vingerafdruk = createHash('sha256').update(zonderDatum).digest('hex').slice(0, 16);
        expect(
            vingerafdruk,
            'De tekst van de voorwaarden is gewijzigd. Werk BIJGEWERKT bij in '
            + 'app/voorwaarden/page.tsx als dit een inhoudelijke wijziging is, en zet '
            + `daarna deze vingerafdruk op ${vingerafdruk}.`,
        ).toBe('19dafd6ff4df8258');
    });

    test('is weer terug te verlaten', async ({ page }) => {
        await page.getByRole('link', { name: /Terug naar de app/ }).first().click();
        await expect(page.locator('.preview-wrapper .invoice-preview')).toBeVisible();
    });
});

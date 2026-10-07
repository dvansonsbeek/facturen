import { test, expect } from '@playwright/test';

/**
 * Wat een zoekmachine en een deelknop van deze site zien.
 *
 * Dit is bij uitstek stille techniek: een kapotte canonical of een og:url die
 * naar het oude adres wijst, merk je pas als iemand een verwijzing deelt en er
 * iets anders uitkomt dan bedoeld — of als je maanden later ziet dat je op twee
 * adressen tegelijk in de index staat.
 *
 * Extra reden om het vast te leggen: de site stond tot 7 oktober 2026 op
 * dvansonsbeek.github.io/facturen. Zo'n verhuizing is precies het moment waarop
 * een adres ergens blijft hangen.
 */

const DOMEIN = 'https://factuurr.nl';

test.describe('robots.txt', () => {
    test('staat crawlen toe en wijst de sitemap aan', async ({ page }) => {
        const antwoord = await page.request.get('/robots.txt');
        expect(antwoord.status()).toBe(200);

        const tekst = await antwoord.text();
        expect(tekst).toContain('User-Agent: *');
        expect(tekst).toContain('Allow: /');
        expect(tekst).toContain(`Sitemap: ${DOMEIN}/sitemap.xml`);
        // Niets afgeschermd: twee pagina's, geen accounts, niets te verbergen.
        expect(tekst).not.toContain('Disallow: /');
    });
});

test.describe('sitemap.xml', () => {
    test('noemt allebei de paginas met een volledig adres', async ({ page }) => {
        const antwoord = await page.request.get('/sitemap.xml');
        expect(antwoord.status()).toBe(200);

        const xml = await antwoord.text();
        expect(xml).toContain(`<loc>${DOMEIN}/</loc>`);
        expect(xml).toContain(`<loc>${DOMEIN}/voorwaarden</loc>`);
        // Relatieve adressen zijn in een sitemap waardeloos.
        expect(xml).not.toMatch(/<loc>(?!https:\/\/)/);
    });
});

test.describe('de eigen URL', () => {
    test('de hoofdpagina wijst naar zichzelf', async ({ page }) => {
        await page.goto('/');
        const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
        expect(canonical).toBe(DOMEIN);
    });

    test('en de voorwaarden naar hun eigen adres', async ({ page }) => {
        await page.goto('/voorwaarden');
        const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
        expect(canonical).toBe(`${DOMEIN}/voorwaarden`);
    });

    /**
     * De deelafbeelding en og:url moeten absoluut zijn; een crawler kan met een
     * relatief pad niets. Dit ging eerder al eens mis toen het basispad er twee
     * keer in belandde.
     */
    test('og:url en de deelafbeelding zijn volledige adressen', async ({ page }) => {
        await page.goto('/');
        const url = await page.locator('meta[property="og:url"]').getAttribute('content');
        const afbeelding = await page.locator('meta[property="og:image"]').getAttribute('content');

        // og:url zetten we zelf, dus die mag hard op het domein worden getoetst.
        expect(url).toContain(DOMEIN);

        // De afbeelding niet: die stelt Next zelf samen, en op de
        // ontwikkelserver staat daar de herkomst van die server in plaats van
        // metadataBase. In de gebouwde versie is het wél factuurr.nl. Wat in
        // allebei de gevallen moet kloppen is dit: een volledig adres (een
        // crawler kan niets met een relatief pad) zonder dubbel basispad — die
        // laatste fout is hier eerder gemaakt.
        expect(afbeelding).toMatch(/^https?:\/\//);
        expect(afbeelding).toContain('opengraph-image.png');
        expect(afbeelding).not.toMatch(/\/facturen\/facturen/);
    });
});

test.describe('gestructureerde gegevens', () => {
    const lees = async (page: import('@playwright/test').Page) => {
        const ruw = await page.locator('script[type="application/ld+json"]').innerText();
        return JSON.parse(ruw);
    };

    test('beschrijven een gratis webapplicatie', async ({ page }) => {
        await page.goto('/');
        const d = await lees(page);

        expect(d['@type']).toBe('WebApplication');
        expect(d.url).toContain(DOMEIN);
        expect(d.inLanguage).toBe('nl-NL');
        // Waar het hier om begonnen is: dat "gratis" een eigenschap is en niet
        // alleen een woord in de lopende tekst.
        expect(d.isAccessibleForFree).toBe(true);
        expect(d.offers.price).toBe('0');
        expect(d.offers.priceCurrency).toBe('EUR');
    });

    /** Geen naam van een maker, net als in LICENSE. Bewust, niet vergeten. */
    test('en noemen geen persoon of e-mailadres', async ({ page }) => {
        await page.goto('/');
        const ruw = JSON.stringify(await lees(page));

        expect(ruw).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
        expect(ruw).not.toContain('author');
    });
});

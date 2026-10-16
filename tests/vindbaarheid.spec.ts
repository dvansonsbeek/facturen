import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openApp } from './helpers';
import { MAKER, CONTACT, BRONCODE } from '../lib/site';

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

/**
 * Het tabbladicoon, in twee smaken en om twee verschillende redenen.
 *
 * Een browser leest de <link rel="icon"> uit de HTML en krijgt dan de SVG: die
 * is scherp op elke maat en is het icoon waar het ontwerp om draait. Maar een
 * hoop gereedschap leest de HTML helemaal niet en vraagt gewoon /favicon.ico
 * op het hoofdadres — crawlers, feedlezers, dingen die een verwijzing uitpakken.
 * Dat gaf een 404, en daarom staat er nu ook een .ico.
 *
 * Hij staat in public/ en niet in app/, en dat is het hele punt: in app/ zou
 * Next er een tweede <link> bij zetten en gaan browsers kiezen. Zo blijft de
 * kop onveranderd en is de .ico er puur voor wie hem blind ophaalt.
 */
test.describe('het tabbladicoon', () => {
    test('de SVG is wat de pagina zelf aanwijst', async ({ page }) => {
        await openApp(page);
        const iconen = page.locator('link[rel="icon"]');
        await expect(iconen).toHaveCount(1);
        expect(await iconen.getAttribute('type')).toBe('image/svg+xml');
    });

    test('en /favicon.ico bestaat voor wie de HTML niet leest', async ({ page }) => {
        const antwoord = await page.request.get('/favicon.ico');
        expect(antwoord.status()).toBe(200);

        // Echt een icoonbestand en niet een 200 met een foutpagina erin: de
        // kopregels van een ICO zijn 00 00 (gereserveerd) en 01 00 (type 1),
        // gevolgd door het aantal maten dat erin zit.
        const bytes = await antwoord.body();
        expect([...bytes.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
        expect(bytes.readUInt16LE(4)).toBeGreaterThanOrEqual(1);
    });
});

test.describe('de eigen URL', () => {
    test('de hoofdpagina wijst naar zichzelf', async ({ page }) => {
        await openApp(page);
        const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
        expect(canonical).toBe(DOMEIN);
    });

    test('en de voorwaarden naar hun eigen adres', async ({ page }) => {
        await openApp(page, '/voorwaarden');
        const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
        expect(canonical).toBe(`${DOMEIN}/voorwaarden`);
    });

    /**
     * De deelafbeelding en og:url moeten absoluut zijn; een crawler kan met een
     * relatief pad niets. Dit ging eerder al eens mis toen het basispad er twee
     * keer in belandde.
     */
    test('og:url en de deelafbeelding zijn volledige adressen', async ({ page }) => {
        await openApp(page);
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
        await openApp(page);
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

    /**
     * Deze test stond precies omgekeerd: hij eiste dat er géén persoon en geen
     * e-mailadres in stond, "bewust, niet vergeten".
     *
     * Dat is omgedraaid toen een bedrijfsfilter de app als phishing blokkeerde.
     * Een domein van een paar weken oud met een formulier dat om IBAN, KvK- en
     * btw-nummer vraagt en dat niemand noemt, is van een valse pagina niet te
     * onderscheiden — het filter kan niet zien dat de gegevens de browser nooit
     * verlaten, het ziet de veldnamen. Aanspreekbaar zijn is het signaal dat
     * ontbrak, en dit is de plek waar een machine het leest.
     *
     * De test blijft bestaan omdat de richting ervan ertoe doet: hij ging eerder
     * rood als iemand een adres toevoegde, en gaat nu rood als iemand het weer
     * weghaalt.
     */
    test('noemen wie de app maakt en waar je die bereikt', async ({ page }) => {
        await openApp(page);
        const d = await lees(page);

        expect(d.author?.name).toBe(MAKER);
        expect(d.author?.email).toBe(CONTACT);
        expect(d.publisher?.name).toBe(MAKER);
        // De broncode is zelf een signaal: openbaar en controleerbaar is wat een
        // valse pagina nooit is.
        expect(d.codeRepository).toBe(BRONCODE);
    });
});

/**
 * security.txt (RFC 9116).
 *
 * Twee dingen die zonder test stil omvallen. Het bestand staat in
 * `public/.well-known/`, en dat is een map die met een punt begint: precies het
 * soort bestand dat ergens in de keten wordt overgeslagen. `upload-pages-artifact`
 * liet dotbestanden vanaf v4 weg, en daarom staat `include-hidden-files: true`
 * in de workflow. Deze test is wat merkt dat het er niet meer is.
 *
 * En `Expires` is een verplicht veld dat verloopt. Een verlopen security.txt is
 * ongeldig, dus de test gaat rood vóórdat dat gebeurt en niet erna.
 */
test.describe('security.txt', () => {
    /** Zo lang vooraf wil je het weten: ruim tijd om de datum bij te werken. */
    const WAARSCHUWTERMIJN_DAGEN = 60;

    const lees = async (page: import('@playwright/test').Page) => {
        const antwoord = await page.request.get('/.well-known/security.txt');
        expect(antwoord.status()).toBe(200);
        // Als text/plain, want een browser die het als download aanbiedt of als
        // HTML probeert te tekenen, voldoet niet aan RFC 9116.
        expect(antwoord.headers()['content-type']).toContain('text/plain');
        return antwoord.text();
    };

    const veld = (tekst: string, naam: string) =>
        tekst.split('\n').find((regel) => regel.startsWith(`${naam}:`))?.slice(naam.length + 1).trim();

    test('wijst naar hetzelfde adres als de rest van de site', async ({ page }) => {
        const tekst = await lees(page);

        // Eén adres op vier plaatsen, en dit bestand is de enige die lib/site.ts
        // niet kan importeren. Daarom legt deze test de twee tegen elkaar.
        expect(veld(tekst, 'Contact')).toBe(`mailto:${CONTACT}`);
        expect(veld(tekst, 'Canonical')).toBe(`${DOMEIN}/.well-known/security.txt`);
        expect(veld(tekst, 'Policy')).toBe(`${DOMEIN}/voorwaarden`);
        expect(tekst).toContain(BRONCODE);
    });

    /**
     * De twee bestanden die lib/site.ts niet kunnen importeren.
     *
     * security.txt en de README zijn platte tekst, dus daar staat de naam en het
     * adres uitgeschreven. Dat zijn twee kansen om ze te laten verlopen zodra de
     * constante verandert, en bij deze twee valt dat nergens op: een README die
     * de verkeerde naam noemt leest niemand na, en juist bij deze twee is
     * aanspreekbaar zijn het hele punt.
     */
    test('en de README noemen dezelfde maker en hetzelfde adres', async () => {
        // process.cwd() en niet import.meta.url: Playwright zet specs om naar
        // CommonJS, en daar bestaat import.meta niet. Playwright draait vanuit de
        // projectmap, dus dit is de wortel.
        for (const bestand of ['README.md', 'public/.well-known/security.txt']) {
            const tekst = await readFile(join(process.cwd(), bestand), 'utf8');
            expect(tekst, `${bestand} noemt de maker niet`).toContain(MAKER);
            expect(tekst, `${bestand} noemt het adres niet`).toContain(CONTACT);
        }
    });

    test('is nog geldig, en zegt het ruim voordat hij verloopt', async ({ page }) => {
        const tekst = await lees(page);
        const rauw = veld(tekst, 'Expires');

        // Verplicht veld in RFC 9116: zonder is het bestand ongeldig.
        expect(rauw, 'Expires ontbreekt').toBeTruthy();
        const verloopt = new Date(rauw as string);
        expect(Number.isNaN(verloopt.getTime()), `Expires is geen datum: ${rauw}`).toBe(false);

        const dagenTeGaan = (verloopt.getTime() - Date.now()) / 86_400_000;
        expect(
            dagenTeGaan,
            `security.txt verloopt over ${Math.floor(dagenTeGaan)} dagen `
            + `(${rauw}). Werk Expires bij in public/.well-known/security.txt.`,
        ).toBeGreaterThan(WAARSCHUWTERMIJN_DAGEN);
    });
});

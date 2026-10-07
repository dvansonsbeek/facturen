import { test, expect } from '@playwright/test';
import { ui } from './helpers';

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

/**
 * De ondertitel bestaat uit twee alinea's: de zin die zegt wat het is, en
 * daaronder kleiner de belofte dat er niets de browser verlaat. Vandaar
 * first-of-type — zonder die begrenzing wijst 'header p' naar allebei.
 */
const TAGLINE = 'header p:first-of-type';

/**
 * Past het vel in zijn kolom?
 *
 * Het voorbeeld is een A4 op ware grootte (800px bij 96dpi) en de kolom ernaast
 * is smaller zolang het venster dat is. Zonder verkleinen viel er bij 1280px
 * 188px weg — en dat is precies de rechterkolom met Subtotaal, BTW en Totaal.
 * Een factuur waarvan je de bedragen niet ziet.
 *
 * Er was ooit een --preview-scale voor bedacht, in zes mediaquery's op 1 gezet,
 * maar de bijbehorende transform stond er nooit. Geen enkele test keek ernaar,
 * want ze lezen allemaal tekst — en tekst is er gewoon, ook als hij buiten beeld
 * staat.
 */
test.describe('het voorbeeld past in zijn kolom', () => {
    for (const breedte of [1280, 1440, 1680]) {
        test(`bij ${breedte}px staat het hele vel in beeld`, async ({ page }) => {
            await page.setViewportSize({ width: breedte, height: 900 });

            const over = await page.locator('.preview-section').evaluate(
                (el) => Math.round(el.scrollWidth - el.clientWidth),
            );
            expect(over, 'het vel wordt afgekapt; de bedragenkolom valt weg').toBe(0);
        });
    }

    /**
     * Sterker dan "er is geen overloop": staat het bedrag er ook echt binnen?
     * Dit is wat een gebruiker mist als het misgaat.
     */
    test('en het totaal staat binnen de rand, niet erbuiten', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        const app = ui(page);
        await app.itemPrice().fill('100');

        const sectie = await page.locator('.preview-section').boundingBox();
        const totaal = await app.preview.locator('text=/Totaal:/').last().boundingBox();

        expect(totaal!.x + totaal!.width).toBeLessThanOrEqual(sectie!.x + sectie!.width);
    });

    /**
     * Op een telefoon juist níet verkleinen. 800px naar 390px is bijna
     * halveren, en dan is de factuur onleesbaar; daar is horizontaal schuiven
     * over een leesbaar vel de betere ruil. Vandaar dat het verkleinen pas
     * vanaf de tweekolomsindeling aan staat.
     */
    test('op een telefoon blijft het vel op ware grootte', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const zoom = await page.locator('.preview-wrapper .invoice-preview')
            .evaluate((el) => getComputedStyle(el).zoom);
        expect(['1', 'normal']).toContain(zoom);
    });
});

test.describe('de tagline', () => {
    /**
     * Stond eerder op max-width 600px terwijl de zin er 724px nodig heeft: hij
     * brak dus af op elk scherm, ook op een breedbeeldmonitor.
     *
     * Dit is ook de reden dat de ondertitel uit twee alinea's bestaat en niet uit
     * één lange zin: alles bij elkaar wordt langer dan 83 tekens, en dan past het
     * niet meer op de smalle laptop hieronder.
     */
    test('past op één regel op een normaal scherm', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        expect(await lineCount(page, TAGLINE)).toBe(1);
    });

    test('past ook op een smalle laptop op één regel', async ({ page }) => {
        await page.setViewportSize({ width: 820, height: 900 });
        expect(await lineCount(page, TAGLINE)).toBe(1);
    });

    test('breekt af op een telefoon, zonder horizontaal te scrollen', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await lineCount(page, TAGLINE)).toBeGreaterThan(1);

        const overflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
    });
});

/**
 * De ondertitel draagt vier beloften, en alle vier horen vastgezet: wat het
 * kost, voor welke markt het is, dat de e-factuur erin zit, en dat er niets de
 * browser verlaat. Die laatste is de sterkste die deze app heeft en stond
 * eerder alleen in de voettekst.
 */
test('noemt in de tagline wat het kost, voor wie het is, en wat er niet gebeurt', async ({ page }) => {
    const kop = page.locator('header');
    await expect(kop).toContainText('Gratis');
    await expect(kop).toContainText('Nederlandse btw-tarieven');
    await expect(kop).toContainText('KOR');
    // De e-factuur is de meest onderscheidende functie en stond nergens boven de vouw.
    await expect(kop).toContainText('e-facturen');
    // En de sterkste belofte, die eerder alleen in de voettekst stond.
    await expect(kop).toContainText('alles blijft in je eigen browser');
    // Het woord dat eruit moest: als enige op deze pagina niet na te gaan.
    await expect(kop).not.toContainText('Razendsnel');
});

/**
 * De footer draagt de privacybelofte en de juridische ontkenning, en verder
 * niets. Toeschrijving hoort in LICENSE en README; een auteursrechtregel in de
 * interface zou bovendien een jaartal nodig hebben, en dat zou in deze statisch
 * geprerenderde pagina op het bouwmoment worden gebakken en stilletjes
 * verouderen.
 *
 * Hier stond eerst dat de footer *alleen* de privacybelofte droeg en geen enkele
 * verwijzing. Dat is losgelaten voor de gebruiksvoorwaarden: die moeten ergens
 * te vinden zijn, en de voettekst is waar iemand ernaar zoekt. Waar die test om
 * begonnen was verandert niet — geen auteursrecht, geen naam, geen jaartal dat
 * veroudert — en de eis op verwijzingen is nu strakker dan ruimer: precies één,
 * en wel die ene.
 */
test('toont de privacybelofte en de voorwaarden, en geen auteursrechtregel', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toContainText('Geen opslag op servers, alles in jouw browser.');
    await expect(footer).not.toContainText('©');
    await expect(footer.locator('a')).toHaveCount(1);
    await expect(footer.locator('a')).toHaveAttribute('href', /\/voorwaarden/);
});

import { test, expect } from '@playwright/test';
import { ui, openApp } from './helpers';
import { STRIKT_BELEID } from '../lib/csp';
import { analyticsHost, GOATCOUNTER_CODE, telpixelUrl, wilGeteldWorden } from '../lib/analytics';

/**
 * De app belooft dat alles in je eigen browser blijft. Dat stond lang alleen in
 * de README, terwijl de pagina bij elke opening lettertypes bij Google ophaalde
 * en daarmee het IP-adres van de bezoeker meestuurde. Deze controles houden die
 * belofte waar.
 *
 * Let op hoe de belofte precies luidt. Sinds de bezoekersteller erbij kwam is
 * het niet meer "deze pagina doet geen enkel verzoek": er gaat één telpixel uit
 * naar GoatCounter. Wat wél overeind staat, en wat eigenlijk de hele belofte
 * was, is dat niets wat je intypt de browser verlaat. Daar gaan deze tests over.
 */
test('wat je intypt verlaat de browser niet', async ({ page }) => {
    const naarBuiten: string[] = [];
    page.on('request', (request) => {
        const url = new URL(request.url());
        const eigen = url.hostname === 'localhost' || url.protocol === 'data:' || url.protocol === 'blob:';
        if (!eigen) naarBuiten.push(request.url());
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.clientName.fill('Geheime Klant BV');
    await app.itemDescription().fill('Vertrouwelijke opdracht');
    await app.itemPrice(0).fill('100');
    await Promise.all([page.waitForEvent('download'), app.downloadPdf.click()]);
    await page.waitForTimeout(500);

    // Zonder NEXT_PUBLIC_GOATCOUNTER gaat er helemaal niets uit, en zo draait
    // de testsuite. Gaat er toch iets, dan mag daar in elk geval niets van het
    // document in staan — dat is de belofte die telt.
    for (const url of naarBuiten) {
        expect(url, `${url} mag alleen de teller zijn`).toContain('goatcounter.com');
        for (const geheim of ['Sonsbeek', 'Geheime', 'Vertrouwelijke', '100']) {
            expect(decodeURIComponent(url), `${geheim} staat in een verzoek naar buiten`)
                .not.toContain(geheim);
        }
    }
});

/**
 * De teller staat standaard uit, en dat is wat de testsuite en de
 * ontwikkelserver zien. Zonder dit zou een stille wijziging in de opbouw van
 * het beleid onopgemerkt een host openzetten.
 */
test('zonder GoatCounter-code gaat er helemaal niets naar buiten', async () => {
    expect(GOATCOUNTER_CODE, 'de testsuite hoort zonder teller te draaien').toBe('');
    expect(analyticsHost()).toBeNull();
    expect(STRIKT_BELEID).not.toContain('goatcounter');
});

/**
 * De teller is een afbeelding en geen script, en dat is het hele punt: deze
 * pagina houdt ontsleutelde klantgegevens vast. Een afbeelding kan daar niet
 * bij, code van een andere host wel.
 */
test('de teller mag alleen een afbeelding zijn, nooit een script', async () => {
    const regel = (naam: string) => STRIKT_BELEID.split('; ').find(r => r.startsWith(naam)) ?? '';

    expect(regel('script-src'), 'script-src noemt een host van buiten')
        .not.toMatch(/https?:/);
    expect(regel('connect-src'), 'connect-src noemt een host van buiten')
        .not.toMatch(/https?:/);

    // En als de teller aanstaat, dan uitsluitend via img-src.
    if (analyticsHost()) {
        expect(regel('img-src')).toContain('goatcounter.com');
    }
});

test('de telpixel draagt het bezoek over, niet het document', async () => {
    // Zonder code is er geen URL; dan valt er ook niets te lekken.
    const url = telpixelUrl(
        { pathname: '/facturen/', search: '?klant=geheim' },
        'https://news.ycombinator.com/item?id=123',
        { width: 1920, height: 1080, pixelRatio: 2 },
    );
    if (!url) {
        expect(analyticsHost()).toBeNull();
        return;
    }

    expect(url).toContain('p=%2Ffacturen%2F');
    // Alleen de herkomst, niet de hele verwijzende URL met zijn parameters.
    expect(url).toContain('r=news.ycombinator.com');
    expect(url).not.toContain('id=123');
    // En niets uit de queryparameters van de eigen pagina.
    expect(url).not.toContain('geheim');
});

test('een bezoeker die niet geteld wil worden, wordt niet geteld', async () => {
    expect(wilGeteldWorden({ doNotTrack: '1' } as Navigator)).toBe(false);
    expect(wilGeteldWorden({ globalPrivacyControl: true } as unknown as Navigator)).toBe(false);
    expect(wilGeteldWorden({} as Navigator)).toBe(true);
});

test('de lettertypes komen van de site zelf', async ({ page }) => {
    const fonts: string[] = [];
    page.on('response', (r) => {
        if (/\.(woff2?|ttf|otf)(\?|$)/.test(r.url())) fonts.push(r.url());
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    expect(fonts.length, 'geen lettertype geladen').toBeGreaterThan(0);
    for (const font of fonts) {
        expect(font, `${font} komt niet van de site zelf`).toContain('localhost');
    }
});

/**
 * Het beleid dat gebruikers krijgen, los van de losser versie waarmee de
 * ontwikkelserver draait. Daarom hier de string zelf en niet de pagina.
 */
test('het gepubliceerde beleid laat niets naar het netwerk', async () => {
    expect(STRIKT_BELEID).toContain("default-src 'self'");
    expect(STRIKT_BELEID).toContain("form-action 'none'");
    expect(STRIKT_BELEID).toContain("base-uri 'none'");

    // De kern: connect-src mag geen enkele herkomst op het netwerk noemen.
    // data: mag wel — dat draagt zijn eigen inhoud mee en gaat nergens heen.
    const connect = STRIKT_BELEID.split('; ').find(r => r.startsWith('connect-src'))!;
    expect(connect).toBeTruthy();
    expect(connect, `connect-src laat het netwerk toe: ${connect}`)
        .not.toMatch(/https?:|wss?:|\*|'self'/);

    // Echte eval blijft buiten de deur; alleen WebAssembly is toegestaan.
    expect(STRIKT_BELEID).not.toMatch(/'unsafe-eval'/);
    expect(STRIKT_BELEID).toContain("'wasm-unsafe-eval'");
});

/**
 * worker-src moet er expliciet in staan.
 *
 * Zonder die regel valt hij terug op script-src, waar blob: niet in staat — en
 * dan mislukt Download PDF volledig zodra er een logo op het document staat,
 * want react-pdf verwerkt de afbeelding in een worker uit een blob-URL. Dat
 * heeft live gestaan. Alleen eigen herkomsten, geen host van buiten.
 */
test('het beleid staat een eigen worker toe, en niets van buiten', async () => {
    const worker = STRIKT_BELEID.split('; ').find(r => r.startsWith('worker-src'));
    expect(worker, 'worker-src ontbreekt en valt dan terug op script-src').toBeTruthy();
    expect(worker).toContain('blob:');
    expect(worker, 'worker-src noemt een host van buiten').not.toMatch(/https?:/);
});

test('de pagina draagt een beleid mee', async ({ page }) => {
    await openApp(page);
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(policy).toContain("default-src 'self'");
});

test('de pagina werkt zonder dat de CSP iets blokkeert', async ({ page }) => {
    const geblokkeerd: string[] = [];
    page.on('console', (m) => {
        if (/Content Security Policy|Refused to/i.test(m.text())) geblokkeerd.push(m.text());
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    const app = ui(page);
    await app.itemPrice(0).fill('100');
    await Promise.all([page.waitForEvent('download'), app.downloadPdf.click()]);
    await page.waitForTimeout(500);

    expect(geblokkeerd, geblokkeerd.join(' | ')).toEqual([]);
    expect(await app.preview.innerText()).toContain('121,00');
});

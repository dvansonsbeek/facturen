import { test, expect } from '@playwright/test';
import { ui } from './helpers';
import { STRIKT_BELEID } from '../lib/csp';

/**
 * De app belooft dat alles in je eigen browser blijft. Dat stond lang alleen in
 * de README, terwijl de pagina bij elke opening lettertypes bij Google ophaalde
 * en daarmee het IP-adres van de bezoeker meestuurde. Deze controles houden die
 * belofte waar.
 */
test('doet geen enkel verzoek buiten de eigen site', async ({ page }) => {
    const extern: string[] = [];
    page.on('request', (request) => {
        const url = new URL(request.url());
        const eigen = url.hostname === 'localhost' || url.protocol === 'data:' || url.protocol === 'blob:';
        if (!eigen) extern.push(request.url());
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.itemPrice(0).fill('100');
    await Promise.all([page.waitForEvent('download'), app.downloadPdf.click()]);
    await page.waitForTimeout(500);

    expect(extern, `verzoeken naar buiten: ${extern.join(', ')}`).toEqual([]);
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

test('de pagina draagt een beleid mee', async ({ page }) => {
    await page.goto('/');
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

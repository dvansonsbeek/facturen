/**
 * Controleert de gepubliceerde build, niet de ontwikkelserver.
 *
 * Nodig omdat het beveiligingsbeleid (lib/csp.ts) tijdens ontwikkelen bewust
 * losser staat: React heeft daar eval() nodig en Next een websocket. Een fout
 * in het strenge beleid merk je dus pas na publicatie. Dat gebeurde bijna: de
 * PDF-generator haalt een stukje WebAssembly als data-URL op, en met
 * `connect-src 'none'` mislukte Download PDF alleen in de echte versie.
 *
 * Draait na `npm run build` en serveert out/ zelf, zonder extra pakket.
 */
import { chromium } from '@playwright/test';
import { startServer, voorvoegsel } from './statische-server.mjs';

const POORT = 4173;

// De publicatiebuild staat onder /facturen (zie next.config.ts), dus de pagina
// vraagt haar bestanden op als /facturen/_next/... terwijl ze in out/_next/...
// liggen. De server haalt dat voorvoegsel eraf; zonder dat geeft elke asset een
// 404 en laadt de pagina zonder JavaScript — dan meet deze controle niets.
const VOORVOEGSEL = voorvoegsel();

let server;
try {
    server = await startServer(POORT);
} catch (fout) {
    console.error(fout.message);
    process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });

const problemen = [];
page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) problemen.push(`CSP blokkeert: ${m.text().slice(0, 140)}`);
});
page.on('pageerror', (e) => problemen.push(`fout op de pagina: ${e.message.slice(0, 140)}`));
/**
 * Eén uitzondering op "niets gaat naar buiten": de bezoekersteller
 * (lib/analytics.ts). Die mag, en alleen die — en er mag niets in staan van wat
 * er op het document is ingevuld. Daarom niet simpelweg toegestaan maar
 * nagelopen op de gegevens die we hierboven invullen.
 */
const GEHEIMEN = ['Sonsbeek', 'Geheimeklant', 'Vertrouwelijk'];
page.on('request', (r) => {
    const url = new URL(r.url());
    const binnen = url.hostname === 'localhost' || ['data:', 'blob:'].includes(url.protocol);
    if (binnen) return;

    if (!url.hostname.endsWith('.goatcounter.com')) {
        problemen.push(`verzoek naar buiten: ${r.url().slice(0, 100)}`);
        return;
    }
    const leesbaar = decodeURIComponent(r.url());
    for (const geheim of GEHEIMEN) {
        if (leesbaar.includes(geheim)) {
            problemen.push(`de teller stuurt documentgegevens mee (${geheim}): ${leesbaar.slice(0, 120)}`);
        }
    }
});
// Een gemiste asset is stil: de pagina laadt, alleen zonder JavaScript. Zo
// kwam het basePath-voorvoegsel hier binnen, dus noem het bij naam.
page.on('response', (r) => {
    if (r.status() === 404) problemen.push(`404: ${r.url().slice(0, 100)}`);
});

await page.goto(`http://localhost:${POORT}${VOORVOEGSEL}/`, { waitUntil: 'networkidle' });
// Herkenbare namen, zodat hierboven te zien is of er iets van het document
// meelift in een verzoek naar buiten.
await page.locator('input[placeholder="Mijn Bedrijf BV"]').fill('Sonsbeek Advies BV');
await page.locator('input[placeholder="Naam van de klant"]').fill('Geheimeklant BV');
await page.locator('textarea[placeholder="Omschrijving goederen/ diensten"]').first().fill('Vertrouwelijk werk');
await page.locator('input[placeholder="Eenheidsprijs"]').first().fill('100');

try {
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        page.getByRole('button', { name: /Download PDF/i }).click(),
    ]);
    console.log(`  PDF gedownload: ${download.suggestedFilename()}`);
} catch {
    problemen.push('Download PDF leverde geen bestand op');
}

const voorbeeld = (await page.locator('.invoice-preview').innerText()).replace(/ /g, ' ');
if (!voorbeeld.includes('€ 121,00')) problemen.push('het voorbeeld rekent niet goed');

await browser.close();
server.close();

if (problemen.length) {
    console.error('\nDe gepubliceerde versie is niet in orde:');
    for (const p of problemen) console.error(`  - ${p}`);
    process.exit(1);
}
console.log('  geen verzoeken naar buiten, niets geblokkeerd, PDF werkt.');

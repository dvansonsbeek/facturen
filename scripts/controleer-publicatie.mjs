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
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from '@playwright/test';

const WORTEL = new URL('../out', import.meta.url).pathname;
const POORT = 4173;

// De publicatiebuild staat onder /facturen (zie next.config.ts), dus de pagina
// vraagt haar bestanden op als /facturen/_next/... terwijl ze in out/_next/...
// liggen. Zonder dit voorvoegsel eraf te halen geeft elke asset een 404 en
// laadt de pagina zonder JavaScript — dan meet deze controle niets.
const VOORVOEGSEL = process.env.PAGES_BASE_PATH ?? '';

if (!existsSync(WORTEL)) {
    console.error('out/ bestaat niet — draai eerst `npm run build`.');
    process.exit(1);
}

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.woff2': 'font/woff2', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
    let pad = decodeURIComponent((req.url || '/').split('?')[0]);
    if (VOORVOEGSEL && pad.startsWith(VOORVOEGSEL)) pad = pad.slice(VOORVOEGSEL.length) || '/';
    let bestand = join(WORTEL, normalize(pad).replace(/^(\.\.[/\\])+/, ''));
    if (pad.endsWith('/')) bestand = join(bestand, 'index.html');
    try {
        const inhoud = await readFile(bestand);
        res.writeHead(200, { 'Content-Type': TYPES[extname(bestand)] ?? 'application/octet-stream' });
        res.end(inhoud);
    } catch {
        res.writeHead(404).end('niet gevonden');
    }
});

await new Promise(klaar => server.listen(POORT, klaar));

const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });

const problemen = [];
page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) problemen.push(`CSP blokkeert: ${m.text().slice(0, 140)}`);
});
page.on('pageerror', (e) => problemen.push(`fout op de pagina: ${e.message.slice(0, 140)}`));
page.on('request', (r) => {
    const url = new URL(r.url());
    const binnen = url.hostname === 'localhost' || ['data:', 'blob:'].includes(url.protocol);
    if (!binnen) problemen.push(`verzoek naar buiten: ${r.url().slice(0, 100)}`);
});
// Een gemiste asset is stil: de pagina laadt, alleen zonder JavaScript. Zo
// kwam het basePath-voorvoegsel hier binnen, dus noem het bij naam.
page.on('response', (r) => {
    if (r.status() === 404) problemen.push(`404: ${r.url().slice(0, 100)}`);
});

await page.goto(`http://localhost:${POORT}${VOORVOEGSEL}/`, { waitUntil: 'networkidle' });
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

/**
 * Serveert out/ zoals GitHub Pages dat doet.
 *
 * Twee dingen gebruiken hem: de korte publicatiecontrole
 * (controleer-publicatie.mjs) en de UAT-reis
 * (playwright.productie.config.ts). Allebei moeten tegen de échte
 * publicatiebuild draaien, en die staat onder een voorvoegsel — zonder dat
 * eraf te halen geeft elke asset een 404 en laadt de pagina zonder JavaScript.
 *
 * Rechtstreeks aanroepen laat hem luisteren tot je hem afbreekt; dat is wat
 * Playwright's webServer doet. Importeren geeft `startServer` terug.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
    '.woff2': 'font/woff2', '.txt': 'text/plain', '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
};

export const WORTEL = new URL('../out', import.meta.url).pathname;

/** Het voorvoegsel waaronder de gepubliceerde build staat, bijvoorbeeld /facturen. */
export const voorvoegsel = () => process.env.PAGES_BASE_PATH ?? '';

export const startServer = async (poort) => {
    if (!existsSync(WORTEL)) {
        throw new Error('out/ bestaat niet — draai eerst `npm run build`.');
    }

    const prefix = voorvoegsel();
    const server = createServer(async (req, res) => {
        let pad = decodeURIComponent((req.url || '/').split('?')[0]);
        if (prefix && pad.startsWith(prefix)) pad = pad.slice(prefix.length) || '/';

        let bestand = join(WORTEL, normalize(pad).replace(/^(\.\.[/\\])+/, ''));
        if (pad.endsWith('/')) bestand = join(bestand, 'index.html');

        // Zoals Pages het doet: /voorwaarden komt uit voorwaarden.html. De
        // statische export schrijft een route naast de map, niet erin — naast
        // voorwaarden.html staat een map voorwaarden/ met alleen de
        // RSC-payloads, dus zonder deze regel geeft elke route behalve de
        // hoofdpagina een 404. Dat viel niet eerder op omdat er maar één pagina
        // was, en het zou hier een dode verwijzing hebben opgeleverd.
        // Let op: niet eerst kijken of `bestand` bestaat. Naast voorwaarden.html
        // schrijft de export ook een map voorwaarden/, dus dat pad bestáát — als
        // map, en readFile struikelt erover. Zonder extensie willen we altijd
        // .html of /index.html, nooit het kale pad.
        if (!extname(bestand)) {
            bestand = existsSync(`${bestand}.html`)
                ? `${bestand}.html`
                : join(bestand, 'index.html');
        }

        try {
            const inhoud = await readFile(bestand);
            res.writeHead(200, {
                'Content-Type': TYPES[extname(bestand)] ?? 'application/octet-stream',
            });
            res.end(inhoud);
        } catch {
            res.writeHead(404).end('niet gevonden');
        }
    });

    await new Promise(klaar => server.listen(poort, klaar));
    return server;
};

// Rechtstreeks aangeroepen: luisteren en blijven staan.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const poort = Number(process.env.POORT ?? 4173);
    await startServer(poort);
    console.log(`out/ staat op http://localhost:${poort}${voorvoegsel()}/`);
}

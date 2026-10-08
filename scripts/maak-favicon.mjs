/**
 * Maakt public/favicon.ico uit app/icon.svg.
 *
 * Waarom er naast de SVG ook een .ico ligt: een browser leest de
 * <link rel="icon"> uit de HTML en krijgt dan de SVG, die op elke maat scherp
 * is. Maar een hoop gereedschap leest die HTML niet en vraagt botweg
 * /favicon.ico op het hoofdadres — crawlers, feedlezers, dingen die een
 * verwijzing uitpakken. Dat gaf een 404.
 *
 * Hij staat in public/ en niet in app/, en dat is bewust: in app/ zou Next er
 * een tweede <link> bij zetten en gaan browsers kiezen tussen de twee. Nu
 * blijft de kop van de pagina onveranderd en is de .ico er alleen voor wie hem
 * blind ophaalt.
 *
 * Geen nieuwe afhankelijkheid: de Chromium die Playwright al meebrengt tekent
 * de SVG op drie maten, en een .ico is niet meer dan een kopregel met een
 * inhoudsopgave en daarachter de PNG's zelf. PNG-in-ICO leest alles sinds IE11.
 *
 * Draaien na elke wijziging aan app/icon.svg:  npm run maak:favicon
 * Dat gaat niet vanzelf — het bestand staat in de repo, dus als je het vergeet
 * loopt het icoon stilletjes uit de pas met de SVG. tests/vindbaarheid.spec.ts
 * bewaakt dát hij er is, niet dat hij bij is.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const wortel = join(dirname(fileURLToPath(import.meta.url)), '..');
const bron = join(wortel, 'app', 'icon.svg');
const doel = process.argv[2] ?? join(wortel, 'public', 'favicon.ico');

/** 16 voor het tabblad, 32 voor de snelkoppeling, 48 voor Windows. */
const MATEN = [16, 32, 48];

const svg = readFileSync(bron, 'utf8');
const browser = await chromium.launch();
const plaatjes = [];

for (const maat of MATEN) {
    const page = await browser.newPage({ viewport: { width: maat, height: maat } });
    // De SVG precies op de viewport, zonder marges en met een doorzichtige
    // achtergrond: de blauwe tegel met ronde hoeken zit al in de SVG zelf.
    // De vaste width/height van 32 moet eruit, anders schaalt hij niet mee.
    await page.setContent(
        '<!doctype html><meta charset="utf-8">'
        + `<style>html,body{margin:0;padding:0;background:transparent}`
        + `svg{display:block;width:${maat}px;height:${maat}px}</style>`
        + svg.replace(/\s*width="32"\s*height="32"/, ''),
    );
    plaatjes.push({ maat, png: await page.screenshot({ omitBackground: true }) });
    await page.close();
}
await browser.close();

// ICONDIR: 6 bytes, gevolgd door een ICONDIRENTRY van 16 bytes per plaatje.
const kop = Buffer.alloc(6);
kop.writeUInt16LE(0, 0);                 // gereserveerd, altijd nul
kop.writeUInt16LE(1, 2);                 // 1 = icoon (2 zou een cursor zijn)
kop.writeUInt16LE(plaatjes.length, 4);

let plek = 6 + 16 * plaatjes.length;
const regels = [];
for (const { maat, png } of plaatjes) {
    const regel = Buffer.alloc(16);
    regel.writeUInt8(maat === 256 ? 0 : maat, 0);   // breedte; 0 betekent 256
    regel.writeUInt8(maat === 256 ? 0 : maat, 1);   // hoogte
    regel.writeUInt8(0, 2);                          // kleuren in het palet: geen
    regel.writeUInt8(0, 3);                          // gereserveerd
    regel.writeUInt16LE(1, 4);                       // kleurvlakken
    regel.writeUInt16LE(32, 6);                      // bits per pixel
    regel.writeUInt32LE(png.length, 8);
    regel.writeUInt32LE(plek, 12);
    regels.push(regel);
    plek += png.length;
}

const uit = Buffer.concat([kop, ...regels, ...plaatjes.map((p) => p.png)]);
writeFileSync(doel, uit);
console.log(`  ${doel}: ${uit.length} bytes, ${plaatjes.length} maten `
    + `(${MATEN.join(', ')})`);

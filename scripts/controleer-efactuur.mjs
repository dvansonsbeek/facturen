/**
 * Haalt de e-factuur door de officiële validator.
 *
 * ## Waarom dit er los van de testsuite staat
 *
 * tests/ubl.spec.ts is door mij geschreven, net als lib/ubl.ts. Die tests
 * kunnen dus alleen bevestigen wat ik zelf al dacht. De Schematron van SI-UBL
 * is een onafhankelijke bron: hij vuurde 86 regels af op een gewone factuur,
 * waaronder er twee die eisen die ik op eigen gezag had ingebouwd (BR-NL-1 voor
 * het KvK-nummer van de afzender, BR-NL-2 voor de klantreferentie) blijken te
 * zijn — en niet mijn eigen voorkeur.
 *
 * ## En waarom de eigen tests toch blijven
 *
 * De validator ziet het verschil tussen vrijgesteld (categorie E) en het
 * nultarief (Z) **niet**: beide zijn geldige UBL, en of déze factuur
 * vrijgesteld is, is een vraag over de Wet OB die geen schema kan beantwoorden.
 * Nagegaan door een KOR-factuur als Z aan te bieden: de validator keurt hem
 * goed. Precies de fout waar deze app om bestaat, dus die blijft in
 * tests/ubl.spec.ts. De twee vullen elkaar aan en vervangen elkaar niet.
 *
 * ## Hoe
 *
 * Saxon-HE (MPL-2.0) draait de voorgecompileerde XSLT van de Nederlandse
 * Peppolautoriteit (MIT, Stichting Simplerinvoicing). Beide op een vaste versie
 * en pas op het moment van gebruik opgehaald, in een map die buiten git blijft:
 * zes megabyte aan jar en stylesheet horen niet in deze repo, en een vaste
 * versie betekent dat een nieuwe regelset de build niet onaangekondigd breekt.
 *
 * De facturen komen uit de échte app in out/, niet uit een nabouw: anders
 * controleer je iets anders dan wat gebruikers downloaden.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { startServer, voorvoegsel } from './statische-server.mjs';

const uitvoeren = promisify(execFile);
const require = createRequire(import.meta.url);

const CACHE = new URL('../.validatie-cache/', import.meta.url).pathname;
const POORT = 4175;

/** Vaste versies: reproduceerbaar, en geen regelwijziging die ineens binnenvalt. */
const SAXON = {
    url: 'https://repo1.maven.org/maven2/net/sf/saxon/Saxon-HE/10.9/Saxon-HE-10.9.jar',
    bestand: 'saxon-he-10.9.jar',
};
const SI_UBL = {
    // Let op: Saxon-HE 11 en 12 hebben xmlresolver op het klassenpad nodig;
    // 10.9 is één bestand en draait zonder meer.
    url: 'https://raw.githubusercontent.com/peppolautoriteit-nl/validation/2026-05-21/xsl/si-ubl-2.0.xsl',
    bestand: 'si-ubl-2.0-2026-05-21.xsl',
};

/**
 * De schema's, voor de volgordecontrole hieronder.
 *
 * UBL is een vaste reeks: de elementen moeten in de volgorde staan die het
 * schema voorschrijft. Schematron kijkt daar niet naar — dat is het werk van de
 * XSD — en een XSD-validator is hier niet beschikbaar. De volgorde is daarom
 * twee keer met de hand nagelopen, bij het toevoegen van cac:Delivery en bij de
 * creditnota. Dat schaalt niet: de volgende wijziging in lib/ubl.ts kan de
 * volgorde breken terwijl de Schematron, alle tests en de publicatiecontrole
 * groen blijven. Vandaar deze controle.
 */
const SCHEMAS = {
    Invoice: {
        url: 'https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-Invoice-2.1.xsd',
        bestand: 'UBL-Invoice-2.1.xsd',
    },
    CreditNote: {
        url: 'https://docs.oasis-open.org/ubl/os-UBL-2.1/xsd/maindoc/UBL-CreditNote-2.1.xsd',
        bestand: 'UBL-CreditNote-2.1.xsd',
    },
};

const haalOp = async ({ url, bestand }) => {
    const pad = `${CACHE}${bestand}`;
    if (existsSync(pad)) return pad;
    process.stdout.write(`  ${bestand} ophalen… `);
    const antwoord = await fetch(url);
    if (!antwoord.ok) throw new Error(`${url} gaf ${antwoord.status}`);
    await writeFile(pad, Buffer.from(await antwoord.arrayBuffer()));
    console.log('klaar');
    return pad;
};

/**
 * Eén factuur per geval dat zijn eigen regels raakt: BR-S-* bij gewone
 * tarieven, BR-E-* bij een vrijstelling, BR-AE-* bij verlegging, BR-IC-* bij
 * een intracommunautaire levering, BR-G-* bij uitvoer, BR-Z-* bij een regel op
 * 0%, en cac:Delivery zodra er een leverdatum op staat. Juist die regels eisen
 * soms extra gegevens, en dat is niet iets om zelf te verzinnen.
 */
const GEVALLEN = {
    normaal: async (page) => {
        await page.getByRole('button', { name: 'Item Toevoegen' }).click();
        await page.locator('textarea[placeholder="Omschrijving goederen/ diensten"]').nth(1).fill('Handboek');
        await page.locator('input[placeholder="Aantal"]').nth(1).fill('2');
        await page.locator('input[placeholder="Eenheidsprijs"]').nth(1).fill('24.95');
        await page.locator('.item-row select').nth(1).selectOption('9');
    },
    kor: (page) => page.locator('#btwRegime').selectOption('kor'),
    verlegd: (page) => page.locator('#btwRegime').selectOption('verlegd'),
    icp: async (page) => {
        // Een intracommunautaire levering gaat naar een ánder EU-land; met een
        // Nederlandse klant weigert de app de export, en terecht.
        await page.locator('#klant-land').fill('Duitsland');
        await page.locator('#btwRegime').selectOption('icp');
    },
    export: async (page) => {
        await page.locator('#klant-land').fill('Zwitserland');
        await page.locator('#btwRegime').selectOption('export');
    },
    /**
     * Een dienst buiten de EU: UBL-categorie O, en die loopt heel anders door
     * lib/ubl.ts dan de rest.
     *
     * Dit geval staat er om twee regels die geen enkele andere factuur raakt, en
     * die allebei stuk gingen voordat de code klopte:
     *
     * - BR-O-05 verbiedt een tarief op zo'n regel, ook 0.00.
     * - BR-O-02 verbiedt élk btw-identificatienummer in het bestand: dat van de
     *   leverancier én dat van de klant. De vorige standaardklant heeft er een,
     *   dus die moet hier weg om te toetsen wat de app werkelijk doet.
     *
     * Blijft BR-NL-1 hierbij overeind? Ja, en dat is precies wat dit geval
     * bewaakt: de leverancier is herkenbaar aan zijn KvK-nummer. Ging dat niet
     * op, dan was categorie O voor deze app onbruikbaar.
     */
    'dienst-buiten-eu': async (page) => {
        await page.locator('#klant-land').fill('Zwitserland');
        await page.locator('#klant-btw').fill('');
        await page.locator('#btwRegime').selectOption('dienst-buiten-eu');
    },
    // Het nultarief is geen eigen regime: het gewone regime met een regel op 0%
    // levert categorie Z. BR-Z-* hoort dus langs dít pad getoetst te worden.
    nultarief: (page) => page.locator('.item-row select').first().selectOption('0'),
    // Een leverdatum hoort ook op een gewone factuur (art. 35a lid 1 Wet OB);
    // in UBL is dat cac:Delivery, en die kent zijn eigen regels.
    leverdatum: (page) => page.locator('#leverdatum').fill('2026-09-15'),
    /**
     * Korting op het totaal, met twee btw-tarieven erin.
     *
     * Juist die combinatie: EN 16931 wil de korting per btw-categorie
     * uitgesplitst, en de bedragen moeten optellen tot wat er in
     * LegalMonetaryTotal staat (BR-CO-10 voor de regels, BR-CO-13 voor de
     * korting, BR-CO-15 voor het totaal met btw). Dat kunnen wij zelf niet
     * nakijken — de validator wel, en dat is het hele punt van deze stap.
     *
     * Het bedrag is met opzet niet rond: dan moet de verdeling over 21% en 9%
     * ergens een cent opvangen, en blijkt of dat klopt.
     */
    korting: async (page) => {
        await page.getByRole('button', { name: 'Item Toevoegen' }).click();
        await page.locator('textarea[placeholder="Omschrijving goederen/ diensten"]').nth(1).fill('Handboek');
        await page.locator('input[placeholder="Aantal"]').nth(1).fill('3');
        await page.locator('input[placeholder="Eenheidsprijs"]').nth(1).fill('24.95');
        await page.locator('.item-row select').nth(1).selectOption('9');
        await page.locator('#korting').fill('33.33');
    },
    /**
     * Een creditfactuur: typecode 381 in plaats van 380, met een verwijzing
     * naar het stuk dat wordt teruggenomen. BR-55 wil die verwijzing, en de
     * bedragen horen positief te blijven.
     *
     * Hij komt uit het archief, want zo maak je er een: eerst bewaren, dan
     * crediteren.
     */
    creditfactuur: async (page) => {
        await page.getByRole('button', { name: 'Bewaren', exact: true }).click();
        await page.locator('p.form-melding').filter({ hasText: 'is bewaard' }).waitFor();

        await page.locator('details.foldout')
            .filter({ has: page.locator('h3', { hasText: 'Bewaarde documenten' }) })
            .locator('summary').click();
        await page.locator('.archief-regel').first()
            .getByRole('button', { name: 'Bekijken' }).click();
        await page.locator('dialog.archief-venster')
            .getByRole('button', { name: 'Crediteren' }).click();
        await page.locator('dialog.archief-venster').waitFor({ state: 'hidden' });
    },
};

const maakFactuur = async (browser, naam, extra) => {
    const page = await browser.newPage({ acceptDownloads: true });
    await page.goto(`http://localhost:${POORT}${voorvoegsel()}/`, { waitUntil: 'networkidle' });

    const vul = (sel, waarde) => page.locator(sel).first().fill(waarde);
    await vul('input[placeholder="Mijn Bedrijf BV"]', 'Sonsbeek Advies BV');
    await vul('input[placeholder="Straatnaam 1"]', 'Velperweg 1');
    await vul('#bedrijf-kvk', '87654321');
    await vul('input[placeholder="NL123456789B01"]', 'NL123456789B01');
    await vul('input[placeholder="info@mijnbedrijf.nl"]', 'info@sonsbeekadvies.nl');
    await vul('input[placeholder="NLxx XXXX XXXX XXXX XX"]', 'NL91ABNA0417164300');

    await vul('input[placeholder="Naam van de klant"]', 'Jansen & Zonen BV');
    await vul('input[placeholder="Straatnaam 123"]', 'Keizersgracht 10');
    await page.locator('input[placeholder="1234 AB"]').nth(1).fill('1015 CJ');
    await page.locator('input[placeholder="Amsterdam"]').nth(1).fill('Amsterdam');
    await page.locator('input[placeholder="NL123456789B01"]').nth(1).fill('NL987654321B01');
    await vul('#klant-kvk', '12345678');
    await vul('#klantreferentie', 'INKOOP-2026-77');

    await vul('textarea[placeholder="Omschrijving goederen/ diensten"]', 'Strategisch advies');
    await vul('input[placeholder="Aantal"]', '10');
    await vul('input[list="eenheden"]', 'uur');
    await vul('input[placeholder="Eenheidsprijs"]', '125');

    await extra(page);

    let download;
    try {
        [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 30_000 }),
            page.getByRole('button', { name: /E-factuur \(UBL\)/ }).click(),
        ]);
    } catch {
        // Geen bestand betekent bijna altijd dat de app de export weigert omdat
        // er iets ontbreekt. Die melding is het antwoord, niet een time-out.
        const melding = await page.locator('p[role="status"]').first()
            .innerText().catch(() => '');
        await page.close();
        throw new Error(
            `${naam}: geen e-factuur gedownload${melding ? ` — de app zegt: ${melding.trim()}` : ''}`,
        );
    }

    const pad = `${CACHE}${naam}.xml`;
    await download.saveAs(pad);
    await page.close();
    return pad;
};

/**
 * De elementvolgorde van het schema, als platte lijst.
 *
 * De reeks van een documenttype staat in de XSD als één rij verwijzingen; de
 * plek in die rij is de voorgeschreven volgorde.
 */
const schemaVolgorde = async (wortel) => {
    const xsd = await readFile(await haalOp(SCHEMAS[wortel]), 'utf8');
    const begin = xsd.indexOf(`<xsd:complexType name="${wortel}Type">`);
    const blok = xsd.slice(begin, xsd.indexOf('</xsd:complexType>', begin));
    return [...blok.matchAll(/ref="((?:cbc|cac):[A-Za-z]+)"/g)].map((m) => m[1]);
};

/**
 * De elementen direct onder de wortel, in de volgorde waarin ze voorkomen.
 *
 * Diepte meetellen is nodig: cac:PaymentTerms heeft zelf ook een cbc:Note, en
 * die staat elders in het schema dan de cbc:Note van het document zelf.
 */
const hoofdelementen = (xml, wortel) => {
    let diepte = 0;
    const gevonden = [];
    for (const m of xml.matchAll(/<(\/?)([A-Za-z]+:?[A-Za-z]*)([^>]*?)(\/?)>/g)) {
        const [, sluit, naam, , zelfsluitend] = m;
        if (naam === wortel) { diepte = sluit ? 0 : 1; continue; }
        if (!naam.startsWith('cbc:') && !naam.startsWith('cac:')) continue;
        if (sluit) { diepte--; continue; }
        if (diepte === 1) gevonden.push(naam);
        if (!zelfsluitend) diepte++;
    }
    return gevonden;
};

/** Loopt de volgorde na en geeft terug wat er niet klopt. */
const volgordeProblemen = async (naam, xml) => {
    const wortel = xml.includes('<CreditNote ') ? 'CreditNote' : 'Invoice';
    const volgorde = await schemaVolgorde(wortel);

    const problemen = [];
    let vorige = -1;
    let vorigeNaam = '';
    for (const element of hoofdelementen(xml, wortel)) {
        const plek = volgorde.indexOf(element);
        if (plek === -1) {
            problemen.push(`${naam} — ${element} hoort niet in een ${wortel}`);
        } else if (plek < vorige) {
            problemen.push(`${naam} — ${element} staat na ${vorigeNaam}, maar hoort ervóór`);
        } else {
            vorige = plek;
            vorigeNaam = element;
        }
    }
    return problemen;
};

/** Leest de SVRL-uitvoer met de DOMParser van de browser die al openstaat. */
const overtredingen = (page, svrl) =>
    page.evaluate((svrl) => {
        const S = 'http://purl.oclc.org/dsdl/svrl';
        const doc = new DOMParser().parseFromString(svrl, 'application/xml');
        if (doc.querySelector('parsererror')) return [{ id: 'svrl', tekst: 'onleesbare SVRL' }];
        // successful-report telt ook mee: in Schematron is dat een melding die
        // afgaat als er iets mis is, niet een geslaagde controle.
        return [
            ...doc.getElementsByTagNameNS(S, 'failed-assert'),
            ...doc.getElementsByTagNameNS(S, 'successful-report'),
        ].map((el) => ({
            id: el.getAttribute('id') ?? '?',
            locatie: el.getAttribute('location') ?? '?',
            tekst: (el.getElementsByTagNameNS(S, 'text')[0]?.textContent ?? '')
                .replace(/\s+/g, ' ').trim(),
        }));
    }, svrl);

const java = async () => {
    try {
        await uitvoeren('java', ['-version']);
        return true;
    } catch {
        return false;
    }
};

if (!existsSync(new URL('../out', import.meta.url).pathname)) {
    console.error('out/ bestaat niet — draai eerst `npm run build`.');
    process.exit(1);
}
if (!await java()) {
    console.error(
        'Java niet gevonden. De officiële SI-UBL-validator is een XSLT 2.0-stylesheet\n'
        + 'en heeft Saxon nodig. Installeer een JRE (apt install default-jre) of sla\n'
        + 'deze controle over; `npm test` dekt de eigen e-factuurtests wel.',
    );
    process.exit(1);
}

await mkdir(CACHE, { recursive: true });
const saxon = await haalOp(SAXON);
const xsl = await haalOp(SI_UBL);

const server = await startServer(POORT);
const { chromium } = require('@playwright/test');
const browser = await chromium.launch();

const problemen = [];
try {
    for (const [naam, extra] of Object.entries(GEVALLEN)) {
        const xml = await maakFactuur(browser, naam, extra);
        const svrlPad = `${CACHE}${naam}.svrl`;
        await uitvoeren('java', ['-jar', saxon, `-s:${xml}`, `-xsl:${xsl}`, `-o:${svrlPad}`]);

        const page = await browser.newPage();
        const gevonden = await overtredingen(page, await readFile(svrlPad, 'utf8'));
        await page.close();

        // De volgorde is een aparte vraag: Schematron ziet hem niet.
        const volgorde = await volgordeProblemen(naam, await readFile(xml, 'utf8'));

        if (gevonden.length === 0 && volgorde.length === 0) {
            console.log(`  ${naam}: in orde`);
        } else {
            for (const p of gevonden) {
                problemen.push(`${naam} — ${p.id}: ${p.tekst.slice(0, 160)}`);
            }
            problemen.push(...volgorde);
        }
    }
} finally {
    await browser.close();
    server.close();
}

if (problemen.length > 0) {
    console.error('\nDe e-factuur deugt niet:');
    for (const p of problemen) console.error(`  - ${p}`);
    process.exit(1);
}
console.log(
    `  alle ${Object.keys(GEVALLEN).length} gevallen voldoen aan SI-UBL 2.0 (NLCIUS)`
    + ' en staan in de volgorde van het UBL 2.1-schema.',
);

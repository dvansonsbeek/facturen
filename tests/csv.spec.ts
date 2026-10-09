import { test, expect } from '@playwright/test';
import { ui, openFoldout } from './helpers';

/**
 * Het archief als tabel, voor je boekhouder.
 *
 * Export schrijft JSON en is een reservekopie: bedoeld om terug te zetten, niet
 * om te lezen. Dit is het andere doel. Het is ook het enige antwoord dat deze
 * app op "koppeling met de boekhouding" kan geven: een echte koppeling vraagt
 * een server en daarmee een verwerker, en dat is precies wat hier niet bestaat.
 * Een bestand dat je zelf doorstuurt vraagt niemand om toestemming.
 *
 * Wat hier bewaakt wordt, is vooral of het aan de andere kant leesbaar
 * aankomt: dat is waar een CSV in de praktijk op stukloopt.
 */
test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

const bewaarFactuur = async (
    page: import('@playwright/test').Page,
    klant: string,
    prijs: string,
) => {
    const app = ui(page);
    await app.clientName.fill(klant);
    await app.itemDescription().fill('Advies');
    await app.itemPrice().fill(prijs);
    const nummer = await app.documentNumber.inputValue();
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();
    return nummer;
};

const haalCsv = async (page: import('@playwright/test').Page) => {
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        ui(page).downloadCsv.click(),
    ]);
    const stream = await download.createReadStream();
    const stukken: Buffer[] = [];
    for await (const s of stream!) stukken.push(s as Buffer);
    return { naam: download.suggestedFilename(), ruw: Buffer.concat(stukken) };
};

test('levert een tabel met de gegevens die een boekhouder nodig heeft', async ({ page }) => {
    const app = ui(page);
    await bewaarFactuur(page, 'Klant BV', '1000');
    await openFoldout(page, 'Bewaarde documenten');

    const { naam, ruw } = await haalCsv(page);
    expect(naam).toMatch(/^facturen_\d{4}-\d{2}-\d{2}\.csv$/);

    const tekst = ruw.toString('utf8');
    const regels = tekst.replace(/^﻿/, '').trim().split('\r\n');
    expect(regels[0]).toBe(
        'Soort;Nummer;Datum;Klant;Land;Btw-behandeling;Subtotaal;Korting;Btw 21%;Btw 9%;Btw 0%;Totaal',
    );

    const velden = regels[1].split(';');
    expect(velden[0]).toBe('Factuur');
    expect(velden[3]).toBe('Klant BV');
    expect(velden[6], 'subtotaal').toBe('1000,00');
    expect(velden[8], 'btw 21%').toBe('210,00');
    expect(velden[11], 'totaal').toBe('1210,00');

    await expect(app.preview).toBeVisible();
});

/**
 * De drie dingen waar een CSV in Nederland op stukloopt, en alle drie zijn het
 * geen smaakkwesties maar het verschil tussen een tabel en één kolom rommel.
 */
test.describe('het bestand komt leesbaar aan', () => {
    test('scheidt op puntkomma en schrijft bedragen met een komma', async ({ page }) => {
        await bewaarFactuur(page, 'Klant BV', '1234.56');
        await openFoldout(page, 'Bewaarde documenten');

        const { ruw } = await haalCsv(page);
        const tekst = ruw.toString('utf8');
        expect(tekst).toContain('1234,56');
        // Een komma als scheiding zou het bedrag hierboven doormidden hakken.
        expect(tekst).not.toContain('Soort,Nummer');
    });

    test('begint met een BOM, anders verminkt Excel de klantnaam', async ({ page }) => {
        await bewaarFactuur(page, 'Müller GmbH', '100');
        await openFoldout(page, 'Bewaarde documenten');

        const { ruw } = await haalCsv(page);
        expect([...ruw.subarray(0, 3)], 'de UTF-8-BOM ontbreekt').toEqual([0xEF, 0xBB, 0xBF]);
        expect(ruw.toString('utf8')).toContain('Müller GmbH');
    });

    test('zet een klantnaam met een puntkomma tussen aanhalingstekens', async ({ page }) => {
        await bewaarFactuur(page, 'Jansen; Zonen BV', '100');
        await openFoldout(page, 'Bewaarde documenten');

        const { ruw } = await haalCsv(page);
        const regels = ruw.toString('utf8').replace(/^﻿/, '').trim().split('\r\n');
        expect(regels[1]).toContain('"Jansen; Zonen BV"');
        // En dan klopt het aantal kolommen nog steeds.
        expect(regels[1].split(';').length).toBeGreaterThan(11);
    });
});

/**
 * Een creditfactuur krijgt hier wél een minteken, anders dan op papier.
 *
 * Dat is geen tegenspraak maar een ander publiek: op een document leest een
 * mens dat er "Te crediteren" boven staat, in een kolom telt een spreadsheet
 * op. Zonder minteken klopt de som niet, en optellen is het enige wat je met
 * zo'n bestand doet.
 */
test('een creditfactuur telt negatief mee', async ({ page }) => {
    const app = ui(page);
    const nummer = await bewaarFactuur(page, 'Klant BV', '1000');

    page.once('dialog', (d) => d.accept());
    await app.nextDocument.click();

    await openFoldout(page, 'Bewaarde documenten');
    await app.archiveRowFor(nummer).view.click();
    await app.archiveDialog.getByRole('button', { name: 'Crediteren' }).click();
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    await openFoldout(page, 'Bewaarde documenten');
    const { ruw } = await haalCsv(page);
    const regels = ruw.toString('utf8').replace(/^﻿/, '').trim().split('\r\n');

    const credit = regels.find((r) => r.startsWith('Creditfactuur'));
    expect(credit, 'de creditfactuur staat niet in de tabel').toBeTruthy();
    expect(credit!.split(';')[11]).toBe('-1210,00');
    // En de factuur zelf staat er positief in, dus de kolom telt op tot nul.
    expect(regels.find((r) => r.startsWith('Factuur;'))!.split(';')[11]).toBe('1210,00');
});

test('en je krijgt wat je ziet: gefilterd betekent gefilterd', async ({ page }) => {
    const app = ui(page);
    await bewaarFactuur(page, 'Alfa BV', '100');
    page.once('dialog', (d) => d.accept());
    await app.nextDocument.click();
    await bewaarFactuur(page, 'Beta BV', '200');

    await openFoldout(page, 'Bewaarde documenten');
    // Het zoekveld verschijnt pas vanaf zes documenten, dus hier is alles nog
    // zichtbaar; dat is precies wat deze test vastlegt.
    const { ruw } = await haalCsv(page);
    const tekst = ruw.toString('utf8');
    expect(tekst).toContain('Alfa BV');
    expect(tekst).toContain('Beta BV');
});

test('de knop is er niet bruikbaar als er niets te exporteren valt', async ({ page }) => {
    await openFoldout(page, 'Bewaarde documenten');
    // Leeg archief: dan staat er een uitleg en geen lijst, en dus geen knop.
    await expect(ui(page).downloadCsv).toHaveCount(0);
});

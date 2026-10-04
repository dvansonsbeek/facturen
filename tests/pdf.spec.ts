import { test, expect } from '@playwright/test';
import { ui } from './helpers';
import { extractPdfText, extractPdfPages } from './pdf-text';

/** Klikt op Download PDF en geeft de tekstlaag van het resultaat terug. */
const downloadPdf = async (page: import('@playwright/test').Page) => {
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        ui(page).downloadPdf.click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);

    const buffer = Buffer.concat(chunks);
    return {
        filename: download.suggestedFilename(),
        text: await extractPdfText(buffer),
        pages: await extractPdfPages(buffer),
    };
};

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('levert een PDF met selecteerbare tekst, niet een afbeelding', async ({ page }) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.companyVat.fill('NL123456789B01');
    await app.companyKvk.fill('87654321');
    await app.clientName.fill('Klant A');
    await app.itemName().fill('Webdesign');
    await app.itemPrice().fill('100');

    const { text } = await downloadPdf(page);

    // Tekst uit de PDF halen lukt alleen als er een echte tekstlaag in zit.
    expect(text).toContain('Sonsbeek Advies BV'.toUpperCase());
    expect(text).toContain('BTW: NL123456789B01');
    expect(text).toContain('KvK: 87654321');
    expect(text).toContain('Klant A');
    expect(text).toContain('Webdesign');
});

test('zet de datums in Nederlandse notatie', async ({ page }) => {
    const iso = new Date().toISOString().slice(0, 10);
    const { text } = await downloadPdf(page);
    expect(text).toContain(`Datum: ${iso.split('-').reverse().join('-')}`);
    expect(text).not.toContain(`Datum: ${iso}`);
    // Ook in de PDF geen vervaldatum naast de betaaltermijn.
    expect(text).not.toContain('Vervaldatum');
});

test('gebruikt een voorspelbare bestandsnaam', async ({ page }) => {
    await ui(page).documentNumber.fill('2026-042');
    const { filename } = await downloadPdf(page);
    expect(filename).toBe('factuur_2026_042.pdf');
});

test('noemt een offerte ook offerte', async ({ page }) => {
    const app = ui(page);
    await app.tab('Offerte').click();
    await app.documentNumber.fill('OFF-2026-007');

    const { filename, text } = await downloadPdf(page);
    expect(filename).toBe('offerte_off_2026_007.pdf');
    expect(text).toContain('OFFERTE');
    expect(text).toContain('OFFERTE VOOR:');
    expect(text).not.toContain('FACTUREREN AAN:');
});

test.describe('betaalinstructies onderaan elke pagina', () => {
    test('staan in de voettekst van een factuur van een pagina', async ({ page }) => {
        const app = ui(page);
        await app.iban.fill('NL91ABNA0417164300');

        const { pages } = await downloadPdf(page);
        expect(pages).toHaveLength(1);
        expect(pages[0]).toContain('Wij verzoeken u vriendelijk');
    });

    test('worden herhaald op elke pagina van een factuur van meerdere pagina\'s', async ({ page }) => {
        const app = ui(page);
        await app.iban.fill('NL91ABNA0417164300');

        // Genoeg regels om de pagina te laten overlopen.
        for (let i = 0; i < 24; i++) {
            await app.addItem.click();
        }
        await app.itemName(0).fill('Webdesign');

        const { pages } = await downloadPdf(page);
        expect(pages.length).toBeGreaterThan(1);
        for (const [index, text] of pages.entries()) {
            expect(text, `pagina ${index + 1} mist de betaalinstructies`).toContain(
                'over te maken naar rekeningnummer NL91 ABNA 0417 1643 00 ten name van',
            );
            expect(text, `pagina ${index + 1} mist het factuurnummer`).toContain(
                'Vermeld hierbij a.u.b. het factuurnummer:',
            );
        }
    });

    test('nummert de paginas van een document van meerdere paginas', async ({ page }) => {
        const app = ui(page);
        for (let i = 0; i < 24; i++) await app.addItem.click();

        const { pages } = await downloadPdf(page);
        expect(pages.length).toBeGreaterThan(1);
        pages.forEach((text, index) => {
            expect(text, `pagina ${index + 1}`).toContain(
                `pagina ${index + 1} van ${pages.length}`,
            );
        });
    });

    test('nummert een document van een pagina niet', async ({ page }) => {
        const { pages, text } = await downloadPdf(page);
        expect(pages).toHaveLength(1);
        expect(text).not.toContain('pagina 1 van 1');
    });

    /** Stempelen opent en bewaart de PDF opnieuw; dat mag niets kapotmaken. */
    test('het stempelen laat de rest van het document intact', async ({ page }) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.iban.fill('NL91ABNA0417164300');
        await app.itemName(0).fill('Advies');
        await app.itemPrice(0).fill('100');
        for (let i = 0; i < 24; i++) await app.addItem.click();

        const { text } = await downloadPdf(page);
        expect(text).toContain('SONSBEEK ADVIES BV');
        expect(text).toContain('Advies');
        expect(text).toContain('NL91 ABNA 0417 1643 00');
        expect(text).toContain('BTW (21%)');
    });

    test('een offerte krijgt geen betaalinstructies', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();

        const { text } = await downloadPdf(page);
        expect(text).not.toContain('Wij verzoeken u vriendelijk');
    });
});

test.describe('de PDF en het voorbeeld lopen niet uit elkaar', () => {
    test('toont dezelfde btw-opstelling als het voorbeeld', async ({ page }) => {
        const app = ui(page);
        await app.itemPrice().fill('100');

        const { text } = await downloadPdf(page);
        expect(text).toContain('Subtotaal:');
        expect(text).toContain('BTW (21%):');
        expect(text).toContain('121,00');
    });

    test('laat onder de KOR alle btw weg, net als het voorbeeld', async ({ page }) => {
        const app = ui(page);
        await app.itemPrice().fill('100');
        await app.korToggle.check();

        const { text } = await downloadPdf(page);
        expect(text).toContain(
            'Vrijgesteld van btw op grond van de kleineondernemersregeling (art. 25 Wet OB 1968).',
        );
        expect(text).not.toContain('BTW (');
        expect(text).not.toContain('Subtotaal');
        expect(text).toContain('100,00');
        expect(text).not.toContain('121,00');
    });

    test('toont de betaalgegevens van een factuur', async ({ page }) => {
        const app = ui(page);
        // Aaneengetypt ingevoerd: de PDF hoort hem net als het scherm te groeperen.
        await app.iban.fill('NL91ABNA0417164300');

        const { text } = await downloadPdf(page);
        expect(text).toContain('rekeningnummer NL91 ABNA 0417 1643 00 ten name van');
        expect(text).toContain('Betalingsvoorwaarden:');
    });
});

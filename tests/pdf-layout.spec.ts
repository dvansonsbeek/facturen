import { test, expect } from '@playwright/test';
import { ui } from './helpers';
import { extractPdfLayout, type PdfPageLayout } from './pdf-text';

/**
 * Opmaakcontroles op de PDF.
 *
 * De tekstcontroles in pdf.spec.ts lezen alleen wát er staat, niet wáár. Twee
 * keer op een dag is daardoor een document goedgekeurd dat niemand zou
 * versturen: één keer liep de betaalregel dwars door de tabelregels heen, en
 * één keer werd een factuur van twee pagina's er vijf, met halflege pagina's.
 * Beide keren stonden alle tekstcontroles op groen. Deze controles kijken naar
 * de posities en vangen precies dat.
 */

const maakDocument = async (page: import('@playwright/test').Page, regels: number) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.iban.fill('NL91ABNA0417164300');
    await app.clientName.fill('Jansen Bouw BV');
    for (let i = 1; i < regels; i++) await app.addItem.click();
    for (let i = 0; i < regels; i++) {
        await app.itemName(i).fill(`Dienst ${i + 1}`);
        await app.itemPrice(i).fill('125');
    }

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.downloadPdf.click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return extractPdfLayout(Buffer.concat(chunks));
};

/**
 * De onderste strook van de pagina, waar de vaste voettekst hoort te staan.
 * De pagina houdt daar 92pt voor vrij; 100 geeft wat speling.
 */
const VOETSTROOK = 100;

/** De regels van de tabel, als houvast voor "waar staat de inhoud". */
const tabelregels = (pagina: PdfPageLayout) =>
    pagina.items.filter(item => /^Dienst \d+$/.test(item.text));

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('geen tekst buiten de marges', async ({ page }) => {
    const paginas = await maakDocument(page, 25);
    const marge = 30;   // de pagina heeft 48pt padding; 30 laat wat speling

    for (const [nummer, pagina] of paginas.entries()) {
        for (const item of pagina.items) {
            expect(item.x, `pagina ${nummer + 1}: "${item.text}" links buiten beeld`)
                .toBeGreaterThanOrEqual(marge);
            expect(item.x + item.width, `pagina ${nummer + 1}: "${item.text}" rechts buiten beeld`)
                .toBeLessThanOrEqual(pagina.width - marge + 1);
            expect(item.y, `pagina ${nummer + 1}: "${item.text}" onder de rand`)
                .toBeGreaterThanOrEqual(15);
            expect(item.y, `pagina ${nummer + 1}: "${item.text}" boven de rand`)
                .toBeLessThanOrEqual(pagina.height - 15);
        }
    }
});

test('de betaalregel staat in de voetstrook, en de inhoud blijft erboven', async ({ page }) => {
    const paginas = await maakDocument(page, 25);
    expect(paginas.length).toBeGreaterThan(1);

    for (const [nummer, pagina] of paginas.entries()) {
        const betaalregel = pagina.items.find(item => item.text.includes('Wij verzoeken'));
        expect(betaalregel, `pagina ${nummer + 1} mist de betaalregel`).toBeDefined();

        // Hoger y is hoger op de pagina. De betaalregel hoort onderin te staan;
        // stond hij halverwege, dan liep hij door de tabel heen.
        expect(betaalregel!.y, `pagina ${nummer + 1}: de betaalregel staat niet onderaan`)
            .toBeLessThan(VOETSTROOK);

        for (const regel of tabelregels(pagina)) {
            expect(regel.y, `pagina ${nummer + 1}: "${regel.text}" zakt in de voetstrook`)
                .toBeGreaterThanOrEqual(VOETSTROOK);
        }
    }
});

test('pagina s worden gevuld voordat er een nieuwe begint', async ({ page }) => {
    const paginas = await maakDocument(page, 25);

    // Alle pagina's behalve de laatste horen tot onderin door te lopen. Een
    // pagineermotor die te veel ruimte reserveert maakt halflege pagina's, en
    // dat was precies hoe twee pagina's er vijf werden.
    for (const [nummer, pagina] of paginas.slice(0, -1).entries()) {
        const regels = tabelregels(pagina);
        expect(regels.length, `pagina ${nummer + 1} heeft nauwelijks regels`).toBeGreaterThan(5);

        const laagsteRegel = Math.min(...regels.map(item => item.y));
        expect(laagsteRegel, `pagina ${nummer + 1} is maar halfvol`)
            .toBeLessThan(pagina.height * 0.45);
    }
});

test('de tabelkop staat boven de regels op elke pagina', async ({ page }) => {
    const paginas = await maakDocument(page, 25);

    for (const [nummer, pagina] of paginas.entries()) {
        const kop = pagina.items.find(item => item.text === 'Beschrijving');
        const regels = pagina.items.filter(item => /^Dienst \d+$/.test(item.text));
        if (regels.length === 0) continue;

        expect(kop, `pagina ${nummer + 1} mist de tabelkop`).toBeDefined();
        expect(kop!.y, `pagina ${nummer + 1}: de kop staat niet boven de regels`)
            .toBeGreaterThan(Math.max(...regels.map(r => r.y)));
    }
});

test('een factuur van 25 regels past op een redelijk aantal paginas', async ({ page }) => {
    const paginas = await maakDocument(page, 25);
    // Twee is wat het hoort te zijn; drie laat ruimte voor opmaakwijzigingen.
    // Vijf betekende een kapotte pagineermotor.
    expect(paginas.length).toBeGreaterThanOrEqual(2);
    expect(paginas.length).toBeLessThanOrEqual(3);
});

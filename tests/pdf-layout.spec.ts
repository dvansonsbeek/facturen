import { test, expect } from '@playwright/test';
import { ui, openFoldout, openApp } from './helpers';
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
    await openApp(page);
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

/**
 * De betaal-QR is vectorwerk en geen tekst, dus de extractie hierboven ziet hem
 * niet. Zijn bijschrift wél, en dat staat ernaast — dus dat is het houvast.
 *
 * Waar het om gaat: dat hij er is, dat hij op de laatste pagina bij de inhoud
 * staat en niet in de voetstrook, en dat hij niet in zijn eentje een pagina
 * krijgt. Of de code ook echt scant is een andere vraag; die is met een
 * onafhankelijke decoder op een echt gedownloade PDF nagegaan, en de inhoud
 * staat in tests/betaal-qr.spec.ts.
 */
test.describe('de betaal-QR in de opmaak', () => {
    const bijschrift = (pagina: PdfPageLayout) =>
        pagina.items.find(item => item.text.includes('Scan met uw bankapp'));

    test('staat op een factuur van één pagina, boven de voetstrook', async ({ page }) => {
        const paginas = await maakDocument(page, 1);
        expect(paginas).toHaveLength(1);

        const tekst = bijschrift(paginas[0]);
        expect(tekst, 'het bijschrift van de QR ontbreekt').toBeDefined();
        // De QR zelf is 58pt hoog en staat náást het bijschrift; blijft het
        // bijschrift ruim boven de voetstrook, dan doet de code dat ook.
        expect(tekst!.y, 'de QR zakt in de voetstrook')
            .toBeGreaterThanOrEqual(VOETSTROOK);
    });

    test('staat op de laatste pagina en niet op elke pagina', async ({ page }) => {
        const paginas = await maakDocument(page, 25);
        expect(paginas.length).toBeGreaterThan(1);

        const metQr = paginas.filter(p => bijschrift(p) !== undefined);
        // Eén betaalopdracht hoort één keer op een document te staan; de vaste
        // voettekst wordt wél herhaald, deze niet.
        expect(metQr, 'de QR staat er niet precies één keer op').toHaveLength(1);
        expect(bijschrift(paginas[paginas.length - 1]), 'de QR staat niet op de laatste pagina')
            .toBeDefined();
    });

    test('krijgt geen pagina voor zichzelf', async ({ page }) => {
        const paginas = await maakDocument(page, 25);
        const laatste = paginas[paginas.length - 1];

        // Een losgeslagen QR op een verder lege pagina is precies het soort
        // document dat door alle tekstcontroles komt en er niet uitziet.
        expect(tabelregels(laatste).length, 'de laatste pagina heeft alleen de QR')
            .toBeGreaterThan(0);
    });
});

/**
 * Een creditfactuur is een andere opmaak: geen betaalregel in de voetstrook,
 * wel een verwijzing bovenin. Die werd nergens op positie nagelopen.
 */
test.describe('de opmaak van een creditfactuur', () => {
    const maakCreditfactuur = async (page: import('@playwright/test').Page, regels: number) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.iban.fill('NL91ABNA0417164300');
        await app.clientName.fill('Jansen Bouw BV');
        await app.itemName(0).fill('Dienst 1');
        await app.itemPrice(0).fill('125');

        const nummer = await app.documentNumber.inputValue();
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

        await openFoldout(page, 'Bewaarde documenten');
        await app.archiveRowFor(nummer).view.click();
        await app.archiveDialog.getByRole('button', { name: 'Crediteren' }).click();
        await expect(app.archiveDialog).not.toBeVisible();

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

    test('houdt alle tekst binnen de marges', async ({ page }) => {
        const paginas = await maakCreditfactuur(page, 20);
        const marge = 30;

        for (const [nummer, pagina] of paginas.entries()) {
            for (const item of pagina.items) {
                expect(item.x, `pagina ${nummer + 1}: "${item.text}" links buiten beeld`)
                    .toBeGreaterThanOrEqual(marge);
                expect(item.x + item.width, `pagina ${nummer + 1}: "${item.text}" rechts buiten beeld`)
                    .toBeLessThanOrEqual(pagina.width - marge + 1);
            }
        }
    });

    test('zet de verwijzing bovenaan en de mededeling in de voetstrook', async ({ page }) => {
        const paginas = await maakCreditfactuur(page, 20);

        const verwijzing = paginas[0].items.find(i => i.text.includes('Creditfactuur bij factuur'));
        expect(verwijzing, 'de verwijzing naar het origineel ontbreekt').toBeDefined();
        // Bovenin, bij het nummer en de datum: daar zoekt een lezer hem.
        expect(verwijzing!.y, 'de verwijzing staat niet bovenaan')
            .toBeGreaterThan(paginas[0].height * 0.7);

        for (const [nummer, pagina] of paginas.entries()) {
            const mededeling = pagina.items.find(i => i.text.includes('verrekend'));
            expect(mededeling, `pagina ${nummer + 1} mist de creditmededeling`).toBeDefined();
            expect(mededeling!.y, `pagina ${nummer + 1}: de mededeling staat niet onderaan`)
                .toBeLessThan(VOETSTROOK);

            // En geen betaalverzoek, want het geld gaat de andere kant op.
            expect(pagina.items.find(i => i.text.includes('Wij verzoeken')),
                `pagina ${nummer + 1} vraagt om een betaling`).toBeUndefined();
        }
    });

    test('heeft geen betaal-QR', async ({ page }) => {
        const paginas = await maakCreditfactuur(page, 3);
        for (const pagina of paginas) {
            expect(pagina.items.find(i => i.text.includes('Scan met uw bankapp')),
                'een creditfactuur nodigt uit tot betalen').toBeUndefined();
        }
    });

    test('houdt de regels boven de voetstrook', async ({ page }) => {
        const paginas = await maakCreditfactuur(page, 20);
        for (const [nummer, pagina] of paginas.entries()) {
            for (const regel of tabelregels(pagina)) {
                expect(regel.y, `pagina ${nummer + 1}: "${regel.text}" zakt in de voetstrook`)
                    .toBeGreaterThanOrEqual(VOETSTROOK);
            }
        }
    });
});

test('een factuur van 25 regels past op een redelijk aantal paginas', async ({ page }) => {
    const paginas = await maakDocument(page, 25);
    // Twee is wat het hoort te zijn; drie laat ruimte voor opmaakwijzigingen.
    // Vijf betekende een kapotte pagineermotor.
    expect(paginas.length).toBeGreaterThanOrEqual(2);
    expect(paginas.length).toBeLessThanOrEqual(3);
});

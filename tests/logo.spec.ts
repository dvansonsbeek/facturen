import { test, expect } from '@playwright/test';
import { ui, openFoldout } from './helpers';
import { makePng } from './png';
import { extractPdfText } from './pdf-text';

/**
 * Het logo: uploaden, verkleinen, en wat er gebeurt als het niet past.
 *
 * Deze hele route had geen enkele test, terwijl er een echt foutpad in zit: een
 * logo gaat als data-URL naar localStorage, en daar is ongeveer 5 MB voor. Past
 * het niet, dan staat het wel op je document maar is het na een herlaadbeurt
 * weg — en dat is precies het soort stille mislukking waar de app elders juist
 * een melding voor heeft.
 */
const kiesLogo = async (
    page: import('@playwright/test').Page,
    breedte: number,
    hoogte: number,
) => {
    await openFoldout(page, 'Mijn Bedrijfsgegevens');
    await page.locator('#bedrijf-logo').setInputFiles({
        name: 'logo.png',
        mimeType: 'image/png',
        buffer: makePng(breedte, hoogte),
    });
};

/** De data-URL die als logo is opgeslagen, zoals hij op schijf staat. */
const bewaardLogo = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
        const ruw = localStorage.getItem('facturen.bedrijfsgegevens');
        return ruw ? (JSON.parse(ruw).sender?.logoUrl ?? null) : null;
    });

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('een geüpload logo komt op het document te staan', async ({ page }) => {
    const app = ui(page);
    // Zonder logo staat er een lege plek, geen afbeelding.
    await expect(app.preview.locator('img[alt="Logo"]')).toHaveCount(0);

    await kiesLogo(page, 600, 200);

    await expect(app.preview.locator('img[alt="Logo"]')).toBeVisible();
    // En in de sectie zelf een voorbeeldje, zodat je ziet wat je koos.
    await expect(page.locator('#bedrijf-logo')).toBeVisible();
});

test('het logo overleeft een herlaadbeurt', async ({ page }) => {
    const app = ui(page);
    await kiesLogo(page, 600, 200);
    await expect(app.preview.locator('img[alt="Logo"]')).toBeVisible();

    await page.reload();
    await expect(app.preview.locator('img[alt="Logo"]')).toBeVisible();
});

test('een te breed logo wordt verkleind voordat het wordt bewaard', async ({ page }) => {
    const app = ui(page);
    // Ruim boven de 480 pixels waar de app op terugbrengt.
    await kiesLogo(page, 1600, 400);
    await expect(app.preview.locator('img[alt="Logo"]')).toBeVisible();

    const opgeslagen = await bewaardLogo(page);
    expect(opgeslagen).toBeTruthy();

    // De breedte van wat er echt bewaard is, niet van wat er op het scherm staat.
    const breedte = await page.evaluate(async (bron) => {
        const plaatje = new Image();
        plaatje.src = bron as string;
        await plaatje.decode();
        return plaatje.naturalWidth;
    }, opgeslagen);
    expect(breedte).toBe(480);
});

test('een klein logo blijft zoals het is', async ({ page }) => {
    const app = ui(page);
    await kiesLogo(page, 240, 80);
    await expect(app.preview.locator('img[alt="Logo"]')).toBeVisible();

    const breedte = await page.evaluate(async (bron) => {
        const plaatje = new Image();
        plaatje.src = bron as string;
        await plaatje.decode();
        return plaatje.naturalWidth;
    }, await bewaardLogo(page));
    // Verkleinen alleen: groter maken zou het alleen maar vager maken.
    expect(breedte).toBe(240);
});

test('het logo komt ook in de PDF', async ({ page }) => {
    const app = ui(page);
    await kiesLogo(page, 600, 200);
    await app.itemPrice().fill('100');

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.downloadPdf.click(),
    ]);
    const stream = await download.createReadStream();
    const stukken: Buffer[] = [];
    for await (const s of stream!) stukken.push(s as Buffer);
    const pdf = Buffer.concat(stukken);

    // De tekst blijft intact — het logo mag de rest niet verdringen —
    // en de PDF bevat een afbeelding.
    expect(await extractPdfText(pdf)).toContain('FACTUUR');
    expect(pdf.toString('latin1')).toContain('/Image');
});

/**
 * Het foutpad. Een logo dat niet in de opslag past staat wel op het document
 * maar is na een herlaadbeurt weg; dat hoort de app te zeggen in plaats van het
 * te laten lijken alsof het gelukt is.
 */
test('zegt het als het logo niet bewaard kan worden', async ({ page }) => {
    // localStorage tot de laatste kilobyte vol zetten. Met alleen grote brokken
    // blijft er een gaatje over waar een effen logo nog ruim in past — en dan
    // test je niets.
    const vrijGebleven = await page.evaluate(() => {
        let teller = 0;
        for (const grootte of [512 * 1024, 64 * 1024, 8 * 1024, 1024, 128]) {
            const brok = 'x'.repeat(grootte);
            // Per maat doorgaan tot die niet meer past, dan een maat kleiner.
            for (;;) {
                try {
                    localStorage.setItem(`vulling-${teller++}`, brok);
                } catch {
                    break;
                }
            }
        }
        try {
            localStorage.setItem('proef', 'x'.repeat(128));
            return 'er is nog ruimte';
        } catch {
            return 'vol';
        }
    });
    expect(vrijGebleven, 'de opslag is niet vol te krijgen').toBe('vol');

    await kiesLogo(page, 1200, 400);

    const melding = page.locator('p[role="status"]', { hasText: 'te groot om te onthouden' });
    await expect(melding).toBeVisible();
    // Het staat er wel op, want in het geheugen is het er gewoon.
    await expect(ui(page).preview.locator('img[alt="Logo"]')).toBeVisible();
});

test('een bestand dat geen afbeelding is levert een nette melding', async ({ page }) => {
    await openFoldout(page, 'Mijn Bedrijfsgegevens');
    await page.locator('#bedrijf-logo').setInputFiles({
        name: 'nietEenPlaatje.png',
        mimeType: 'image/png',
        buffer: Buffer.from('dit is geen PNG'),
    });

    await expect(page.locator('p[role="status"]', { hasText: 'niet als afbeelding' })).toBeVisible();
    await expect(ui(page).preview.locator('img[alt="Logo"]')).toHaveCount(0);
});

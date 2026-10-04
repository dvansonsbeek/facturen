import { test, expect } from '@playwright/test';
import { ui, previewText } from './helpers';

const jaar = new Date().toISOString().slice(0, 4);

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('begint bij 001 van het lopende jaar', async ({ page }) => {
    await expect(ui(page).documentNumber).toHaveValue(`${jaar}-001`);
});

/**
 * De aanleiding: het nummer werd bij elke mount opnieuw op -001 gezet, dus na
 * herladen kreeg je hetzelfde nummer nog eens. Twee facturen met hetzelfde
 * nummer zijn niet eenduidig te identificeren (art. 35a Wet OB 1968).
 */
test('onthoudt het nummer na herladen', async ({ page }) => {
    const app = ui(page);
    await app.documentNumber.fill(`${jaar}-042`);
    await page.reload();
    await expect(app.documentNumber).toHaveValue(`${jaar}-042`);
});

test.describe('volgende factuur', () => {
    test('hoogt het nummer op', async ({ page }) => {
        const app = ui(page);
        await app.nextDocument.click();
        await expect(app.documentNumber).toHaveValue(`${jaar}-002`);
        expect(await previewText(page)).toContain(`${jaar}-002`);
    });

    test('houdt de breedte van de cijfers aan', async ({ page }) => {
        const app = ui(page);
        await app.documentNumber.fill(`${jaar}-099`);
        await app.nextDocument.click();
        await expect(app.documentNumber).toHaveValue(`${jaar}-100`);
    });

    test('volgt een handmatige sprong', async ({ page }) => {
        const app = ui(page);
        await app.documentNumber.fill(`${jaar}-250`);
        await app.nextDocument.click();
        await expect(app.documentNumber).toHaveValue(`${jaar}-251`);
    });

    test('werkt ook met een eigen voorvoegsel', async ({ page }) => {
        const app = ui(page);
        await app.documentNumber.fill(`SA-${jaar}-007`);
        await app.nextDocument.click();
        await expect(app.documentNumber).toHaveValue(`SA-${jaar}-008`);
    });

    test('maakt de regels leeg voor het volgende document', async ({ page }) => {
        const app = ui(page);
        await app.itemName(0).fill('Webdesign');
        await app.itemPrice(0).fill('500');

        page.once('dialog', (dialog) => dialog.accept());
        await app.nextDocument.click();

        // Terug naar hoe een vers document eruitziet: een lege regel.
        await expect(app.itemPrice(0)).toHaveValue('0');
        await expect(app.itemName(0)).toHaveValue('');
    });

    test('vraagt eerst om bevestiging als er al regels ingevuld zijn', async ({ page }) => {
        const app = ui(page);
        await app.itemPrice(0).fill('500');

        page.once('dialog', (dialog) => dialog.dismiss());
        await app.nextDocument.click();

        // Geannuleerd: nummer en regels blijven staan.
        await expect(app.documentNumber).toHaveValue(`${jaar}-001`);
        await expect(app.itemPrice(0)).toHaveValue('500');
    });

    test('blijft de klant onthouden, want die factureer je vaker', async ({ page }) => {
        const app = ui(page);
        await app.clientName.fill('Jansen Bouw BV');
        await app.nextDocument.click();
        await expect(app.clientName).toHaveValue('Jansen Bouw BV');
    });
});

test('offertes hebben hun eigen reeks', async ({ page }) => {
    const app = ui(page);
    await app.nextDocument.click();
    await expect(app.documentNumber).toHaveValue(`${jaar}-002`);

    await app.tab('Offerte').click();
    await expect(app.documentNumber).toHaveValue(`OFF-${jaar}-001`);
    await app.nextDocument.click();
    await expect(app.documentNumber).toHaveValue(`OFF-${jaar}-002`);

    // De factuurreeks is daar niet door opgeschoven.
    await app.tab('Factuur').click();
    await expect(app.documentNumber).toHaveValue(`${jaar}-002`);
});

test('de stand gaat mee in de export', async ({ page }) => {
    const app = ui(page);
    await app.documentNumber.fill(`${jaar}-042`);

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.exportSettings.click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(exported.numbering).toMatchObject({ factuur: `${jaar}-042` });
});

test('Wissen zet de reeks terug op 001', async ({ page }) => {
    const app = ui(page);
    await app.documentNumber.fill(`${jaar}-042`);

    page.once('dialog', (dialog) => dialog.accept());
    await app.clearSettings.click();

    await expect(app.documentNumber).toHaveValue(`${jaar}-001`);
});

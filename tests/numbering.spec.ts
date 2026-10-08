import { test, expect } from '@playwright/test';
import { ui, waitForHydration } from './helpers';

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

/**
 * Een nieuwe reeks per jaar.
 *
 * readNumbering geeft de standaard van het lopende jaar zodra het bewaarde jaar
 * een ander is. Dat gebeurt bij de eerste factuur van januari, en geen van de
 * twaalf nummertests stak ooit een jaargrens over.
 *
 * Het jaar komt uit localStorage en niet uit een verzette klok, omdat dit is wat
 * er op 2 januari werkelijk in de browser staat: de stand van vorig jaar.
 */
test('een bewaarde reeks van vorig jaar begint opnieuw bij 001', async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem('facturen.nummering', JSON.stringify({
            jaar: '2019', factuur: '2019-042', offerte: 'OFF-2019-007',
        }));
    });
    await page.goto('/');

    // Eerst hydrateren, en dat is hier niet optioneel: readServerNumbering geeft
    // de standaard van het lopende jaar, dus vóór hydratatie staat het goede
    // antwoord er al om de verkeerde reden. Zonder deze regel zou de test ook
    // slagen als de jaarwissel stuk was.
    await waitForHydration(page);

    const app = ui(page);
    await expect(app.documentNumber).toHaveValue(`${jaar}-001`);
    await app.tab('Offerte').click();
    await expect(app.documentNumber).toHaveValue(`OFF-${jaar}-001`);
});

test.describe('volgende factuur', () => {
    test('hoogt het nummer op', async ({ page }) => {
        const app = ui(page);
        await app.nextDocument.click();
        await expect(app.documentNumber).toHaveValue(`${jaar}-002`);
        await expect(ui(page).preview).toContainText(`${jaar}-002`);
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

import { test, expect } from '@playwright/test';
import { ui, verwachtVoorbeeld, openApp } from './helpers';

test.beforeEach(async ({ page }) => {
    await openApp(page);
});

/**
 * Vult de klantvelden en bewaart de klant in het boek.
 *
 * Begint met "— Nieuwe klant —": na een vorige keer opslaan staan de velden
 * ingeklapt, en zo gaan ze weer open voor de volgende klant.
 */
const addClient = async (page: import('@playwright/test').Page, name: string, city = 'Amsterdam') => {
    const app = ui(page);
    await app.clientPicker.selectOption('');
    await app.clientName.fill(name);
    await app.clientAddress.fill(`Straat 1, ${name}`);
    await app.clientCity.fill(city);
    await app.saveClient.click();
};

test('begint met een leeg klantenboek', async ({ page }) => {
    const app = ui(page);
    await expect(app.clientPicker).toHaveValue('');
    await expect(app.clientPicker.locator('option')).toHaveCount(1);
    await expect(app.deleteClient).toBeDisabled();
});

test('bewaart een klant en biedt hem daarna in de lijst aan', async ({ page }) => {
    const app = ui(page);
    await addClient(page, 'Jansen Bouw BV');

    await expect(app.clientPicker.locator('option')).toHaveCount(2);
    await expect(app.clientPicker.locator('option').nth(1)).toHaveText('Jansen Bouw BV');
});

test('een bewaarde klant kiezen vult de velden', async ({ page }) => {
    const app = ui(page);
    await addClient(page, 'Jansen Bouw BV', 'Utrecht');
    await addClient(page, 'De Vries Advies', 'Rotterdam');

    await app.clientPicker.selectOption({ label: 'Jansen Bouw BV' });

    // De velden blijven ingeklapt; het document laat zien wie het geworden is.
    await verwachtVoorbeeld(page, { bevat: ['Jansen Bouw BV', 'Utrecht'] });

    await app.editClient.click();
    await expect(app.clientName).toHaveValue('Jansen Bouw BV');
    await expect(app.clientCity).toHaveValue('Utrecht');
});

test('"Nieuwe klant" maakt de velden leeg', async ({ page }) => {
    const app = ui(page);
    await addClient(page, 'Jansen Bouw BV');

    await app.clientPicker.selectOption('');

    await expect(app.clientName).toHaveValue('');
    await expect(app.clientCity).toHaveValue('');
});

test('de knop heet Bijwerken zodra de naam al bestaat', async ({ page }) => {
    const app = ui(page);
    await expect(app.saveClient).toHaveText(/Opslaan/);

    await addClient(page, 'Jansen Bouw BV');
    await app.editClient.click();
    await expect(app.saveClient).toHaveText(/Bijwerken/);

    await app.clientName.fill('Nog Een Klant');
    await expect(app.saveClient).toHaveText(/Opslaan/);
});

test.describe('velden inklappen bij een bewaarde klant', () => {
    test('de velden verdwijnen zodra de klant bewaard is', async ({ page }) => {
        const app = ui(page);
        await expect(app.clientName).toBeVisible();

        await addClient(page, 'Jansen Bouw BV');

        await expect(app.clientName).toBeHidden();
        await expect(app.editClient).toBeVisible();
        await expect(app.saveClient).toHaveCount(0);
    });

    test('een bewaarde klant kiezen laat de velden ingeklapt', async ({ page }) => {
        const app = ui(page);
        await addClient(page, 'Jansen Bouw BV');
        await addClient(page, 'De Vries Advies');

        await app.clientPicker.selectOption({ label: 'Jansen Bouw BV' });

        await expect(app.clientName).toBeHidden();
        await expect(app.editClient).toBeVisible();
    });

    test('Bewerken opent de velden weer', async ({ page }) => {
        const app = ui(page);
        await addClient(page, 'Jansen Bouw BV', 'Utrecht');

        await app.editClient.click();

        await expect(app.clientName).toBeVisible();
        await expect(app.clientName).toHaveValue('Jansen Bouw BV');
        await expect(app.clientCity).toHaveValue('Utrecht');
    });

    test('opslaan na bewerken klapt ze weer dicht', async ({ page }) => {
        const app = ui(page);
        await addClient(page, 'Jansen Bouw BV', 'Utrecht');
        await app.editClient.click();
        await app.clientCity.fill('Rotterdam');

        await app.saveClient.click();

        await expect(app.clientName).toBeHidden();
        await expect(app.editClient).toBeVisible();
    });

    test('"Nieuwe klant" opent de velden voor een lege klant', async ({ page }) => {
        const app = ui(page);
        await addClient(page, 'Jansen Bouw BV');
        await expect(app.clientName).toBeHidden();

        await app.clientPicker.selectOption('');

        await expect(app.clientName).toBeVisible();
        await expect(app.clientName).toHaveValue('');
    });

    /**
     * Uit het boek verwijderen laat het document met rust: je bent misschien
     * midden in een factuur aan die klant. De velden gaan wel weer open, want
     * er is geen bewaarde klant meer waar ze bij horen.
     */
    test('een klant verwijderen opent de velden en laat het document staan', async ({ page }) => {
        const app = ui(page);
        await addClient(page, 'Jansen Bouw BV');

        page.once('dialog', (dialog) => dialog.accept());
        await app.deleteClient.click();

        await expect(app.clientName).toBeVisible();
        await expect(app.clientName).toHaveValue('Jansen Bouw BV');
        await expect(app.clientPicker).toHaveValue('');
        await expect(ui(page).preview).toContainText('Jansen Bouw BV');
    });
});

/**
 * De kern van het ontwerp: een adres dat je voor één factuur aanpast mag de
 * bewaarde klant niet stilletjes overschrijven.
 */
test('bewerken zonder opslaan verandert de bewaarde klant niet', async ({ page }) => {
    const app = ui(page);
    await addClient(page, 'Jansen Bouw BV', 'Utrecht');

    await app.editClient.click();
    await app.clientCity.fill('Tijdelijk Adres');
    await expect(ui(page).preview).toContainText('Tijdelijk Adres');

    // Opnieuw kiezen haalt de bewaarde versie terug.
    await app.clientPicker.selectOption('');
    await app.clientPicker.selectOption({ label: 'Jansen Bouw BV' });
    await app.editClient.click();
    await expect(app.clientCity).toHaveValue('Utrecht');
});

test('Bijwerken legt de wijziging wel vast', async ({ page }) => {
    const app = ui(page);
    await addClient(page, 'Jansen Bouw BV', 'Utrecht');

    await app.editClient.click();
    await app.clientCity.fill('Rotterdam');
    await app.saveClient.click();

    await app.clientPicker.selectOption('');
    await app.clientPicker.selectOption({ label: 'Jansen Bouw BV' });
    await app.editClient.click();
    await expect(app.clientCity).toHaveValue('Rotterdam');
    // Bijwerken mag er geen tweede klant bij maken.
    await expect(app.clientPicker.locator('option')).toHaveCount(2);
});

test('een klant verwijderen haalt hem uit de lijst', async ({ page }) => {
    const app = ui(page);
    await addClient(page, 'Jansen Bouw BV');
    await addClient(page, 'De Vries Advies');
    await app.clientPicker.selectOption({ label: 'Jansen Bouw BV' });

    page.once('dialog', (dialog) => dialog.accept());
    await app.deleteClient.click();

    await expect(app.clientPicker.locator('option')).toHaveCount(2);
    await expect(app.clientPicker.locator('option').nth(1)).toHaveText('De Vries Advies');
});

test('het klantenboek overleeft een herlaadbeurt', async ({ page }) => {
    const app = ui(page);
    await addClient(page, 'Jansen Bouw BV');

    await page.reload();

    await expect(app.clientPicker.locator('option')).toHaveCount(2);
    await app.clientPicker.selectOption({ label: 'Jansen Bouw BV' });
    await app.editClient.click();
    await expect(app.clientName).toHaveValue('Jansen Bouw BV');
});

test('het klantenboek gaat mee in de export', async ({ page }) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await addClient(page, 'Jansen Bouw BV');

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.exportSettings.click(),
    ]);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(exported.clients).toHaveLength(1);
    expect(exported.clients[0]).toMatchObject({ name: 'Jansen Bouw BV' });
});

test('Wissen leegt ook het klantenboek', async ({ page }) => {
    const app = ui(page);
    await addClient(page, 'Jansen Bouw BV');
    await expect(app.clientPicker.locator('option')).toHaveCount(2);

    page.once('dialog', (dialog) => dialog.accept());
    await app.clearSettings.click();

    await expect(app.clientPicker.locator('option')).toHaveCount(1);
});

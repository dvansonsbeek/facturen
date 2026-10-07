import { test, expect } from '@playwright/test';
import { ui } from './helpers';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

test('exporteert bedrijfs- en betaalgegevens als JSON', async ({ page }) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.companyKvk.fill('87654321');
    await app.companyVat.fill('NL123456789B01');
    await app.iban.fill('NL91ABNA0417164300');

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.exportSettings.click(),
    ]);

    expect(download.suggestedFilename()).toBe(
        'facturen_instellingen_sonsbeek_advies_bv.json',
    );

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    const settings = JSON.parse(Buffer.concat(chunks).toString('utf8'));

    expect(settings).toMatchObject({
        sender: {
            name: 'Sonsbeek Advies BV',
            kvkNumber: '87654321',
            vatNumber: 'NL123456789B01',
            country: 'Nederland',
        },
        bankAccount: 'NL91ABNA0417164300',
    });
});

test.describe('gegevens blijven in deze browser bewaard', () => {
    test('bedrijfs- en betaalgegevens overleven een herlaadbeurt', async ({ page }) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.companyKvk.fill('87654321');
        await app.iban.fill('NL91ABNA0417164300');

        await page.reload();

        await expect(app.companyName).toHaveValue('Sonsbeek Advies BV');
        await expect(app.companyKvk).toHaveValue('87654321');
        await expect(app.iban).toHaveValue('NL91ABNA0417164300');
    });

    test('ze gelden voor zowel de factuur als de offerte', async ({ page }) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.tab('Offerte').click();
        await expect(app.companyName).toHaveValue('Sonsbeek Advies BV');
    });

    test('Wissen verwijdert ze weer', async ({ page }) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await page.reload();
        await expect(app.companyName).toHaveValue('Sonsbeek Advies BV');

        page.once('dialog', (dialog) => dialog.accept());
        await app.clearSettings.click();

        await expect(app.companyName).toHaveValue('UW BEDRIJFSNAAM');
        await page.reload();
        await expect(app.companyName).toHaveValue('UW BEDRIJFSNAAM');
    });
});

test.describe('inklapbare secties', () => {
    test('staan open bij een eerste bezoek', async ({ page }) => {
        await expect(ui(page).companyName).toBeVisible();
    });

    /**
     * De sectie mag niet dichtklappen zodra er iets is ingevuld: dan klapt hij
     * dicht terwijl je nog aan het typen bent.
     */
    test('blijven open terwijl je typt', async ({ page }) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.companyKvk.fill('87654321');
        await expect(app.companyName).toBeVisible();
    });

    test('onthouden dat je ze hebt ingeklapt', async ({ page }) => {
        const app = ui(page);
        await app.companySummary.click();
        await expect(app.companyName).toBeHidden();

        await page.reload();
        await expect(app.companyName).toBeHidden();

        await app.companySummary.click();
        await expect(app.companyName).toBeVisible();
    });
});

/**
 * De Import-knop is een <label> om een verborgen file-input, de Export-knop een
 * <button>. Binnen .form-section erfde dat label de opmaak van een
 * formulierlabel: hoofdletters, letterafstand en een ondermarge, waardoor hij
 * ook lager uitviel dan de Export-knop.
 */
test('de Export- en Import-knop zien er hetzelfde uit', async ({ page }) => {
    const read = (title: string) =>
        page.locator(`[title="${title}"]`).evaluate((node) => {
            const style = getComputedStyle(node);
            return {
                text: (node as HTMLElement).innerText,
                textTransform: style.textTransform,
                letterSpacing: style.letterSpacing,
                marginBottom: style.marginBottom,
                height: Math.round(node.getBoundingClientRect().height),
            };
        });

    const exportButton = await read('Mijn gegevens exporteren');
    const importButton = await read('Mijn gegevens importeren');

    expect(importButton.text).toBe('Import');
    expect(importButton.textTransform).toBe(exportButton.textTransform);
    expect(importButton.letterSpacing).toBe(exportButton.letterSpacing);
    expect(importButton.marginBottom).toBe(exportButton.marginBottom);
    expect(importButton.height).toBe(exportButton.height);
});

/**
 * Het voorbeeld stelt papier voor en hoort dus niet met het thema mee te
 * kleuren. Deed het dat wel, dan werd --foreground in het donker bijna wit en
 * was de bedrijfsnaam onleesbaar op het witte vel.
 */
test('het voorbeeld ziet er in donkere modus hetzelfde uit', async ({ page }) => {
    const app = ui(page);
    const kleuren = () =>
        app.preview.evaluate((el) => {
            const stijl = (node: Element) => getComputedStyle(node).color;
            return {
                papier: getComputedStyle(el).backgroundColor,
                bedrijfsnaam: stijl(el.querySelector('h2')!),
                titel: stijl(el.querySelector('h1')!),
                kopje: stijl(el.querySelector('h3')!),
                rand: getComputedStyle(el.querySelector('thead tr')!).borderBottomColor,
            };
        });

    const licht = await kleuren();
    await page.locator('button')
        .filter({ has: page.locator('svg.lucide-moon, svg.lucide-sun') }).first().click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    expect(await kleuren()).toEqual(licht);
    expect(licht.papier).toBe('rgb(255, 255, 255)');
});

test('onthoudt het gekozen thema na herladen', async ({ page }) => {
    const themeButton = page.locator('button').filter({ has: page.locator('svg.lucide-moon, svg.lucide-sun') }).first();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await themeButton.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

/**
 * Verwijzingen en het thema.
 *
 * Twee dingen die alleen in het donker opvielen. Verwijzingen hadden nooit een
 * eigen kleur en kregen dus #0000EE van de browser — tegen een achtergrond van
 * #020617 vrijwel onleesbaar, en in het licht valt dat niet op. En het thema
 * werd gezet vanuit InvoiceForm, dat alleen op de hoofdpagina staat: wie in het
 * donker op de voorwaarden klikte, kreeg een wit scherm.
 *
 * Getoetst op de berékende kleur en niet op de regel in het stijlblad, want het
 * gaat erom wat de bezoeker ziet.
 */
test.describe('verwijzingen en thema', () => {
    const kleurVan = (page: import('@playwright/test').Page, selector: string) =>
        page.locator(selector).first().evaluate((el) => getComputedStyle(el).color);

    /** De standaardkleur van de browser; precies wat er niet moet staan. */
    const BROWSERBLAUW = 'rgb(0, 0, 238)';

    test('een verwijzing volgt het thema en niet de standaard van de browser', async ({ page }) => {
        const licht = await kleurVan(page, 'footer a');
        expect(licht).not.toBe(BROWSERBLAUW);

        await page.locator('button')
            .filter({ has: page.locator('svg.lucide-moon, svg.lucide-sun') }).first().click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

        const donker = await kleurVan(page, 'footer a');
        expect(donker).not.toBe(BROWSERBLAUW);
        // En het is niet dezelfde kleur als in het licht: dat zou betekenen dat
        // hij de variabele niet volgt.
        expect(donker).not.toBe(licht);
    });

    /**
     * De voorwaarden hebben geen InvoiceForm, en kregen het thema daardoor
     * nooit. Nu zet components/ThemeApplier.tsx het vanuit de omhulling.
     */
    test('de voorwaardenpagina krijgt hetzelfde thema mee', async ({ page }) => {
        await page.locator('button')
            .filter({ has: page.locator('svg.lucide-moon, svg.lucide-sun') }).first().click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

        await page.getByRole('link', { name: 'gebruiksvoorwaarden' }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

        const achtergrond = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
        expect(achtergrond, 'de voorwaarden staan nog op het lichte thema')
            .not.toBe('rgb(248, 250, 252)');
        expect(await kleurVan(page, 'article a')).not.toBe(BROWSERBLAUW);
    });
});

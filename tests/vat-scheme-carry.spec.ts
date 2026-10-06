import { test, expect } from '@playwright/test';
import { ui, normalise, openFoldout } from './helpers';

/**
 * De btw-behandeling moet meegaan als een document gekopieerd wordt.
 *
 * Er zijn drie paden die velden van het ene document naar het andere tillen:
 * wisselen van tabblad, een offerte omzetten naar een factuur, en een bewaard
 * document dupliceren. Gaat het regime daar niet mee, dan valt het terug op
 * "normaal" en staat er ineens 21% btw op een factuur die vrijgesteld, verlegd
 * of intracommunautair hoort te zijn. Dat is geen schoonheidsfoutje: de
 * ontvanger krijgt dan btw in rekening gebracht die er niet op mag staan.
 */
test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

const vul = async (page: import('@playwright/test').Page) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.companyKvk.fill('87654321');
    await app.companyVat.fill('NL123456789B01');
    await app.clientName.fill('Klant BV');
    await app.itemDescription().fill('Advies');
    await app.itemPrice().fill('100');
    return app;
};

test('wisselen van tabblad houdt de btw-behandeling vast', async ({ page }) => {
    const app = await vul(page);
    await app.vatScheme.selectOption('kor');
    await expect(app.preview).toContainText('art. 25 Wet OB 1968');

    await app.tab('Offerte').click();
    await expect(app.vatScheme, 'de offerte valt terug op normaal').toHaveValue('kor');
    await expect(app.preview).toContainText('art. 25 Wet OB 1968');
    expect(normalise(await app.preview.innerText()), 'er staat btw op een KOR-offerte')
        .not.toContain('BTW (');

    // En terug, want het moet beide kanten op werken.
    await app.tab('Factuur').click();
    await expect(app.vatScheme).toHaveValue('kor');
});

test('een vrijgestelde offerte omzetten geeft een vrijgestelde factuur', async ({ page }) => {
    const app = await vul(page);
    await app.tab('Offerte').click();
    await app.clientName.fill('Klant BV');
    await app.itemPrice().fill('100');
    await app.vatScheme.selectOption('kor');
    await expect(app.preview).toContainText('art. 25 Wet OB 1968');

    page.once('dialog', (d) => d.accept());
    await app.convertToInvoice.click();

    // Hier zat de scherpste fout: een KOR-ondernemer zet zijn offerte om en de
    // factuur rekent ineens 21% btw.
    await expect(app.vatScheme, 'de factuur rekent weer btw').toHaveValue('kor');
    await expect(app.preview).toContainText('art. 25 Wet OB 1968');
    expect(normalise(await app.preview.innerText())).not.toContain('€ 121,00');
});

test('een bewaard document dupliceren houdt de btw-behandeling vast', async ({ page }) => {
    const app = await vul(page);
    await app.clientVat.fill('NL987654321B01');
    await app.vatScheme.selectOption('verlegd');
    await expect(app.preview).toContainText('Btw verlegd');

    const nummer = await app.documentNumber.inputValue();
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    // Leegmaken, zodat overnemen zichtbaar is.
    page.once('dialog', (d) => d.accept());
    await app.nextDocument.click();
    await app.vatScheme.selectOption('normaal');

    await openFoldout(page, 'Bewaarde documenten');
    await app.archiveRowFor(nummer).duplicate.click();

    await expect(app.vatScheme, 'het duplicaat rekent weer btw').toHaveValue('verlegd');
    await expect(app.preview).toContainText('Btw verlegd');
});

test('het btw-tarief per regel staat uit als er geen btw gerekend wordt', async ({ page }) => {
    const app = await vul(page);
    await expect(app.itemVatRate()).toBeEnabled();

    // Bij elk regime behalve normaal doet het tarief per regel niets, dus het
    // hoort niet alsof je er nog iets aan kunt veranderen.
    await app.vatScheme.selectOption('kor');
    await expect(app.itemVatRate()).toBeDisabled();

    await app.vatScheme.selectOption('verlegd');
    await expect(app.itemVatRate()).toBeDisabled();

    await app.vatScheme.selectOption('normaal');
    await expect(app.itemVatRate()).toBeEnabled();
});

test('het tarief per regel blijft bewaard na een rondje langs een ander regime', async ({ page }) => {
    const app = await vul(page);
    await app.itemVatRate().selectOption('9');

    await app.vatScheme.selectOption('kor');
    await app.vatScheme.selectOption('normaal');

    // Het regime bepaalt alleen de weergave; het mag het tarief niet wissen.
    await expect(app.itemVatRate()).toHaveValue('9');
    await expect(app.preview).toContainText('BTW (9%)');
});

import { test, expect } from '@playwright/test';
import { ui, normalise, openFoldout, openApp } from './helpers';

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
    await openApp(page);
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

test.describe('datum levering/dienst', () => {
    /**
     * Art. 35a lid 1 Wet OB 1968 wil de datum van de levering of dienst op de
     * factuur "voor zover die datum vastgesteld en verschillend is van de
     * uitreikingsdatum". Wie achteraf factureert heeft dat geval, en dat is de
     * meeste zzp'ers aan het eind van de maand.
     */
    test('staat op het document als hij afwijkt van de factuurdatum', async ({ page }) => {
        const app = await vul(page);
        await app.deliveryDate.fill('2026-09-15');
        await expect(app.preview).toContainText('Datum levering/dienst: 15-09-2026');
    });

    test('blijft weg als hij gelijk is aan de factuurdatum', async ({ page }) => {
        const app = await vul(page);
        const factuurdatum = await page.locator('#datum').inputValue();
        await app.deliveryDate.fill(factuurdatum);

        // Dezelfde datum twee keer noemen voegt niets toe; de wet vraagt hem
        // juist alleen als hij verschilt.
        expect(normalise(await app.preview.innerText())).not.toContain('Datum levering/dienst');
    });

    test('blijft weg als hij niet is ingevuld', async ({ page }) => {
        const app = await vul(page);
        expect(normalise(await app.preview.innerText())).not.toContain('Datum levering/dienst');
    });

    test('een offerte heeft er geen, want er is nog niets geleverd', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();
        await expect(app.deliveryDate).toHaveCount(0);
    });
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

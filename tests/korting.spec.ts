import { test, expect } from '@playwright/test';
import { ui, openFoldout } from './helpers';
import { summariseDocument, discountAmount, roundToCents } from '../lib/utils';
import type { Discount } from '../types';

/**
 * Korting op het totaal.
 *
 * Op het totaal en niet per regel, want dat is wat er in de praktijk wordt
 * gevraagd: "€ 50 eraf omdat het uitliep", niet een andere prijs per post.
 *
 * Het lastige zit in de btw. Staan er regels met verschillende tarieven op, dan
 * moet de korting naar verhouding over die tarieven worden verdeeld — anders
 * tellen de btw-regels op het document niet op tot het totaal eronder. Dat is
 * precies de fout waar de afronding in lib/utils.ts voor bestaat, en een
 * factuur waarvan de bedragen niet kloppen is geen factuur.
 *
 * Daarom staan hier sommen en geen schermtests: wat het document toont komt
 * hiervandaan, en als dit klopt kan het scherm het alleen nog verkeerd
 * opschrijven.
 */

const regel = (prijs: number, tarief: number, aantal = 1) =>
    ({ quantity: aantal, unitPrice: prijs, vatRate: tarief });

/** De som van wat er op papier komt te staan, zoals een lezer hem maakt. */
const telOp = (uit: ReturnType<typeof summariseDocument>) =>
    roundToCents(
        roundToCents(uit.subtotal - uit.discount)
        + Object.values(uit.vatTotals).reduce((a, b) => roundToCents(a + b), 0),
    );

test.describe('het bedrag van de korting', () => {
    test('een vast bedrag gaat er zo af', () => {
        expect(discountAmount(500, { soort: 'bedrag', waarde: 50 })).toBe(50);
    });

    test('een percentage rekent over het subtotaal exclusief btw', () => {
        // Over het bedrag mét btw rekenen zou de btw zelf verlagen, en dat is
        // niet wat een korting doet.
        expect(discountAmount(500, { soort: 'procent', waarde: 10 })).toBe(50);
    });

    test('rondt af op centen', () => {
        expect(discountAmount(333.33, { soort: 'procent', waarde: 7 })).toBe(23.33);
    });

    /**
     * Meer korting dan er te betalen valt bestaat niet. Een document dat geld
     * de andere kant op stuurt is een creditfactuur — een eigen documentsoort,
     * met een verwijzing naar het origineel erop.
     */
    test('kan nooit groter zijn dan het subtotaal', () => {
        expect(discountAmount(100, { soort: 'bedrag', waarde: 250 })).toBe(100);
        expect(discountAmount(100, { soort: 'procent', waarde: 300 })).toBe(100);
    });

    test('negatieve invoer telt als geen korting', () => {
        expect(discountAmount(100, { soort: 'bedrag', waarde: -40 })).toBe(0);
    });

    test('zonder korting is het nul', () => {
        expect(discountAmount(100, undefined)).toBe(0);
    });
});

test.describe('wat de korting met de btw doet', () => {
    test('bij één tarief verlaagt hij de grondslag', () => {
        const uit = summariseDocument(
            [regel(500, 21)], false, { soort: 'bedrag', waarde: 100 },
        );

        expect(uit.subtotal).toBe(500);
        expect(uit.discount).toBe(100);
        // Btw over 400, niet over 500: je betaalt geen btw over wat je niet betaalt.
        expect(uit.vatTotals[21]).toBe(84);
        expect(uit.total).toBe(484);
    });

    /**
     * De kern. Met 21% en 9% door elkaar moet de korting over allebei worden
     * verdeeld; alles van één tarief afhalen zou de btw verkeerd maken.
     */
    test('bij gemengde tarieven wordt hij naar verhouding verdeeld', () => {
        const uit = summariseDocument(
            [regel(300, 21), regel(100, 9)], false, { soort: 'procent', waarde: 10 },
        );

        expect(uit.subtotal).toBe(400);
        expect(uit.discount).toBe(40);
        // 10% eraf: grondslag 270 en 90.
        expect(uit.vatTotals[21]).toBe(roundToCents(270 * 0.21));
        expect(uit.vatTotals[9]).toBe(roundToCents(90 * 0.09));
        expect(uit.total).toBe(telOp(uit));
    });

    /**
     * De afrondingsval waar deze app eerder al door is gebeten: elk deel apart
     * afronden levert centen verschil, en dan telt het document niet meer op.
     * Deze bedragen zijn gekozen omdat de verdeling er niet rond uitkomt.
     */
    test('de getoonde bedragen tellen op tot het getoonde totaal', () => {
        for (const korting of [
            { soort: 'bedrag', waarde: 33.33 },
            { soort: 'procent', waarde: 7 },
            { soort: 'procent', waarde: 33.333 },
            { soort: 'bedrag', waarde: 0.01 },
        ] as Discount[]) {
            const uit = summariseDocument(
                [regel(2.02, 21), regel(5.05, 9), regel(99.99, 21)], false, korting,
            );
            expect(uit.total, `klopt niet bij ${korting.soort} ${korting.waarde}`)
                .toBe(telOp(uit));
        }
    });

    test('zonder korting verandert er niets aan de oude uitkomst', () => {
        const zonder = summariseDocument([regel(100, 21)], false);
        expect(zonder.discount).toBe(0);
        expect(zonder.subtotal).toBe(100);
        expect(zonder.total).toBe(121);
    });

    /**
     * Onder de kleineondernemersregeling staat er geen btw op. De korting moet
     * er dan nog steeds vanaf — anders betaal je voor iets wat je niet hebt
     * afgesproken.
     */
    test('onder de KOR verlaagt hij gewoon het totaal, zonder btw', () => {
        const uit = summariseDocument(
            [regel(500, 21)], true, { soort: 'bedrag', waarde: 50 },
        );

        expect(uit.vatTotals).toEqual({});
        expect(uit.discount).toBe(50);
        expect(uit.total).toBe(450);
    });

    test('een korting van honderd procent brengt het totaal op nul', () => {
        const uit = summariseDocument(
            [regel(100, 21)], false, { soort: 'procent', waarde: 100 },
        );
        expect(uit.total).toBe(0);
        expect(uit.vatTotals[21]).toBe(0);
    });
});

/**
 * En wat ervan op het document terechtkomt.
 *
 * De sommen hierboven zijn de waarheid; dit toetst of het scherm die ook
 * opschrijft. Twee renderers tonen hetzelfde document, dus beide moeten het
 * zeggen — tests/pdf.spec.ts bewaakt dat ze niet uit elkaar lopen.
 */
test.describe('korting op het document', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    const vul = async (page: import('@playwright/test').Page) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('500');
        return app;
    };

    test('zonder korting staat er niets over korting', async ({ page }) => {
        const app = await vul(page);
        await expect(app.preview).toContainText('€ 605,00');
        await expect(app.preview).not.toContainText('Korting');
    });

    test('een bedrag gaat eraf en verlaagt de btw', async ({ page }) => {
        const app = await vul(page);
        await page.locator('#korting').fill('100');

        await expect(app.preview).toContainText('Korting');
        await expect(app.preview).toContainText('€ 100,00');
        // Btw over 400 en niet over 500: je betaalt geen btw over wat je niet betaalt.
        await expect(app.preview).toContainText('€ 84,00');
        await expect(app.preview).toContainText('€ 484,00');
    });

    test('een percentage rekent over het subtotaal', async ({ page }) => {
        const app = await vul(page);
        await page.locator('#korting').fill('10');
        await page.locator('#kortingsoort').selectOption('procent');

        await expect(app.preview).toContainText('€ 50,00');
        await expect(app.preview).toContainText('€ 544,50');
    });

    /**
     * Onder de KOR verdween het subtotaal met opzet: zonder btw is het hetzelfde
     * getal als het totaal en dus ruis. Met korting is dat niet meer waar — dan
     * zie je zonder subtotaal niet waar de korting vanaf gaat.
     */
    test('onder de KOR komt het subtotaal terug zodra er korting op staat', async ({ page }) => {
        const app = await vul(page);
        await app.vatScheme.selectOption('kor');
        await expect(app.preview).not.toContainText('Subtotaal');

        await page.locator('#korting').fill('50');

        await expect(app.preview).toContainText('Subtotaal');
        await expect(app.preview).toContainText('€ 450,00');
        // En nog steeds geen btw: dat is de hele regeling.
        await expect(app.preview).not.toContainText('BTW (');
    });

    /**
     * Wie scant moet hetzelfde betalen als wie overtypt. Een QR met het bedrag
     * vóór korting is erger dan geen QR.
     */
    test('de betaal-QR volgt het bedrag na korting', async ({ page }) => {
        const app = await vul(page);
        await openFoldout(page, 'Mijn Betaalgegevens');
        await app.iban.fill('NL91ABNA0417164300');
        await page.locator('#korting').fill('100');

        await expect(app.preview.locator('svg[aria-label^="Betaal-QR"]')).toBeVisible();
        const voor = await app.preview.locator('svg[aria-label^="Betaal-QR"] path').getAttribute('d');

        await page.locator('#korting').fill('200');
        await expect(app.preview).toContainText('€ 363,00');
        const na = await app.preview.locator('svg[aria-label^="Betaal-QR"] path').getAttribute('d');

        // Verandert het bedrag en de code niet mee, dan scant je klant het oude bedrag.
        expect(na).not.toBe(voor);
    });

    test('leegmaken haalt de korting weer weg', async ({ page }) => {
        const app = await vul(page);
        await page.locator('#korting').fill('100');
        await expect(app.preview).toContainText('Korting');

        await page.locator('#korting').fill('');

        await expect(app.preview).not.toContainText('Korting');
        await expect(app.preview).toContainText('€ 605,00');
    });
});

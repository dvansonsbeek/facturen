import { test, expect } from '@playwright/test';
import { ui, openFoldout, normalise } from './helpers';
import { keurIban } from '../lib/iban';
import { epcPayload } from '../lib/payment-qr';
import type { Invoice } from '../types';

/**
 * Het controlegetal van een IBAN.
 *
 * Dit is geen formaliteit. Een rekeningnummer staat op elke factuur en gaat in
 * de betaal-QR, en de app nam eerder élke reeks tekens aan. Een tikfout leverde
 * daarmee een betaalopdracht op; meestal mislukt die, maar soms is het
 * verschoven nummer van iemand anders en gaat het geld daarheen. Bij een
 * gescande code kijkt bovendien niemand meer na wat erin stond.
 */
test.describe('het controlegetal', () => {
    test('keurt echte rekeningnummers goed', async () => {
        // Officiële voorbeelden uit de registers van de betreffende landen.
        for (const iban of [
            'NL91ABNA0417164300',
            'NL02ABNA0123456789',
            'BE68539007547034',
            'DE89370400440532013000',
            'GB82WEST12345698765432',
        ]) {
            expect(keurIban(iban).ok, `${iban} werd afgekeurd`).toBe(true);
        }
    });

    test('ziet spaties en kleine letters door de vingers', async () => {
        const uit = keurIban('nl91 abna 0417 1643 00');
        expect(uit.ok).toBe(true);
        if (uit.ok) expect(uit.genormaliseerd).toBe('NL91ABNA0417164300');
    });

    /**
     * Waar het om begonnen is: één teken anders en het nummer deugt niet meer.
     * Dit is de fout die zonder deze controle ongemerkt in een QR belandde.
     */
    test('ziet een tikfout van één cijfer', async () => {
        const uit = keurIban('NL91ABNA0417164301');
        expect(uit.ok).toBe(false);
        if (!uit.ok) expect(uit.reden).toContain('controlegetal');
    });

    test('ziet twee verwisselde cijfers', async () => {
        const uit = keurIban('NL91ABNA0417164030');
        expect(uit.ok).toBe(false);
    });

    test('ziet een verkeerde lengte', async () => {
        const uit = keurIban('NL91ABNA041716430');
        expect(uit.ok).toBe(false);
        if (!uit.ok) expect(uit.reden).toContain('18 tekens');
    });

    test('wijst onzin af', async () => {
        for (const onzin of ['mijn rekening', '0417164300', 'NLABNA0417164300', '1234']) {
            expect(keurIban(onzin).ok, `${onzin} werd goedgekeurd`).toBe(false);
        }
    });

    test('een leeg veld is geen fout, maar ook geen nummer', async () => {
        expect(keurIban('').ok).toBe(false);
        expect(keurIban('   ').ok).toBe(false);
    });
});

test.describe('geen QR bij een nummer dat niet deugt', () => {
    const factuur = (bankAccount: string): Invoice => ({
        id: 'x',
        invoiceNumber: '2026-001',
        date: '2026-10-07',
        sender: {
            name: 'Sonsbeek Advies BV', address: '', zip: '', city: '',
            country: 'Nederland', vatNumber: '', email: '',
        },
        client: { name: 'Klant BV', address: '', zip: '', city: '', country: '' },
        items: [{ id: '1', description: 'Advies', quantity: 1, unitPrice: 100, vatRate: 21 }],
        vatScheme: 'normaal',
        bankAccount,
    });

    test('een geldig nummer levert een code op', async () => {
        expect(epcPayload(factuur('NL91ABNA0417164300'))).not.toBeNull();
    });

    /**
     * Liever geen code dan een verkeerde: wie scant, controleert niet meer wat
     * er in stond.
     */
    test('een tikfout levert géén code op', async () => {
        expect(epcPayload(factuur('NL91ABNA0417164301'))).toBeNull();
        expect(epcPayload(factuur('mijn rekening'))).toBeNull();
    });

    test('het nummer in de code is genormaliseerd', async () => {
        const regels = epcPayload(factuur('nl91 abna 0417 1643 00'))!.split('\n');
        expect(regels[6]).toBe('NL91ABNA0417164300');
    });
});

test.describe('in de app', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    const vulIban = async (page: import('@playwright/test').Page, iban: string) => {
        const app = ui(page);
        await openFoldout(page, 'Mijn Betaalgegevens');
        await app.iban.fill(iban);
        return app;
    };

    test('zegt het als het nummer niet deugt, en laat de QR weg', async ({ page }) => {
        const app = await vulIban(page, 'NL91ABNA0417164301');
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.itemPrice().fill('100');

        await expect(page.locator('p[role="status"]', { hasText: 'deugt niet' })).toBeVisible();
        await expect(app.preview.locator('svg[aria-label^="Betaal-QR"]')).toHaveCount(0);
        // Het nummer staat wel op het document: het is wat de gebruiker intypte,
        // en hem dat niet laten zien helpt niemand bij het vinden van de fout.
        expect(normalise(await app.preview.innerText())).toContain('NL91 ABNA 0417 1643 01');
    });

    test('bevestigt een nummer dat wel deugt, zonder meer te beloven', async ({ page }) => {
        const app = await vulIban(page, 'NL91ABNA0417164300');
        await app.itemPrice().fill('100');

        const melding = page.locator('p[role="status"]', { hasText: 'controlegetal klopt' });
        await expect(melding).toBeVisible();
        // Geen valse zekerheid: wel of het nummer bestaat, niet of het van jou is.
        await expect(melding).toContainText('niet dat het nummer van jou is');
        await expect(app.preview.locator('svg[aria-label^="Betaal-QR"]')).toBeVisible();
    });

    test('zegt niets bij een leeg veld', async ({ page }) => {
        await openFoldout(page, 'Mijn Betaalgegevens');
        await expect(page.locator('p[role="status"]', { hasText: 'deugt niet' })).toHaveCount(0);
        await expect(page.locator('p[role="status"]', { hasText: 'controlegetal' })).toHaveCount(0);
    });

    test('vertelt dat er een betaal-QR van komt', async ({ page }) => {
        // De code stond onder de fold en nergens stond dat hij bestond; daar is
        // deze uitleg voor, naast het veld dat hem veroorzaakt.
        await openFoldout(page, 'Mijn Betaalgegevens');
        await expect(page.locator('#iban-uitleg')).toContainText('betaal-QR');
    });
});

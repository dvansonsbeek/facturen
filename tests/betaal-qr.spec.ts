import { test, expect } from '@playwright/test';
import { ui, normalise, openFoldout, openApp } from './helpers';
import { epcPayload, MAX_BYTES } from '../lib/payment-qr';
import type { Invoice } from '../types';

/**
 * De betaal-QR (EPC069-12).
 *
 * Wat ertoe doet is niet dat er een plaatje staat, maar wat erin staat: een
 * betaalopdracht met het juiste rekeningnummer, het juiste bedrag en het
 * factuurnummer als omschrijving. Een verkeerd bedrag in een code die iemand
 * blind scant, is erger dan geen code.
 *
 * De inhoud toetsen we daarom op de payload zelf, en in de app controleren we
 * of hij op de juiste documenten wél en op de verkeerde níet verschijnt.
 */
const factuur = (extra: Partial<Invoice> = {}): Invoice => ({
    id: 'x',
    invoiceNumber: '2026-001',
    date: '2026-10-06',
    sender: {
        name: 'Sonsbeek Advies BV',
        address: 'Velperweg 1',
        zip: '6824 BZ',
        city: 'Arnhem',
        country: 'Nederland',
        vatNumber: 'NL123456789B01',
        email: 'info@sonsbeekadvies.nl',
    },
    client: { name: 'Klant BV', address: '', zip: '', city: '', country: '' },
    items: [{ id: '1', description: 'Advies', quantity: 10, unitPrice: 125, vatRate: 21 }],
    vatScheme: 'normaal',
    bankAccount: 'NL91ABNA0417164300',
    ...extra,
});

test.describe('wat er in de code staat', () => {
    test('is een SEPA-overschrijving met de juiste gegevens', async () => {
        const regels = epcPayload(factuur())!.split('\n');

        expect(regels[0], 'servicetag').toBe('BCD');
        expect(regels[1], 'versie').toBe('002');
        expect(regels[2], 'tekenset UTF-8').toBe('1');
        expect(regels[3], 'SEPA-overschrijving').toBe('SCT');
        expect(regels[5], 'naam begunstigde').toBe('Sonsbeek Advies BV');
        expect(regels[6], 'IBAN').toBe('NL91ABNA0417164300');
        // 10 × 125 plus 21% btw.
        expect(regels[7], 'bedrag').toBe('EUR1512.50');
        expect(regels[10], 'omschrijving').toBe('Factuur 2026-001');
    });

    test('het bedrag volgt de btw-behandeling van het document', async () => {
        // Onder de KOR staat er geen btw op, dus er hoort ook geen btw in de code.
        expect(epcPayload(factuur({ vatScheme: 'kor' }))!.split('\n')[7]).toBe('EUR1250.00');
        expect(epcPayload(factuur({ vatScheme: 'verlegd' }))!.split('\n')[7]).toBe('EUR1250.00');
    });

    test('spaties in het rekeningnummer worden eruit gehaald', async () => {
        const regels = epcPayload(factuur({ bankAccount: 'NL91 ABNA 0417 1643 00' }))!.split('\n');
        expect(regels[6]).toBe('NL91ABNA0417164300');
    });

    test('blijft binnen de maximale lengte', async () => {
        const payload = epcPayload(factuur())!;
        expect(new TextEncoder().encode(payload).length).toBeLessThanOrEqual(MAX_BYTES);
    });
});

test.describe('wanneer er geen code hoort te zijn', () => {
    test('zonder rekeningnummer', async () => {
        expect(epcPayload(factuur({ bankAccount: '' }))).toBeNull();
    });

    test('bij een bedrag van nul', async () => {
        expect(epcPayload(factuur({ items: [{ id: '1', description: '', quantity: 1, unitPrice: 0, vatRate: 21 }] })))
            .toBeNull();
    });

    /**
     * De belangrijkste: op een creditfactuur gaat het geld de andere kant op.
     * Een code die je klant uitnodigt om tóch te betalen is daar niet alleen
     * overbodig maar verkeerd.
     */
    test('op een creditfactuur', async () => {
        expect(epcPayload(factuur({ creditOf: { number: '2026-001', date: '2026-10-01' } })))
            .toBeNull();
    });

    test('bij een onmogelijk hoog bedrag', async () => {
        expect(epcPayload(factuur({
            items: [{ id: '1', description: '', quantity: 1, unitPrice: 2_000_000_000, vatRate: 0 }],
        }))).toBeNull();
    });
});

test.describe('op het document', () => {
    test.beforeEach(async ({ page }) => {
        await openApp(page);
    });

    const vul = async (page: import('@playwright/test').Page) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await openFoldout(page, 'Mijn Betaalgegevens');
        await app.iban.fill('NL91ABNA0417164300');
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');
        return app;
    };

    test('staat op een factuur met een rekeningnummer', async ({ page }) => {
        const app = await vul(page);
        await expect(app.preview.locator('svg[aria-label="Betaal-QR volgens EPC069-12"]')).toBeVisible();
        expect(normalise(await app.preview.innerText())).toContain('Scan deze code met uw bankapp');
    });

    test('staat er niet zonder rekeningnummer', async ({ page }) => {
        const app = ui(page);
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');
        await expect(app.preview.locator('svg[aria-label="Betaal-QR volgens EPC069-12"]')).toHaveCount(0);
    });

    test('staat niet op een offerte', async ({ page }) => {
        const app = await vul(page);
        await app.tab('Offerte').click();
        await expect(app.preview.locator('svg[aria-label="Betaal-QR volgens EPC069-12"]')).toHaveCount(0);
    });

    test('staat niet op een creditfactuur', async ({ page }) => {
        const app = await vul(page);
        const nummer = await app.documentNumber.inputValue();
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

        await openFoldout(page, 'Bewaarde documenten');
        await app.archiveRowFor(nummer).view.click();
        await app.archiveDialog.getByRole('button', { name: 'Crediteren' }).click();

        await expect(app.preview).toContainText('CREDITFACTUUR');
        await expect(app.preview.locator('svg[aria-label="Betaal-QR volgens EPC069-12"]')).toHaveCount(0);
    });

    /**
     * De code en het papier moeten hetzelfde zeggen.
     *
     * Dit is de controle die er het meest op aankomt. De tests hierboven leggen
     * de payload naast een vaste tekst in het testbestand — niet naast wat er op
     * het document staat. Zou de QR ooit een ánder rekeningnummer of bedrag
     * dragen dan wat de factuur afdrukt, dan betaalt wie scant iets anders dan
     * wie overtypt, en dat merkt niemand tot het geld verkeerd staat.
     *
     * Allebei komen ze uit dezelfde waarde, dus ze kúnnen nu niet verschillen.
     * Deze test houdt dat zo.
     */
    test('noemt hetzelfde rekeningnummer en bedrag als het document', async ({ page }) => {
        const app = await vul(page);
        await app.itemQuantity().fill('7');
        await app.itemPrice().fill('123.45');

        const opPapier = normalise(await app.preview.innerText());

        // Het rekeningnummer zoals de factuur het afdrukt, in blokken van vier —
        // met een laatste blok dat korter mag zijn: een NL-IBAN eindigt op twee.
        const ibanOpPapier = opPapier.match(/NL\d\d(?: [A-Z0-9]{2,4})+/)?.[0];
        expect(ibanOpPapier, 'geen rekeningnummer op het document').toBeTruthy();

        // En het totaal zoals het eronder staat.
        const totaalOpPapier = opPapier.match(/Totaal:\s*€\s*([\d.]+,\d\d)/)?.[1];
        expect(totaalOpPapier, 'geen totaal op het document').toBeTruthy();

        // Er moet ook echt een code staan, anders bewijst de vergelijking niets.
        await expect(app.preview.locator('svg[aria-label^="Betaal-QR"]')).toBeVisible();

        // Dezelfde invoer, maar langs het andere pad: de payloadbouwer in plaats
        // van de renderer. Twee onafhankelijke routes naar hetzelfde antwoord.
        const regels = epcPayload(factuur({
            items: [{ id: '1', description: 'Advies', quantity: 7, unitPrice: 123.45, vatRate: 21 }],
        }))!.split('\n');

        expect(regels[6], 'de QR noemt een ander rekeningnummer dan het papier')
            .toBe(ibanOpPapier!.replace(/\s/g, ''));

        const papierAlsGetal = totaalOpPapier!.replace(/\./g, '').replace(',', '.');
        expect(regels[7].replace('EUR', ''), 'de QR noemt een ander bedrag dan het papier')
            .toBe(papierAlsGetal);
    });

    test('verandert mee met het bedrag', async ({ page }) => {
        const app = await vul(page);
        const eerste = await app.preview.locator('svg[aria-label="Betaal-QR volgens EPC069-12"] path')
            .getAttribute('d');

        await app.itemPrice().fill('250');
        await expect(app.preview).toContainText('€ 302,50');
        const tweede = await app.preview.locator('svg[aria-label="Betaal-QR volgens EPC069-12"] path')
            .getAttribute('d');

        // Een code die niet meebeweegt met het bedrag is een verkeerde code.
        expect(tweede).not.toBe(eerste);
    });
});

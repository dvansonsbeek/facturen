import { test, expect } from '@playwright/test';
import { ui, openFoldout, openApp } from './helpers';
import { inspecteerBackup, vervangingsVraag } from '../lib/backup';

/**
 * Importeren vervangt alles wat er in deze browser staat, en is daarmee net zo
 * ingrijpend als Wissen — dat wél om bevestiging vroeg en zelfs vertelde
 * hoeveel er weg zou gaan.
 *
 * Erger nog: er werd gewist vóórdat bleek of er iets bruikbaars in het bestand
 * stond. Eén verkeerd JSON-bestand uit je downloadmap was genoeg om je archief
 * kwijt te raken. Die twee dingen toetsen deze tests.
 */

test.describe('het bestand nalopen voordat er iets gebeurt', () => {
    test('wijst iets dat geen JSON is af', async () => {
        const uit = inspecteerBackup('dit is gewoon tekst');
        expect(uit.ok).toBe(false);
        if (!uit.ok) expect(uit.problemen[0]).toContain('geen JSON');
    });

    test('wijst een archief af dat geen documenten bevat', async () => {
        // Precies het geval dat eerder je archief leegde.
        const uit = inspecteerBackup(JSON.stringify({ sender: {}, documents: [1, 2, 3] }));
        expect(uit.ok).toBe(false);
        if (!uit.ok) expect(uit.problemen[0]).toContain('document 1');
    });

    test('noemt alles wat er mis is, niet alleen het eerste', async () => {
        const uit = inspecteerBackup(JSON.stringify({
            sender: {},
            documents: 'geen lijst',
            clients: [{ geenNaam: true }],
            kluis: { kop: {} },
        }));
        expect(uit.ok).toBe(false);
        if (!uit.ok) expect(uit.problemen.length).toBeGreaterThanOrEqual(3);
    });

    test('accepteert een versleuteld klantenboek', async () => {
        const uit = inspecteerBackup(JSON.stringify({
            sender: { name: 'Sonsbeek Advies BV' },
            clients: { v: 1, iv: [1, 2, 3], data: [4, 5, 6] },
        }));
        expect(uit.ok).toBe(true);
        if (uit.ok) expect(uit.inhoud.klanten).toBe('versleuteld');
    });

    test('accepteert een heel oud bestand met alleen bedrijfsgegevens', async () => {
        // Toen bevatte het bestand de afzender zelf, zonder iets eromheen.
        const uit = inspecteerBackup(JSON.stringify({ name: 'Sonsbeek Advies BV', city: 'Arnhem' }));
        expect(uit.ok).toBe(true);
        if (uit.ok) expect(uit.inhoud.heeftBedrijfsgegevens).toBe(true);
    });

    test('telt wat erin zit, zodat ernaar gevraagd kan worden', async () => {
        const uit = inspecteerBackup(JSON.stringify({
            sender: { name: 'X' },
            clients: [{ id: 'a', name: 'Klant A' }, { id: 'b', name: 'Klant B' }],
            documents: [{ id: '1', nummer: '2026-001', soort: 'factuur', document: {} }],
        }));
        expect(uit.ok).toBe(true);
        if (!uit.ok) return;
        expect(uit.inhoud.documenten).toBe(1);
        expect(uit.inhoud.klanten).toBe(2);

        const vraag = vervangingsVraag(uit.inhoud, { documenten: 5, klanten: 3 });
        expect(vraag).toContain('1 bewaard document');
        expect(vraag).toContain('2 klanten');
        // En wat er nu staat, want dat is wat je kwijtraakt.
        expect(vraag).toContain('5 documenten en 3 klanten');
    });

    test('waarschuwt als het bestand versleuteld is', async () => {
        const uit = inspecteerBackup(JSON.stringify({
            sender: { name: 'X' },
            kluis: { id: 'sleutel', kop: { zout: [1], ronden: 600000 }, proef: { v: 1, iv: [1], data: [2] } },
        }));
        expect(uit.ok).toBe(true);
        if (!uit.ok) return;
        expect(uit.inhoud.versleuteld).toBe(true);
        expect(vervangingsVraag(uit.inhoud, { documenten: 0, klanten: 0 }))
            .toContain('wachtwoordzin');
    });
});

test.describe('in de app', () => {
    test.beforeEach(async ({ page }) => {
        await openApp(page);
    });

    /** Een bewaard document, zodat er iets te verliezen valt. */
    const metArchief = async (page: import('@playwright/test').Page) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');
        await app.saveClient.click();
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();
        return app;
    };

    /** Biedt een bestand aan bij Import, zonder de schijf aan te raken. */
    const importeer = async (page: import('@playwright/test').Page, inhoud: string) => {
        await page.locator('input[type="file"][accept=".json"]').setInputFiles({
            name: 'facturen_instellingen.json',
            mimeType: 'application/json',
            buffer: Buffer.from(inhoud),
        });
    };

    test('een onbruikbaar bestand laat het archief met rust', async ({ page }) => {
        const app = await metArchief(page);

        const melding = new Promise<string>((klaar) => {
            page.once('dialog', (d) => { klaar(d.message()); d.dismiss(); });
        });
        await importeer(page, JSON.stringify({ sender: {}, documents: [1, 2, 3] }));

        expect(await melding).toContain('Er is niets gewijzigd');

        // En dat is ook echt zo.
        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(1);
        await expect(app.clientPicker.locator('option', { hasText: 'Klant BV' })).toHaveCount(1);
    });

    test('vraagt om bevestiging en noemt wat er vervangen wordt', async ({ page }) => {
        const app = await metArchief(page);

        const vraag = new Promise<string>((klaar) => {
            page.once('dialog', (d) => { klaar(d.message()); d.dismiss(); });
        });
        await importeer(page, JSON.stringify({
            sender: { name: 'Andere BV' },
            documents: [],
            clients: [],
        }));

        const tekst = await vraag;
        expect(tekst).toContain('1 document');
        expect(tekst).toContain('Doorgaan?');

        // Afgewezen betekent: er is niets gebeurd.
        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(1);
        await expect(app.companyName).toHaveValue('Sonsbeek Advies BV');
    });

    test('vervangt alles pas na bevestiging', async ({ page }) => {
        const app = await metArchief(page);

        page.once('dialog', (d) => d.accept());
        await importeer(page, JSON.stringify({
            sender: { name: 'Andere BV', address: 'Nieuwstraat 1' },
            clients: [{ id: 'z', name: 'Nieuwe Klant BV' }],
            documents: [],
            numbering: { factuur: '2026-050', offerte: 'OFF-2026-050' },
        }));

        await expect(app.status.filter({ hasText: 'Geïmporteerd' })).toBeVisible();
        await expect(app.companyName).toHaveValue('Andere BV');
        await expect(app.documentNumber).toHaveValue('2026-050');
        await expect(app.clientPicker.locator('option', { hasText: 'Nieuwe Klant BV' })).toHaveCount(1);
        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(0);
    });

    test('een bestand zonder archief laat het archief staan', async ({ page }) => {
        const app = await metArchief(page);

        page.once('dialog', (d) => d.accept());
        // Alleen bedrijfsgegevens: zo zag een bestand er vroeger uit.
        await importeer(page, JSON.stringify({ name: 'Andere BV' }));

        await expect(app.status.filter({ hasText: 'Geïmporteerd' })).toBeVisible();
        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(1);
    });

    test('wat Export schrijft, kan Import weer lezen', async ({ page }) => {
        const app = await metArchief(page);
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            app.exportSettings.click(),
        ]);
        const stream = await download.createReadStream();
        const stukken: Buffer[] = [];
        for await (const s of stream!) stukken.push(s as Buffer);
        const bestand = Buffer.concat(stukken).toString('utf8');

        // De twee kanten van hetzelfde formaat horen bij elkaar te passen.
        const uit = inspecteerBackup(bestand);
        expect(uit.ok, !uit.ok ? uit.problemen.join(', ') : '').toBe(true);
        if (uit.ok) {
            expect(uit.inhoud.documenten).toBe(1);
            expect(uit.inhoud.klanten).toBe(1);
            expect(uit.inhoud.heeftBedrijfsgegevens).toBe(true);
        }
    });
});

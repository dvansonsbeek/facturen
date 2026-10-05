import { test, expect } from '@playwright/test';
import { ui, normalise, openFoldout } from './helpers';

/**
 * De optionele wachtwoordzin op het archief.
 *
 * De kern van deze suite is wat er daadwerkelijk op schijf staat. Een test die
 * alleen kijkt of het scherm "versleuteld" zegt, bewijst niets: de vraag is of
 * iemand die bij dit browserprofiel kan er nog klantnamen en bedragen uit haalt.
 * Daarom leest `ruweRecords` IndexedDB rechtstreeks uit, buiten de app om.
 */
const ZIN = 'mijn lange wachtwoordzin';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
});

/** Leest de documentenwinkel rechtstreeks uit, zoals een indringer dat zou doen. */
const ruweRecords = (page: import('@playwright/test').Page) =>
    page.evaluate(() => new Promise<unknown[]>((klaar, mislukt) => {
        const verzoek = indexedDB.open('facturen');
        verzoek.onsuccess = () => {
            const db = verzoek.result;
            const transactie = db.transaction('documenten', 'readonly');
            const alles = transactie.objectStore('documenten').getAll();
            alles.onsuccess = () => { klaar(alles.result); db.close(); };
            alles.onerror = () => mislukt(alles.error);
        };
        verzoek.onerror = () => mislukt(verzoek.error);
    }));

const vulEnBewaar = async (page: import('@playwright/test').Page) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.clientName.fill('Gevoelige Klant BV');
    await app.itemDescription().fill('Advies');
    await app.itemPrice().fill('100');
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();
    return app;
};

const openBeveiliging = (page: import('@playwright/test').Page) =>
    openFoldout(page, 'Beveiliging en privacy');

const stelZinIn = async (page: import('@playwright/test').Page, zin = ZIN) => {
    const app = ui(page);
    await openBeveiliging(page);
    await app.newPassphrase.fill(zin);
    await app.repeatPassphrase.fill(zin);
    page.once('dialog', (d) => d.accept());
    await app.encryptArchive.click();
    await expect(app.securityStatus.filter({ hasText: 'nu versleuteld' })).toBeVisible({ timeout: 30000 });
};

test('zonder wachtwoordzin staat het archief leesbaar op schijf', async ({ page }) => {
    // De uitgangssituatie, zodat de test hieronder iets betekent.
    await vulEnBewaar(page);
    expect(JSON.stringify(await ruweRecords(page))).toContain('Gevoelige Klant BV');
});

test('na het instellen van een zin staat er geen leesbare klantnaam meer', async ({ page }) => {
    await vulEnBewaar(page);
    await stelZinIn(page);

    const ruw = JSON.stringify(await ruweRecords(page));
    expect(ruw, 'de klantnaam is nog leesbaar op schijf').not.toContain('Gevoelige Klant BV');
    expect(ruw, 'het bedrag is nog leesbaar op schijf').not.toContain('Sonsbeek Advies BV');
    // Het factuurnummer zat eerder in het id; dat mag er dus ook niet meer staan.
    expect(ruw, 'het factuurnummer is nog leesbaar op schijf').not.toContain('2026-001');
    expect(ruw).toContain('blok');
});

test('het archief blijft leesbaar in de sessie waarin je de zin instelt', async ({ page }) => {
    const app = await vulEnBewaar(page);
    await stelZinIn(page);

    await openFoldout(page, 'Bewaarde documenten');
    await expect(app.archiveRows).toHaveCount(1);
    expect(normalise(await app.archiveRow().row.innerText())).toContain('Gevoelige Klant BV');
});

test.describe('na herladen', () => {
    test('is het archief vergrendeld en toont het geen gegevens', async ({ page }) => {
        const app = await vulEnBewaar(page);
        await stelZinIn(page);
        await page.reload();

        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(0);
        await expect(page.locator('.archief-vergrendeld')).toBeVisible();
        // Niet "leeg": dat zou de indruk geven dat het archief weg is.
        await expect(page.locator('.archief-vergrendeld')).toContainText('versleuteld');
    });

    test('opent de juiste zin het archief weer', async ({ page }) => {
        const app = await vulEnBewaar(page);
        await stelZinIn(page);
        await page.reload();

        await openBeveiliging(page);
        await app.passphrase.fill(ZIN);
        await app.unlockArchive.click();

        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(1, { timeout: 30000 });
        expect(normalise(await app.archiveRow().row.innerText())).toContain('Gevoelige Klant BV');
    });

    test('opent een verkeerde zin niets en zegt dat', async ({ page }) => {
        const app = await vulEnBewaar(page);
        await stelZinIn(page);
        await page.reload();

        await openBeveiliging(page);
        await app.passphrase.fill('een heel andere zin');
        await app.unlockArchive.click();

        await expect(app.securityStatus.filter({ hasText: 'klopt niet' })).toBeVisible({ timeout: 30000 });
        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(0);
    });

    test('kun je niet bewaren zolang het vergrendeld is', async ({ page }) => {
        await vulEnBewaar(page);
        await stelZinIn(page);
        await page.reload();

        const app = ui(page);
        await app.itemPrice().fill('200');
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'vergrendeld' })).toBeVisible();

        // En er is niets bijgeschreven.
        expect(await ruweRecords(page)).toHaveLength(1);
    });
});

test('Vergrendelen sluit het archief zonder de pagina te herladen', async ({ page }) => {
    const app = await vulEnBewaar(page);
    await stelZinIn(page);

    await openBeveiliging(page);
    await app.lockArchive.click();

    await openFoldout(page, 'Bewaarde documenten');
    await expect(app.archiveRows).toHaveCount(0);
    await expect(page.locator('.archief-vergrendeld')).toBeVisible();
});

test('de versleuteling eraf halen maakt het archief weer leesbaar', async ({ page }) => {
    const app = await vulEnBewaar(page);
    await stelZinIn(page);

    await openBeveiliging(page);
    page.once('dialog', (d) => d.accept());
    await app.removePassphrase.click();
    await expect(app.securityStatus.filter({ hasText: 'eraf' })).toBeVisible();

    expect(JSON.stringify(await ruweRecords(page))).toContain('Gevoelige Klant BV');

    await page.reload();
    await openFoldout(page, 'Bewaarde documenten');
    await expect(app.archiveRows).toHaveCount(1);
});

test.describe('Export', () => {
    /**
     * Een reservekopie die alles alsnog leesbaar wegschrijft haalt de
     * versleuteling onderuit: wie zijn archief beveiligt verwacht niet dat het
     * bestand dat naast de app komt te liggen dat niet is.
     */
    test('schrijft een versleuteld archief ook versleuteld weg', async ({ page }) => {
        const app = await vulEnBewaar(page);
        await stelZinIn(page);

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            app.exportSettings.click(),
        ]);
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream!) chunks.push(chunk as Buffer);
        const tekst = Buffer.concat(chunks).toString('utf8');

        expect(tekst).not.toContain('Gevoelige Klant BV');
        const bestand = JSON.parse(tekst);
        expect(bestand.documents).toHaveLength(1);
        expect(bestand.documents[0].blok).toBeTruthy();
        // De kop moet mee, anders valt er niets meer af te leiden uit de zin.
        expect(bestand.documentsKey.zout).toBeTruthy();
        expect(bestand.documentsKey.ronden).toBeGreaterThanOrEqual(600_000);
    });

    test('neemt een onversleuteld archief leesbaar mee', async ({ page }) => {
        const app = await vulEnBewaar(page);

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            app.exportSettings.click(),
        ]);
        const stream = await download.createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream!) chunks.push(chunk as Buffer);
        const bestand = JSON.parse(Buffer.concat(chunks).toString('utf8'));

        expect(bestand.documents[0].klant).toBe('Gevoelige Klant BV');
        expect(bestand.documentsKey).toBeNull();
    });
});

test('Wissen haalt ook de wachtwoordzin weg', async ({ page }) => {
    const app = await vulEnBewaar(page);
    await stelZinIn(page);

    page.once('dialog', (d) => d.accept());
    await app.clearSettings.click();

    await expect(app.archiveRows).toHaveCount(0);
    expect(await ruweRecords(page)).toHaveLength(0);

    // Geen kluis meer: na herladen vraagt hij niets en is er niets vergrendeld.
    await page.reload();
    await openBeveiliging(page);
    await expect(app.newPassphrase).toBeVisible();
});

test.describe('de uitleg', () => {
    test('noemt waar het risico zit en wat een zin niet oplost', async ({ page }) => {
        await openBeveiliging(page);
        const tekst = normalise(await page.locator('.foldout', { has: page.locator('h3', { hasText: 'Beveiliging' }) }).innerText());

        // Dit is de kern van wat de gebruiker moet weten om te kiezen.
        expect(tekst).toContain('dit apparaat');
        expect(tekst).toContain('extensie');
        expect(tekst).toMatch(/helpt een wachtwoordzin niet tegen/i);
        expect(tekst).toMatch(/geen herstelcode/i);
    });

    test('zegt dat een te korte zin niet volstaat', async ({ page }) => {
        const app = ui(page);
        await openBeveiliging(page);
        await app.newPassphrase.fill('kort');
        await app.repeatPassphrase.fill('kort');
        await app.encryptArchive.click();
        await expect(app.securityStatus.filter({ hasText: '12 tekens' })).toBeVisible();
    });

    test('weigert twee zinnen die niet gelijk zijn', async ({ page }) => {
        const app = ui(page);
        await openBeveiliging(page);
        await app.newPassphrase.fill('een lange genoege zin');
        await app.repeatPassphrase.fill('een andere lange zin');
        await app.encryptArchive.click();
        await expect(app.securityStatus.filter({ hasText: 'niet gelijk' })).toBeVisible();
    });
});

import { test, expect } from '@playwright/test';
import { ui, normalise, openFoldout, waitForHydration, openApp } from './helpers';

/**
 * De optionele wachtwoordzin, over het archief én het klantenboek.
 *
 * De kern van deze suite is wat er daadwerkelijk op schijf staat. Een test die
 * alleen kijkt of het scherm "versleuteld" zegt, bewijst niets: de vraag is of
 * iemand die bij dit browserprofiel kan er nog klantnamen en bedragen uit haalt.
 * Daarom lezen `ruweRecords` en `ruweKlanten` IndexedDB en localStorage
 * rechtstreeks uit, buiten de app om.
 */
const ZIN = 'mijn lange wachtwoordzin';

test.beforeEach(async ({ page }) => {
    await openApp(page);
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

/** Leest het klantenboek rechtstreeks uit localStorage. */
const ruweKlanten = (page: import('@playwright/test').Page) =>
    page.evaluate(() => localStorage.getItem('facturen.klanten'));

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

/** Zet een klant in het boek, zodat er iets te versleutelen valt. */
const bewaarKlant = async (page: import('@playwright/test').Page, naam = 'Boekklant BV') => {
    const app = ui(page);
    await app.clientName.fill(naam);
    await app.clientAddress.fill('Kerkstraat 1');
    await app.saveClient.click();
    await expect(app.clientPicker).toHaveValue(/.+/);
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
        await waitForHydration(page);

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
        // Het klantenboek hoort er net zo versleuteld in te staan.
        expect(bestand.clients.iv).toBeTruthy();
        expect(bestand.clients.data).toBeTruthy();
        // Kop én proef moeten mee: zonder de kop valt er niets af te leiden uit
        // de zin, zonder de proef is niet te zien of hij klopt.
        expect(bestand.kluis.kop.zout).toBeTruthy();
        expect(bestand.kluis.kop.ronden).toBeGreaterThanOrEqual(600_000);
        expect(bestand.kluis.proef).toBeTruthy();
        // En je eigen bedrijfsgegevens blijven juist leesbaar; dat is de keuze.
        expect(bestand.sender.name).toBe('Sonsbeek Advies BV');
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
        expect(bestand.kluis).toBeNull();
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

test.describe('het klantenboek', () => {
    test('staat zonder wachtwoordzin leesbaar op schijf', async ({ page }) => {
        // De uitgangssituatie, zodat de test hieronder iets betekent.
        await bewaarKlant(page);
        expect(await ruweKlanten(page)).toContain('Boekklant BV');
    });

    test('is na het instellen van een zin niet meer te lezen', async ({ page }) => {
        await bewaarKlant(page);
        await stelZinIn(page);

        const ruw = await ruweKlanten(page);
        expect(ruw, 'de klantnaam is nog leesbaar op schijf').not.toContain('Boekklant BV');
        expect(ruw, 'het adres is nog leesbaar op schijf').not.toContain('Kerkstraat');
        expect(ruw).toContain('"iv"');
    });

    test('blijft leesbaar in de sessie waarin je de zin instelt', async ({ page }) => {
        const app = await bewaarKlant(page);
        await stelZinIn(page);
        await expect(app.clientPicker.locator('option', { hasText: 'Boekklant BV' })).toHaveCount(1);
    });

    test('is na herladen leeg, met uitleg waarom', async ({ page }) => {
        const app = await bewaarKlant(page);
        await stelZinIn(page);
        await page.reload();
        await waitForHydration(page);

        await expect(app.clientPicker.locator('option')).toHaveCount(1);
        await expect(page.locator('.klantenboek-vergrendeld')).toBeVisible();
        await expect(page.locator('.klantenboek-vergrendeld')).toContainText('versleuteld');
    });

    test('komt terug na ontgrendelen', async ({ page }) => {
        const app = await bewaarKlant(page);
        await stelZinIn(page);
        await page.reload();

        await openBeveiliging(page);
        await app.passphrase.fill(ZIN);
        await app.unlockArchive.click();

        await expect(app.clientPicker.locator('option', { hasText: 'Boekklant BV' }))
            .toHaveCount(1, { timeout: 30000 });
        await expect(page.locator('.klantenboek-vergrendeld')).toHaveCount(0);
    });

    /**
     * Niet gemak maar noodzaak: een leesbare klant naast een versleuteld blok
     * wegschrijven zou het halve boek alsnog open leggen.
     */
    test('weigert opslaan zolang het vergrendeld is', async ({ page }) => {
        await bewaarKlant(page);
        await stelZinIn(page);
        await page.reload();
        await waitForHydration(page);

        const app = ui(page);
        await app.clientName.fill('Nieuwe Klant BV');
        await expect(app.saveClient).toBeDisabled();

        // En er is niets bijgeschreven dat leesbaar is.
        expect(await ruweKlanten(page)).not.toContain('Nieuwe Klant BV');
    });

    test('laat een factuur maken terwijl het vergrendeld is', async ({ page }) => {
        await bewaarKlant(page);
        await stelZinIn(page);
        await page.reload();
        await waitForHydration(page);

        // Dit is waarom bedrijfsgegevens en nummering leesbaar blijven: de app
        // moet zonder de zin bruikbaar zijn.
        const app = ui(page);
        await app.clientName.fill('Losse Klant BV');
        await app.itemPrice().fill('100');
        await expect(app.preview).toContainText('Losse Klant BV');
        await expect(app.preview).toContainText('€ 121,00');
    });

    test('de versleuteling eraf halen maakt het boek weer leesbaar', async ({ page }) => {
        const app = await bewaarKlant(page);
        await stelZinIn(page);

        await openBeveiliging(page);
        page.once('dialog', (d) => d.accept());
        await app.removePassphrase.click();
        await expect(app.securityStatus.filter({ hasText: 'eraf' })).toBeVisible();

        expect(await ruweKlanten(page)).toContain('Boekklant BV');
    });
});

test('je eigen bedrijfsgegevens blijven met een zin leesbaar, en dat is de bedoeling', async ({ page }) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.documentNumber.fill('2026-042');
    await bewaarKlant(page);
    await stelZinIn(page);

    // Ze staan op elke factuur die je verstuurt en in het handelsregister;
    // versleutelen levert daar niets op en zou de app onbruikbaar maken zonder
    // de zin. Deze test legt die keuze vast, zodat hij niet per ongeluk omgaat.
    expect(await page.evaluate(() => localStorage.getItem('facturen.bedrijfsgegevens')))
        .toContain('Sonsbeek Advies BV');
    expect(await page.evaluate(() => localStorage.getItem('facturen.nummering')))
        .toContain('2026-042');
});

/**
 * De hele rondgang: versleutelen, exporteren, wissen, importeren, ontgrendelen.
 *
 * Dit is waarom de kluis — kop én proef — in het exportbestand meegaat: zodat
 * dezelfde wachtwoordzin het bestand elders weer opent. Dat stond zo in de
 * documentatie en werd nergens nagelopen. De losse stukken waren wel getoetst
 * (Export schrijft versleuteld, Import vraagt om een zin), maar niet dat het
 * invoeren van die zin je gegevens echt terugbrengt.
 *
 * Juist deze route mag niet stilletjes stuk zijn: hij wordt pas gebruikt als
 * het ergens anders al misgegaan is, en de app noemt Export je enige kopie.
 */
test('een versleutelde reservekopie is terug te zetten en te openen', async ({ page }) => {
    const app = ui(page);

    // Iets om kwijt te raken: een klant in het boek en een bewaarde factuur.
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.clientName.fill('Gevoelige Klant BV');
    await app.clientAddress.fill('Kerkstraat 1');
    await app.saveClient.click();
    await app.itemDescription().fill('Advies');
    await app.itemPrice().fill('100');
    const nummer = await app.documentNumber.inputValue();
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    await stelZinIn(page);

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.exportSettings.click(),
    ]);
    const stream = await download.createReadStream();
    const stukken: Buffer[] = [];
    for await (const s of stream!) stukken.push(s as Buffer);
    const backup = Buffer.concat(stukken);

    // De kopie hoort versleuteld te zijn; anders bewijst de rest niets.
    expect(backup.toString('utf8')).not.toContain('Gevoelige Klant BV');

    // Alles weg, zoals na een gewiste browser of op een ander apparaat.
    page.once('dialog', (d) => d.accept());
    await app.clearSettings.click();
    await expect(app.archiveRows).toHaveCount(0);

    page.once('dialog', (d) => d.accept());
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
        name: 'facturen_instellingen.json',
        mimeType: 'application/json',
        buffer: backup,
    });
    await expect(app.status.filter({ hasText: 'versleuteld' })).toBeVisible();

    // Vergrendeld binnengekomen: zonder de zin zie je niets.
    await openFoldout(page, 'Bewaarde documenten');
    await expect(app.archiveRows).toHaveCount(0);
    await expect(page.locator('.klantenboek-vergrendeld')).toBeVisible();

    // En dan het punt van de hele oefening.
    await openBeveiliging(page);
    await app.passphrase.fill(ZIN);
    await app.unlockArchive.click();

    await openFoldout(page, 'Bewaarde documenten');
    await expect(app.archiveRows).toHaveCount(1, { timeout: 30000 });
    expect(normalise(await app.archiveRow().row.innerText())).toContain('Gevoelige Klant BV');
    expect(normalise(await app.archiveRow().row.innerText())).toContain(nummer);
    await expect(app.clientPicker.locator('option', { hasText: 'Gevoelige Klant BV' }))
        .toHaveCount(1);
});

test('een versleutelde kopie gaat niet open met de verkeerde zin', async ({ page }) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.clientName.fill('Gevoelige Klant BV');
    await app.itemPrice().fill('100');
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();
    await stelZinIn(page);

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.exportSettings.click(),
    ]);
    const stream = await download.createReadStream();
    const stukken: Buffer[] = [];
    for await (const s of stream!) stukken.push(s as Buffer);

    page.once('dialog', (d) => d.accept());
    await app.clearSettings.click();
    page.once('dialog', (d) => d.accept());
    await page.locator('input[type="file"][accept=".json"]').setInputFiles({
        name: 'facturen_instellingen.json',
        mimeType: 'application/json',
        buffer: Buffer.concat(stukken),
    });

    await openBeveiliging(page);
    await app.passphrase.fill('een heel andere zin');
    await app.unlockArchive.click();

    // De proef uit het bestand hoort dit te zien zonder aan de gegevens te komen.
    await expect(app.securityStatus.filter({ hasText: 'klopt niet' }))
        .toBeVisible({ timeout: 30000 });
    await openFoldout(page, 'Bewaarde documenten');
    await expect(app.archiveRows).toHaveCount(0);
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

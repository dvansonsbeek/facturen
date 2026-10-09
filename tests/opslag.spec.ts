import { test, expect, type Page } from '@playwright/test';
import { ui, openFoldout, openApp } from './helpers';

/**
 * Een browser die geen opslagruimte vrijgeeft.
 *
 * In privémodus — of met opslag uitgezet door een beheerder — werpt het
 * aanspreken van IndexedDB een fout. lib/idb.ts zet dan `werkt` om, en op drie
 * plekken hoort de app dat te zéggen in plaats van stilzwijgend niets te
 * bewaren: in het archief, in de beveiligingssectie, en bij Bewaren zelf.
 *
 * Dat was nergens getoetst. Het is precies de vorm die eerder misging met
 * `worker-src`: een pad dat niet kapot gaat maar terugvalt, en waar dus niets
 * aan te zien is zolang niemand ernaar kijkt.
 */

/** Zoals Firefox in privémodus: indexedDB aanspreken werpt al. */
const blokkeerOpslag = (page: Page) => page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
        configurable: true,
        get() { throw new DOMException('geblokkeerd', 'SecurityError'); },
    });
});

const MELDING = 'Deze browser geeft geen opslagruimte vrij';

test.describe('zonder opslagruimte', () => {
    test.beforeEach(async ({ page }) => {
        await blokkeerOpslag(page);
        await openApp(page);
    });

    /**
     * Begrensd tot de sectie zelf: het archief en de beveiligingssectie zeggen
     * hetzelfde, dus een ongebonden zoeker vindt ze allebei en klaagt.
     */
    test('het archief zegt dat bewaren niet werkt', async ({ page }) => {
        const sectie = await openFoldout(page, 'Bewaarde documenten');
        await expect(sectie.locator('p[role="status"]', { hasText: MELDING })).toBeVisible();
    });

    test('de beveiligingssectie zegt het ook', async ({ page }) => {
        await openFoldout(page, 'Beveiliging en privacy');
        await expect(ui(page).securityStatus.filter({ hasText: MELDING })).toBeVisible();
    });

    /**
     * De belangrijkste: niet doen alsof. Een factuur die volgens het scherm
     * bewaard is maar nergens staat, is erger dan een factuur die niet bewaard
     * kon worden — dan ga je hem later zoeken.
     */
    test('Bewaren meldt dat het niet gelukt is, en doet niet alsof', async ({ page }) => {
        const app = ui(page);
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');
        await app.saveDocument.click();

        await expect(app.status.filter({ hasText: 'Bewaren is niet gelukt' })).toBeVisible();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toHaveCount(0);
    });

    /** Factureren moet gewoon kunnen; alleen bewaren valt weg. */
    test('de rest van de app werkt wel', async ({ page }) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');
        await expect(app.preview).toContainText('Klant BV');
        await expect(app.preview).toContainText('€ 121,00');
    });
});

/**
 * De tweede manier waarop bewaren misgaat, en de waarschijnlijkste.
 *
 * Hierboven werpt het aanspreken van indexedDB al, zoals in privémodus. Maar een
 * archief dat jaren groeit loopt tegen iets anders aan: de database gaat wél open
 * en de *schrijfactie* mislukt. Dat is een andere tak van metWinkel — de tweede
 * try — en daar blijft `werkt` waar, dus het archief en de beveiligingssectie
 * zwijgen en alleen de bewaarmelding zegt het.
 *
 * De fout is nagebootst en niet echt opgewekt: de quota van IndexedDB vollopen
 * duurt in een test te lang. Wat eronder zit is hetzelfde — add() gooit, en
 * bewaarDocument hoort dat op te vangen.
 */
test.describe('als de schrijfactie mislukt', () => {
    test.beforeEach(async ({ page }) => {
        await page.addInitScript(() => {
            const echteAdd = IDBObjectStore.prototype.add;
            IDBObjectStore.prototype.add = function (
                this: IDBObjectStore, waarde: unknown, sleutel?: IDBValidKey,
            ) {
                if (this.name === 'documenten') {
                    throw new DOMException('quota vol', 'QuotaExceededError');
                }
                return echteAdd.call(this, waarde, sleutel);
            };
        });
        await openApp(page);
    });

    test('zegt dat bewaren niet gelukt is', async ({ page }) => {
        const app = ui(page);
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');
        await app.saveDocument.click();

        await expect(app.status.filter({ hasText: 'Bewaren is niet gelukt' })).toBeVisible();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toHaveCount(0);
    });

    /**
     * En laat geen spookregel achter. bewaarDocument werkt de cache pas bij nadat
     * de schrijfactie is gelukt; een document dat in het archief staat maar niet
     * op schijf, zou je na herladen kwijt zijn zonder dat iets dat ooit heeft
     * gezegd.
     */
    test('en zet het document niet alsnog in het archief', async ({ page }) => {
        const app = ui(page);
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'Bewaren is niet gelukt' })).toBeVisible();

        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(0);
    });
});

/**
 * De tegenproef. Zonder deze bewijzen de tests hierboven niets: een melding die
 * er altijd staat, zegt niets over de toestand waarin hij hoort te staan.
 */
test.describe('met opslagruimte', () => {
    test.beforeEach(async ({ page }) => {
        await openApp(page);
    });

    test('staat die waarschuwing er niet', async ({ page }) => {
        const archief = await openFoldout(page, 'Bewaarde documenten');
        await expect(archief.locator('p[role="status"]', { hasText: MELDING })).toHaveCount(0);
        await openFoldout(page, 'Beveiliging en privacy');
        await expect(ui(page).securityStatus.filter({ hasText: MELDING })).toHaveCount(0);
    });

    test('en bewaren lukt wel', async ({ page }) => {
        const app = ui(page);
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

        // Lokale tegenproef voor 'zet het document niet alsnog in het archief':
        // zonder deze regel zou die test ook slagen als het archief nooit iets
        // toonde.
        await openFoldout(page, 'Bewaarde documenten');
        await expect(app.archiveRows).toHaveCount(1);
    });
});

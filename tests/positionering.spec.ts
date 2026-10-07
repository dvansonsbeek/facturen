import { test, expect } from '@playwright/test';
import { openFoldout, normalise, waitForHydration } from './helpers';

/**
 * De beloften waarop deze app zich onderscheidt.
 *
 * Niet "privacyvriendelijk" — dat zegt niemand iets — maar de gevolgen ervan:
 * geen account, geen betaalde versie, geen verwerker, geen lock-in. Dat zijn de
 * dingen die een boekhoudpakket niet kan nazeggen zonder zijn verdienmodel op te
 * geven, en ze staan verspreid over de app.
 *
 * Ze staan hier bij elkaar omdat het beloften zijn en geen opmaak: verdwijnt er
 * een, dan is dat een inhoudelijke wijziging en hoort dat op te vallen.
 *
 * Let op wat er óók getoetst wordt: de grenzen. Een claim die mooier wordt door
 * de nuance weg te laten, is precies de verkeerde kant op — zie SecurityPanel,
 * waar hetzelfde geldt voor wat versleuteling wel en niet doet.
 */

test.describe('geen verwerker', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('legt uit wat "geen server" juridisch betekent', async ({ page }) => {
        const sectie = await openFoldout(page, 'Beveiliging en privacy');
        const tekst = normalise(await sectie.innerText());

        expect(tekst).toContain('verwerker');
        expect(tekst).toContain('verwerkersovereenkomst');
        // De kern: bij een online pakket is de leverancier verwerker, hier niet.
        expect(tekst).toContain('geen verwerker');
    });

    /**
     * En de grens erbij. Zonder deze zin leest het als "je hebt nergens meer mee
     * te maken", en dat is niet waar: de verantwoordelijkheid verhuist naar het
     * apparaat, hij verdwijnt niet.
     */
    test('en zegt er meteen bij wat níet verdwijnt', async ({ page }) => {
        const sectie = await openFoldout(page, 'Beveiliging en privacy');
        const tekst = normalise(await sectie.innerText());

        expect(tekst).toContain('zelf verantwoordelijk');
        expect(tekst).toContain('datalek');
    });
});

test.describe('geen betaalde versie', () => {
    test('staat in de voorwaarden, met de reden erbij', async ({ page }) => {
        await page.goto('/voorwaarden');
        const tekst = normalise(await page.locator('article').innerText());

        expect(tekst).toContain('Er is geen betaalde versie');
        expect(tekst).toContain('proefperiode');
        // Geen belofte maar een gevolg: de licentie maakt het onomkeerbaar.
        expect(tekst).toContain('MIT-licentie');
        // En geen verdienmodel langs een andere weg.
        expect(tekst).toContain('geen advertenties');
    });

    /**
     * Een vrijwillige bijdrage spreekt "er is geen betaalde versie" niet tegen —
     * mits erbij staat dat je er niets voor terugkrijgt. Dat zinnetje is wat het
     * verschil maakt tussen een gift en een verkapt abonnement, dus het hoort
     * vast te staan.
     */
    test('een bijdrage levert niets extra op, en dat staat er', async ({ page }) => {
        await page.goto('/voorwaarden');
        const tekst = normalise(await page.locator('article').innerText());

        expect(tekst).toContain('vrijwillig een bijdrage');
        expect(tekst).toContain('levert je niets extra');
        expect(tekst).toContain('geen uitgebreidere versie');
    });

    /**
     * Zonder NEXT_PUBLIC_KOFFIE hoort er geen verwijzing te staan — net als bij
     * de teller: niet ingesteld is niet aanwezig. Zo draaien de ontwikkelserver
     * en deze suite zonder.
     */
    test('zonder ingestelde naam staat er geen verwijzing', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('footer a[href*="buymeacoffee.com"]')).toHaveCount(0);
        // En er wordt nooit een knopscript van buiten geladen, met of zonder naam.
        await expect(page.locator('script[src*="buymeacoffee"], script[src*="ko-fi"]'))
            .toHaveCount(0);
    });
});

test.describe('welke versie je hebt', () => {
    /**
     * Sinds de app offline werkt, draait iemand mogelijk een versie van maanden
     * geleden. Dat mag — het is "een versie die je hebt" — maar dan moet wel te
     * zien zijn wélke, want btw-regels verschuiven. Zonder die datum is het geen
     * eigendom maar een verouderde kopie.
     */
    const VERSIESLEUTEL = 'facturen.laatstGezienVersie';

    /**
     * Online haalt de app vanzelf de nieuwste versie op, en dat is met opzet: zo
     * bereikt een herstelde fout iedereen, wat bij een factuurprogramma zwaarder
     * weegt dan voorspelbaarheid. De keerzijde is dat hij onder je handen
     * verandert, en dat hoort gezegd te worden.
     */
    test('zegt het als de app sinds je vorige bezoek is bijgewerkt', async ({ page }) => {
        await page.addInitScript(([sleutel]) => {
            localStorage.setItem(sleutel, '2019-03-04');
        }, [VERSIESLEUTEL]);
        await page.goto('/');
        await waitForHydration(page);

        const melding = page.locator('header p[role="status"]');
        await expect(melding).toContainText('bijgewerkt naar de versie van');
        await expect(melding).toContainText('4-03-2019');
    });

    /**
     * Eén keer, niet elke keer: bij het lezen is de nieuwe versie al vastgelegd.
     *
     * Hier geen addInitScript zoals hierboven — die draait bij élke navigatie,
     * dus ook bij de herlaadbeurt, en zet de oude versie dan opnieuw klaar. Dan
     * blijft de melding staan en lijkt de app stuk terwijl de test dat zelf doet.
     * Daarom via evaluate: één keer, na het eerste bezoek.
     */
    test('en daarna niet meer', async ({ page }) => {
        await page.goto('/');
        await waitForHydration(page);
        await page.evaluate(
            ([sleutel]) => localStorage.setItem(sleutel, '2019-03-04'),
            [VERSIESLEUTEL],
        );

        await page.reload();
        await waitForHydration(page);
        await expect(page.locator('header p[role="status"]')).toBeVisible();

        await page.reload();
        await waitForHydration(page);
        await expect(page.locator('header p[role="status"]')).toHaveCount(0);
    });

    /** Een eerste bezoek is geen wijziging; dan is er niets te melden. */
    test('zegt niets bij een eerste bezoek', async ({ page }) => {
        await page.goto('/');
        await waitForHydration(page);
        await expect(page.locator('header p[role="status"]')).toHaveCount(0);
    });

    test('de bouwdatum staat in de app, met de reden erbij', async ({ page }) => {
        await page.goto('/');
        const sectie = await openFoldout(page, 'Beveiliging en privacy');
        const tekst = normalise(await sectie.innerText());

        expect(tekst).toContain('Welke versie je hebt');
        expect(tekst).toContain('zonder internet');
        // De keerzijde hoort erbij: offline werken mag, offline blijven hangen niet.
        expect(tekst).toContain('Btw-tarieven');
    });
});

test.describe('wat een zoekresultaat laat zien', () => {
    /**
     * De omschrijving in de metadata is waarop iemand besluit te klikken, en
     * daarmee het eerste wat van de positionering overkomt. Hij hoort in
     * gevolgen te staan, niet in eigenschappen.
     */
    test('noemt de gevolgen en niet alleen de eigenschappen', async ({ page }) => {
        await page.goto('/');
        const omschrijving = await page.locator('meta[name="description"]')
            .getAttribute('content');

        expect(omschrijving).toContain('Geen account');
        expect(omschrijving).toContain('geen abonnement');
        expect(omschrijving).toContain('in je eigen browser');
        // Wat het is, hoort er ook in te staan.
        expect(omschrijving).toContain('e-factuur');
    });
});

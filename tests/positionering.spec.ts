import { test, expect } from '@playwright/test';
import { openFoldout, normalise } from './helpers';

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

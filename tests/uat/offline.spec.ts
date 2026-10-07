import { test, expect } from '@playwright/test';
import { ui, waitForHydration } from '../helpers';

/**
 * Werkt de app echt zonder netwerk?
 *
 * Dit is de hele claim achter de service worker, en hij is alleen hier te
 * toetsen: de registratie staat uit buiten de gepubliceerde build (zie
 * components/ServiceWorker.tsx), dus in de gewone suite tegen `next dev`
 * bestaat dit gedrag niet.
 *
 * Een losse test en niet een stap in reis.spec.ts: die reis is één doorlopende
 * staat, en de verbinding daarin wegnemen zou de stappen erna iets anders laten
 * toetsen dan waarvoor ze geschreven zijn.
 *
 * Wat er bewezen moet worden is niet dat er een service worker geregistreerd is
 * — dat zegt niets — maar dat je met de stekker eruit nog steeds een factuur
 * kunt maken die klopt.
 */
test('offline blijft de app een complete factuur maken', async ({ page, context }) => {
    test.setTimeout(120_000);

    await test.step('eerst één keer online, zodat de bestanden hier staan', async () => {
        await page.goto('./');
        await waitForHydration(page);
        await expect(ui(page).preview).toBeVisible();

        // Wachten tot de service worker het overneemt. Zonder dit is de cache
        // nog leeg en toetst de stap hierna alleen of Chromium een foutpagina
        // kan tonen.
        await page.waitForFunction(
            () => navigator.serviceWorker?.controller !== null,
            null,
            { timeout: 30_000 },
        );
    });

    await test.step('netwerk eruit', async () => {
        await context.setOffline(true);
        // Bewijs dat offline ook echt offline is: zonder deze controle zou de
        // test net zo goed slagen met een werkende verbinding.
        const bereikbaar = await page.evaluate(() =>
            fetch('https://example.com', { mode: 'no-cors' }).then(() => true).catch(() => false));
        expect(bereikbaar, 'de verbinding staat nog aan').toBe(false);
    });

    await test.step('de app opent nog steeds, uit de cache', async () => {
        await page.reload();
        await waitForHydration(page);
        await expect(ui(page).preview).toBeVisible();
    });

    await test.step('en rekent een factuur gewoon uit', async () => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.clientName.fill('Klant Offline BV');
        await app.itemQuantity().fill('3');
        await app.itemPrice().fill('100');

        await expect(app.preview).toContainText('Klant Offline BV');
        // 3 × 100 plus 21% btw: de btw-regels zitten in de bundel en niet
        // ergens achter een verbinding.
        await expect(app.preview).toContainText('€ 363,00');
    });

    await test.step('de voorwaarden zijn offline ook te lezen', async () => {
        await page.getByRole('link', { name: 'gebruiksvoorwaarden' }).click();
        await expect(page.getByRole('heading', { level: 1 }))
            .toContainText('Gebruiksvoorwaarden');
    });

    await test.step('en met het netwerk terug werkt alles door', async () => {
        await context.setOffline(false);
        await page.goto('./');
        await waitForHydration(page);
        await expect(ui(page).preview).toBeVisible();
    });
});

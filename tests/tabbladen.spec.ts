import { test, expect } from '@playwright/test';
import { ui, waitForHydration } from './helpers';

/**
 * Twee tabbladen op hetzelfde apparaat.
 *
 * `subscribeSettings` en `subscribeClients` luisteren naar het `storage`-event,
 * zodat wat je in het ene tabblad opslaat in het andere doorkomt. Dat is bewust
 * gebouwd en werd nergens getoetst — terwijl het stilletjes kapot kan: één
 * verkeerde sleutelvergelijking en de andere kant beweegt niet meer mee.
 *
 * Het staat hier apart omdat deze tests twee pagina's in één context nodig
 * hebben; de rest van de suite werkt met één.
 *
 * Let op wat hier *niet* wordt beloofd. Het documentarchief en de nummering
 * doen hier niet aan mee: die leven in IndexedDB respectievelijk een eigen
 * opslag zonder luisteraar. Twee tabbladen die los facturen nummeren is precies
 * het probleem dat in CLAUDE.md staat beschreven en waar zonder server geen
 * oplossing voor is.
 */
test('bedrijfsgegevens uit het ene tabblad komen in het andere door', async ({ browser }) => {
    const context = await browser.newContext();
    const een = await context.newPage();
    const twee = await context.newPage();

    await een.goto('/');
    await twee.goto('/');
    await waitForHydration(een);
    await waitForHydration(twee);

    await ui(een).companyName.fill('Sonsbeek Advies BV');

    // Het andere tabblad hoort het zonder herladen te zien.
    await expect(ui(twee).preview).toContainText('Sonsbeek Advies BV', { timeout: 10_000 });
    await expect(ui(twee).companyName).toHaveValue('Sonsbeek Advies BV');

    await context.close();
});

test('een klant die je in het ene tabblad opslaat, staat in het andere in de lijst', async ({ browser }) => {
    const context = await browser.newContext();
    const een = await context.newPage();
    const twee = await context.newPage();

    await een.goto('/');
    await twee.goto('/');
    await waitForHydration(een);
    await waitForHydration(twee);

    await expect(ui(twee).clientPicker.locator('option')).toHaveCount(1);

    await ui(een).clientName.fill('Klant BV');
    await ui(een).clientAddress.fill('Keizersgracht 10');
    await ui(een).saveClient.click();

    await expect(ui(twee).clientPicker.locator('option', { hasText: 'Klant BV' }))
        .toHaveCount(1, { timeout: 10_000 });

    await context.close();
});

test('Wissen in het ene tabblad leegt het andere ook', async ({ browser }) => {
    const context = await browser.newContext();
    const een = await context.newPage();
    const twee = await context.newPage();

    await een.goto('/');
    await ui(een).companyName.fill('Sonsbeek Advies BV');
    await twee.goto('/');
    await waitForHydration(twee);
    await expect(ui(twee).preview).toContainText('Sonsbeek Advies BV');

    een.once('dialog', (d) => d.accept());
    await ui(een).clearSettings.click();

    // De standaardnaam staat er weer: het andere tabblad houdt geen oude kopie vast.
    await expect(ui(twee).preview).toContainText('UW BEDRIJFSNAAM', { timeout: 10_000 });

    await context.close();
});

/**
 * Het concept zelf hoort níet mee te bewegen.
 *
 * Wat je in het ene tabblad aan een factuur typt, is van dat document — niet
 * van jou. Twee tabbladen zijn twee documenten; dat is het hele punt van de
 * scheiding tussen conceptvelden en instellingen.
 */
test('het document zelf blijft per tabblad', async ({ browser }) => {
    const context = await browser.newContext();
    const een = await context.newPage();
    const twee = await context.newPage();

    await een.goto('/');
    await twee.goto('/');
    await waitForHydration(een);
    await waitForHydration(twee);

    await ui(een).clientName.fill('Klant van tabblad een');
    await ui(een).itemPrice().fill('100');
    await expect(ui(een).preview).toContainText('€ 121,00');

    // Even wachten zodat een eventuele doorwerking de kans heeft gehad.
    await twee.waitForTimeout(500);
    const tekst = await ui(twee).preview.innerText();
    expect(tekst).not.toContain('Klant van tabblad een');
    expect(tekst).not.toContain('121,00');

    await context.close();
});

import { test, expect, type Page } from '@playwright/test';
import { ui, normalise, openFoldout, openApp } from './helpers';

/**
 * De betaaltermijn is een getal geworden, zodat de zin vertaald kan worden.
 *
 * Hij stond als vrije tekst in je bedrijfsgegevens, standaard "Binnen 14 dagen
 * na factuurdatum.". Dat is jouw tekst, en die vertaalt de app niet — dus op een
 * Engelstalige factuur stond keurig "Payment terms:" met een Nederlandse zin
 * erachter. Het enige veld waar dat gebeurde, want notities, omschrijvingen en
 * eenheden zijn woorden die je echt zelf kiest; deze zin had de app zelf
 * voorgezegd.
 *
 * Wat hier bewaakt wordt:
 *
 * 1. Het getal maakt de zin, in de taal van het document.
 * 2. Eigen tekst gaat vóór en wordt niet vertaald. Dat veld is er nog omdat een
 *    getal niet alles kan zeggen — "vooraf te voldoen" is een echte termijn.
 * 3. De omzetting van de oude opslag raakt niets kwijt.
 * 4. Een document dat al uitgereikt was, blijft staan zoals het was.
 */
test.beforeEach(async ({ page }) => {
    await openApp(page);
});

const vulFactuur = async (page: Page) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.clientName.fill('Klant BV');
    await app.itemPrice().fill('100');
    return app;
};

test.describe('het getal maakt de zin', () => {
    test('standaard dertig dagen, en dat staat op de factuur', async ({ page }) => {
        const app = await vulFactuur(page);
        await openFoldout(page, 'Mijn Betaalgegevens');
        await expect(app.paymentTermDays).toHaveValue('30');
        await expect(app.preview).toContainText('Binnen 30 dagen na factuurdatum.');
    });

    test('een ander aantal dagen verandert de zin mee', async ({ page }) => {
        const app = await vulFactuur(page);
        await openFoldout(page, 'Mijn Betaalgegevens');
        await app.paymentTermDays.fill('14');
        await expect(app.preview).toContainText('Binnen 14 dagen na factuurdatum.');
    });

    /** Eén dag is geen "dagen". Klein, maar het staat op elke factuur. */
    test('en zegt dag in plaats van dagen bij één', async ({ page }) => {
        const app = await vulFactuur(page);
        await openFoldout(page, 'Mijn Betaalgegevens');
        await app.paymentTermDays.fill('1');
        await expect(app.preview).toContainText('Binnen 1 dag na factuurdatum.');
    });

    /** Het hele punt van deze wijziging. */
    test('en staat in het Engels op een Engels document', async ({ page }) => {
        const app = await vulFactuur(page);
        await app.documentTaal.selectOption('en');

        await expect(app.preview).toContainText('Payable within 30 days of the invoice date.');
        expect(normalise(await app.preview.innerText())).not.toContain('Binnen 30 dagen');
    });
});

test.describe('eigen tekst', () => {
    test('komt in plaats van de zin uit het getal', async ({ page }) => {
        const app = await vulFactuur(page);
        await openFoldout(page, 'Mijn Betaalgegevens');
        await app.paymentConditions.fill('Vooraf te voldoen.');

        await expect(app.preview).toContainText('Vooraf te voldoen.');
        expect(normalise(await app.preview.innerText())).not.toContain('Binnen 30 dagen');
    });

    /**
     * En blijft staan zoals je hem schreef, ook op een Engels document. Dat is
     * geen tekortkoming maar de afspraak: het is jouw tekst. Het veld zegt het
     * er zelf bij.
     */
    test('blijft onvertaald, want het is jouw tekst', async ({ page }) => {
        const app = await vulFactuur(page);
        await openFoldout(page, 'Mijn Betaalgegevens');
        await app.paymentConditions.fill('50% bij opdracht, 50% bij oplevering.');
        await app.documentTaal.selectOption('en');

        await expect(app.preview).toContainText('50% bij opdracht, 50% bij oplevering.');
        expect(normalise(await app.preview.innerText())).not.toContain('Payable within');
    });

    test('en leeghalen laat het getal weer gelden', async ({ page }) => {
        const app = await vulFactuur(page);
        await openFoldout(page, 'Mijn Betaalgegevens');
        await app.paymentConditions.fill('Vooraf te voldoen.');
        await expect(app.preview).toContainText('Vooraf te voldoen.');

        await app.paymentConditions.fill('');
        await expect(app.preview).toContainText('Binnen 30 dagen na factuurdatum.');
    });
});

/**
 * De omzetting van wat er al in de opslag stond.
 *
 * Iedereen die deze app al gebruikte heeft een zin staan, en vaak met een eigen
 * getal erin. Die mag niet verdwijnen en ook niet stilletjes op dertig springen.
 */
test.describe('wat er al in de opslag stond', () => {
    const metOudeInstellingen = (page: Page, zin: string) => page.addInitScript((tekst) => {
        localStorage.setItem('facturen.bedrijfsgegevens', JSON.stringify({
            sender: { name: 'Sonsbeek Advies BV', address: '', zip: '', city: '', country: 'Nederland', email: '' },
            bankAccount: '',
            bic: '',
            paymentConditions: tekst,
        }));
    }, zin);

    test('een zin met een getal erin wordt dat getal', async ({ page }) => {
        await metOudeInstellingen(page, 'Binnen 21 dagen na factuurdatum.');
        await openApp(page);
        const app = await vulFactuur(page);

        await openFoldout(page, 'Mijn Betaalgegevens');
        await expect(app.paymentTermDays, 'de termijn van 21 dagen is kwijt').toHaveValue('21');
        await expect(app.paymentConditions).toHaveValue('');
        await expect(app.preview).toContainText('Binnen 21 dagen na factuurdatum.');
    });

    /**
     * En een zin die geen getal is, blijft gewoon staan. Dit is het geval dat
     * ervoor zorgt dat niemand iets kwijtraakt: wie "vooraf te voldoen" had
     * ingevuld, heeft dat na de wijziging nog steeds.
     */
    test('een zin zonder getal blijft als eigen tekst staan', async ({ page }) => {
        await metOudeInstellingen(page, 'Contant bij levering.');
        await openApp(page);
        const app = await vulFactuur(page);

        await openFoldout(page, 'Mijn Betaalgegevens');
        await expect(app.paymentConditions).toHaveValue('Contant bij levering.');
        await expect(app.preview).toContainText('Contant bij levering.');
    });
});

/**
 * Een uitgereikt document verandert niet meer. Dat geldt ook hier: wie destijds
 * veertien dagen gaf, heeft dat gegeven, ook als de instelling nu dertig zegt.
 */
test('een bewaarde factuur houdt de termijn waarmee hij is uitgereikt', async ({ page }) => {
    const app = await vulFactuur(page);
    await openFoldout(page, 'Mijn Betaalgegevens');
    await app.paymentTermDays.fill('7');
    await expect(app.preview).toContainText('Binnen 7 dagen na factuurdatum.');

    const nummer = await app.documentNumber.inputValue();
    await app.saveDocument.click();

    await app.paymentTermDays.fill('60');
    await expect(app.preview).toContainText('Binnen 60 dagen na factuurdatum.');

    await openFoldout(page, 'Bewaarde documenten');
    await app.archiveRowFor(nummer).view.click();
    await expect(app.archiveDialogPreview).toContainText('Binnen 7 dagen na factuurdatum.');
});

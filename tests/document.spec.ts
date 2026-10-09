import { test, expect } from '@playwright/test';
import { ui, openFoldout, verwachtVoorbeeld, openApp } from './helpers';

test.beforeEach(async ({ page }) => {
    await openApp(page);
});

test('schakelt tussen factuur en offerte', async ({ page }) => {
    const app = ui(page);
    const heading = app.preview.locator('h1').first();

    await expect(heading).toHaveText('FACTUUR');
    await app.tab('Offerte').click();
    await expect(heading).toHaveText('OFFERTE');
    await app.tab('Factuur').click();
    await expect(heading).toHaveText('FACTUUR');
});

/**
 * Wisselen van documenttype mag niets van het andere type laten staan.
 *
 * Een offerte en een factuur delen hun klant, hun regels en hun btw-behandeling
 * — dat hoort mee te gaan. Maar de teksten die de app zélf bij een documenttype
 * zet, horen bij dat type en niet bij het andere. "Deze offerte is 30 dagen
 * geldig" op een factuur is geen smaakkwestie: het staat op papier dat de klant
 * krijgt.
 *
 * Let op de richting. Dat de standaardtekst van de offerte een wissel *naar* de
 * offerte overleeft, is met opzet en staat hieronder getoetst — zonder dat is
 * die tekst onbereikbaar, want wisselen is de enige weg erheen. Het gaat hier om
 * de weg terug.
 */
test.describe('wisselen laat niets van het andere documenttype staan', () => {
    /** Wat de app zelf op een offerte zet, en nergens anders hoort. */
    const OFFERTETEKSTEN = [
        'OFFERTE',
        'Offerte voor:',
        'Geldig tot:',
    ];

    /** En wat alleen bij een factuur hoort. */
    const FACTUURTEKSTEN = [
        'FACTUUR',
        'Factureren aan:',
        'Betalingsvoorwaarden:',
        'Wij verzoeken u vriendelijk',
    ];

    const vulIets = async (page: import('@playwright/test').Page) => {
        const app = ui(page);
        await app.companyName.fill('Sonsbeek Advies BV');
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');
        return app;
    };

    test('op een factuur staat niets van de offerte', async ({ page }) => {
        const app = await vulIets(page);

        await app.tab('Offerte').click();
        await expect(app.preview.locator('h1').first()).toHaveText('OFFERTE');
        await app.tab('Factuur').click();
        await expect(app.preview.locator('h1').first()).toHaveText('FACTUUR');

        await verwachtVoorbeeld(page, {
            bevat: ['FACTUUR'],
            bevatNiet: [...OFFERTETEKSTEN],
        });
    });

    test('en op een offerte niets van de factuur', async ({ page }) => {
        const app = await vulIets(page);

        await app.tab('Offerte').click();
        await expect(app.preview.locator('h1').first()).toHaveText('OFFERTE');

        await verwachtVoorbeeld(page, {
            bevat: ['OFFERTE'],
            bevatNiet: [...FACTUURTEKSTEN],
        });
    });

    /**
     * Wat wél mee moet. Zonder deze zou "haal alles weg" ook de notitie wissen
     * die je zelf typte, en dan is de genezing erger dan de kwaal.
     */
    test('maar een notitie die je zelf typte gaat wel mee', async ({ page }) => {
        const app = await vulIets(page);
        await app.notes.fill('Levering in overleg.');

        await app.tab('Offerte').click();
        await expect(app.notes).toHaveValue('Levering in overleg.');

        await app.tab('Factuur').click();
        await expect(app.notes).toHaveValue('Levering in overleg.');
    });
});

test('neemt bedrijfs- en klantgegevens mee naar het andere documenttype', async ({ page }) => {
    const app = ui(page);
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.companyKvk.fill('87654321');
    await app.clientName.fill('Klant A');

    await app.tab('Offerte').click();

    await expect(app.companyName).toHaveValue('Sonsbeek Advies BV');
    await expect(app.companyKvk).toHaveValue('87654321');
    await expect(app.clientName).toHaveValue('Klant A');
});

test.describe('velden verschijnen pas als ze ingevuld zijn', () => {
    test('btw- en KvK-nummer blijven weg zolang ze leeg zijn', async ({ page }) => {
        await verwachtVoorbeeld(page, {
            // Zonder anker was dit een test die niet kón falen: op een voorbeeld
            // dat nog leeg is, staat er inderdaad geen "BTW:". De kop staat er
            // altijd, dus die bewijst dat er iets getekend is.
            bevat: ['FACTUUR'],
            bevatNiet: ['BTW:', 'KvK:'],
        });
    });

    test('btw- en KvK-nummer verschijnen zodra ze ingevuld zijn', async ({ page }) => {
        const app = ui(page);
        await app.companyVat.fill('NL123456789B01');
        await app.companyKvk.fill('87654321');

        await verwachtVoorbeeld(page, {
            bevat: ['BTW: NL123456789B01', 'KvK: 87654321'],
        });
    });

    test('het land van de klant blijft weg bij een Nederlandse klant', async ({ page }) => {
        const app = ui(page);
        await app.clientName.fill('Klant A');
        // Alleen het klantblok: de afzender toont wel degelijk "Nederland".
        await expect(app.clientBlock).not.toContainText('Nederland');
    });

    test('het land van de klant verschijnt bij een buitenlandse klant', async ({ page }) => {
        const app = ui(page);
        await app.clientName.fill('Kunde GmbH');
        await app.clientCountry.fill('Duitsland');
        await expect(app.clientBlock).toContainText('Duitsland');
    });
});

test.describe('opmerkingen', () => {
    test('zijn te typen en komen op het document', async ({ page }) => {
        const app = ui(page);
        await app.notes.fill('Bedankt voor de samenwerking.');
        await expect(ui(page).preview).toContainText('Opmerkingen: Bedankt voor de samenwerking.');
    });

    /**
     * Een offerte begon met "Deze offerte is 30 dagen geldig." in dit veld. Die
     * zin is weg: hij zei hetzelfde als "Geldig tot:" bovenaan, met het aantal
     * dagen er hard in — dus wie de datum veranderde had een offerte die zichzelf
     * tegensprak. Een notitie is nu zonder uitzondering van jou.
     */
    test('beginnen leeg, ook bij een offerte', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();

        await expect(app.notes).toHaveValue('');
        await verwachtVoorbeeld(page, {
            // De geldigheid stond altijd al in de kop, en bewijst meteen dat het
            // voorbeeld de offerte toont; pas dan zegt het ontbreken iets.
            bevat: ['OFFERTE', 'Geldig tot:'],
            bevatNiet: ['Opmerkingen:'],
        });
    });

    test('een ingevulde notitie gaat wel mee naar het andere documenttype', async ({ page }) => {
        const app = ui(page);
        await app.notes.fill('Levering in overleg.');
        await app.tab('Offerte').click();

        await expect(app.notes).toHaveValue('Levering in overleg.');
    });
});

test('betalingsvoorwaarden zijn te wijzigen', async ({ page }) => {
    const app = ui(page);
    // Via het aantal dagen, want dat is sinds de vertaalbare zin het gewone pad;
    // de eigen tekst ernaast heeft zijn eigen tests in betaaltermijn.spec.ts.
    await app.paymentTermDays.fill('45');
    await expect(ui(page).preview).toContainText('Binnen 45 dagen na factuurdatum.');
});

/**
 * Twee velden die nergens werden aangeraakt, gevonden door alle bedienings-
 * elementen met een id naast de suite te leggen in plaats van te bedenken wat er
 * gedekt zou zijn. Allebei komen ze op het document terecht, en de BIC gaat ook
 * de e-factuur in; daar stond dus niets tussen de invoer en de klant.
 */
test('de BIC komt op de factuur te staan', async ({ page }) => {
    const app = ui(page);
    await openFoldout(page, 'Mijn Betaalgegevens');
    await app.iban.fill('NL91ABNA0417164300');
    await app.bic.fill('ABNANL2A');

    await expect(app.preview).toContainText('BIC: ABNANL2A');
});

test('een offerte zonder BIC laat die regel gewoon weg', async ({ page }) => {
    const app = ui(page);
    await openFoldout(page, 'Mijn Betaalgegevens');
    await app.bic.fill('ABNANL2A');

    // Betaalgegevens horen niet op een offerte: er valt nog niets te betalen.
    await app.tab('Offerte').click();
    await verwachtVoorbeeld(page, {
        // De kop als anker: pas als die is omgeslagen toont het voorbeeld de
        // offerte, en zegt het ontbreken van de BIC iets.
        bevat: ['OFFERTE'],
        bevatNiet: ['BIC'],
    });
});

test('de geldigheidsdatum van een offerte is te wijzigen', async ({ page }) => {
    const app = ui(page);
    await app.tab('Offerte').click();
    // De standaard is factuurdatum plus dertig dagen; dat wordt elders getoetst.
    // Hier gaat het erom dat je hem ook zélf kunt zetten, want dat deed niets.
    await app.validUntil.fill('2026-12-24');

    await expect(app.preview).toContainText('Geldig tot: 24-12-2026');
});

test.describe('standaard documentnummer', () => {
    /** Het jaartal volgt het huidige jaar, zodat het nummer niet verjaart. */
    const currentYear = new Date().toISOString().slice(0, 4);

    test('begint met het lopende jaar', async ({ page }) => {
        await expect(ui(page).documentNumber).toHaveValue(`${currentYear}-001`);
    });

    test('een offerte krijgt het OFF-voorvoegsel', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();
        await expect(app.documentNumber).toHaveValue(`OFF-${currentYear}-001`);
    });
});

test.describe('datums op het document', () => {
    /** Dezelfde UTC-basis als de app gebruikt, zodat dit ook rond middernacht klopt. */
    const iso = (offsetDays = 0) =>
        new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dutch = (isoDate: string) => isoDate.split('-').reverse().join('-');

    test('staan in Nederlandse notatie, niet in ISO', async ({ page }) => {
        await verwachtVoorbeeld(page, {
            bevat: [`Datum: ${dutch(iso())}`],
            bevatNiet: [`Datum: ${iso()}`],
        });
    });

    test('een offerte toont tot wanneer hij geldig is', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();
        await expect(ui(page).preview).toContainText(`Geldig tot: ${dutch(iso(30))}`);
    });
});

/**
 * Een factuur kent geen vervaldatum meer. Die kon de betaaltermijn in de
 * Betalingsvoorwaarden tegenspreken: een vervaldatum vijf dagen later terwijl
 * eronder "Binnen 14 dagen na factuurdatum" stond. Wettelijk is alleen de
 * factuurdatum verplicht, dus de termijn staat nu op één plek.
 */
/** De kop staat in hoofdletters door text-transform, dus innerText geeft hem zo terug. */
/** Voorbeeldtekst hoort een placeholder te zijn, geen waarde: zie items.spec.ts. */
test('de omschrijving vraagt om goederen of diensten', async ({ page }) => {
    await expect(ui(page).itemDescription(0)).toHaveAttribute(
        'placeholder', 'Omschrijving goederen/ diensten',
    );
});

test.describe('offerte omzetten naar factuur', () => {
    test('neemt klant en regels mee en verwijst naar het offertenummer', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();
        const offerteNummer = await app.documentNumber.inputValue();
        await app.clientName.fill('Jansen Bouw BV');
        await app.itemName(0).fill('Advies');
        await app.itemPrice(0).fill('500');

        await app.convertToInvoice.click();

        // We staan nu op de factuur.
        await expect(app.preview.locator('h1')).toHaveText('FACTUUR');
        await expect(app.clientName).toHaveValue('Jansen Bouw BV');
        await expect(app.itemPrice(0)).toHaveValue('500');
        await expect(ui(page).preview).toContainText(`Conform offerte ${offerteNummer}.`);
    });

    /**
     * Dit bewaakte dat de standaardzin van de offerte niet op de factuur
     * belandde. Die zin bestaat niet meer, maar de regel eronder wel: een offerte
     * noemt een geldigheidsdatum en een factuur hoort die niet te erven.
     */
    test('laat de geldigheid van de offerte niet op de factuur staan', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();
        await app.convertToInvoice.click();

        await verwachtVoorbeeld(page, {
            // Het omgezette document is een factuur; die kop is het bewijs dat
            // de omzetting daadwerkelijk in het voorbeeld is beland.
            bevat: ['FACTUUR'],
            bevatNiet: ['Geldig tot:', 'OFFERTE'],
        });
    });

    test('de knop staat alleen op een offerte', async ({ page }) => {
        const app = ui(page);
        await expect(app.convertToInvoice).toHaveCount(0);
        await app.tab('Offerte').click();
        await expect(app.convertToInvoice).toBeVisible();
    });
});

test.describe('de kop boven de klantgegevens', () => {
    test('een factuur factureert aan', async ({ page }) => {
        await verwachtVoorbeeld(page, {
            bevat: ['FACTUREREN AAN:'],
            bevatNiet: ['OFFERTE VOOR:'],
        });
    });

    test('een offerte is voor iemand', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();

        await verwachtVoorbeeld(page, {
            bevat: ['OFFERTE VOOR:'],
            bevatNiet: ['FACTUREREN AAN:'],
        });
    });
});

test.describe('nummer en datum', () => {
    test('het nummerveld heet naar het documenttype', async ({ page }) => {
        const app = ui(page);
        const label = page.locator('.field-row label').first();

        await expect(label).toHaveText('Factuurnummer');
        await app.tab('Offerte').click();
        await expect(label).toHaveText('Offertenummer');
    });

    test('staan op een factuur naast elkaar', async ({ page }) => {
        const nummer = (await ui(page).documentNumber.boundingBox())!;
        const datum = (await page.locator('input[type="date"]').first().boundingBox())!;

        // Dezelfde rij: ze overlappen verticaal. Niet exact gelijk, want een
        // datumveld rendert een paar pixels lager dan een tekstveld.
        const overlap = Math.min(nummer.y + nummer.height, datum.y + datum.height)
            - Math.max(nummer.y, datum.y);
        expect(overlap).toBeGreaterThan(nummer.height * 0.8);
        expect(datum.x).toBeGreaterThan(nummer.x + nummer.width - 1);
    });

    test('zakken onder elkaar op een telefoon', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const nummer = await ui(page).documentNumber.boundingBox();
        const datum = await page.locator('input[type="date"]').first().boundingBox();

        expect(datum!.y).toBeGreaterThan(nummer!.y);
    });
});

test.describe('een factuur heeft geen vervaldatum', () => {
    test('het document noemt er geen', async ({ page }) => {
        await verwachtVoorbeeld(page, {
            bevat: ['Datum:'],
            bevatNiet: ['Vervaldatum'],
        });
    });

    /**
     * Deze test stond er om te voorkomen dat er een vervaldatumveld terugkomt,
     * en telde daarvoor de datumvelden. Inmiddels hoort er een tweede te staan:
     * de datum van de levering of dienst, die de wet juist eist zodra die
     * afwijkt van de factuurdatum. Daarom nu op naam en niet op aantal — anders
     * verbiedt deze test elk nieuw datumveld, ook een dat er hoort te zijn.
     */
    test('het formulier heeft geen vervaldatumveld', async ({ page }) => {
        const datumvelden = page.locator('input[type="date"]');
        await expect(datumvelden).toHaveCount(2);
        await expect(page.locator('#datum')).toHaveCount(1);
        await expect(page.locator('#leverdatum')).toHaveCount(1);

        // Geen veld dat naar een vervaldatum riekt, onder welke naam ook.
        const namen = await datumvelden.evaluateAll(
            (velden) => velden.map((v) => `${v.id} ${(v as HTMLInputElement).labels?.[0]?.textContent ?? ''}`),
        );
        expect(namen.join(' ').toLowerCase()).not.toContain('verval');
    });

    test('de betaaltermijn staat alleen in de betalingsvoorwaarden', async ({ page }) => {
        const app = ui(page);
        await app.paymentTermDays.fill('30');
        await verwachtVoorbeeld(page, {
            bevat: ['Binnen 30 dagen na factuurdatum.'],
            // Het aantal dagen staat er nu als getal in het formulier, maar nog
            // steeds niet als losse vervaldatum op het document: die twee konden
            // elkaar tegenspreken en daarom is dat veld er niet.
            bevatNiet: ['Vervaldatum'],
        });
    });

    test('een offerte houdt zijn tweede datumveld wel', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();
        await expect(page.locator('input[type="date"]')).toHaveCount(2);
    });
});

test.describe('IBAN op het document', () => {
    test('groepeert een aaneengetypte IBAN in blokken van vier', async ({ page }) => {
        const app = ui(page);
        await app.iban.fill('NL91ABNA0417164300');
        await expect(ui(page).preview).toContainText('NL91 ABNA 0417 1643 00');
    });

    test('laat een al gegroepeerde IBAN ongemoeid', async ({ page }) => {
        const app = ui(page);
        await app.iban.fill('NL91 ABNA 0417 1643 00');
        await expect(ui(page).preview).toContainText('NL91 ABNA 0417 1643 00');
    });

    test('maakt kleine letters hoofdletters', async ({ page }) => {
        const app = ui(page);
        await app.iban.fill('nl91abna0417164300');
        await expect(ui(page).preview).toContainText('NL91 ABNA 0417 1643 00');
    });

    test('toont het voorbeeldnummer zolang er niets is ingevuld', async ({ page }) => {
        await expect(ui(page).iban).toHaveValue('');
        await expect(ui(page).preview).toContainText('NLxx XXXX XXXX XXXX XX');
    });
});

test('noemt rekeningnummer, bedrijfsnaam en factuurnummer in de betaalregel', async ({ page }) => {
    const app = ui(page);
    await app.iban.fill('NL91 ABNA 0417 1643 00');
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.documentNumber.fill('2026-042');

    await expect(ui(page).preview).toContainText(
        'Wij verzoeken u vriendelijk het totale factuurbedrag over te maken naar rekeningnummer '
        + 'NL91 ABNA 0417 1643 00 ten name van Sonsbeek Advies BV. '
        + 'Vermeld hierbij a.u.b. het factuurnummer: 2026-042. '
        + 'Hartelijk dank voor uw vertrouwen!',
    );
});

test('zet rekeningnummer, bedrijfsnaam en factuurnummer vet', async ({ page }) => {
    const app = ui(page);
    await app.iban.fill('NL91ABNA0417164300');
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.documentNumber.fill('2026-042');

    const vet = await app.preview.locator('strong').allInnerTexts();
    expect(vet).toContain('NL91 ABNA 0417 1643 00');
    expect(vet).toContain('Sonsbeek Advies BV');
    expect(vet).toContain('2026-042');
});

test('toont het documentnummer op het document', async ({ page }) => {
    const app = ui(page);
    await app.documentNumber.fill('2026-042');
    await expect(ui(page).preview).toContainText('2026-042');
});

import { test, expect } from '@playwright/test';
import { ui, previewText } from './helpers';

test.beforeEach(async ({ page }) => {
    await page.goto('/');
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
        const text = await previewText(page);
        expect(text).not.toContain('BTW:');
        expect(text).not.toContain('KvK:');
    });

    test('btw- en KvK-nummer verschijnen zodra ze ingevuld zijn', async ({ page }) => {
        const app = ui(page);
        await app.companyVat.fill('NL123456789B01');
        await app.companyKvk.fill('87654321');

        const text = await previewText(page);
        expect(text).toContain('BTW: NL123456789B01');
        expect(text).toContain('KvK: 87654321');
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
        expect(await previewText(page)).toContain('Opmerkingen: Bedankt voor de samenwerking.');
    });

    /**
     * De offerte begint met een standaardtekst. Die werd bij het wisselen van
     * documenttype overschreven door de lege notitie van de factuur, omdat ?? de
     * lege string niet als "niet ingevuld" ziet. De tekst was daardoor
     * onbereikbaar: wisselen is de enige manier om bij de offerte te komen.
     */
    test('de standaardtekst van de offerte overleeft het wisselen van documenttype', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();

        await expect(app.notes).toHaveValue('Deze offerte is 30 dagen geldig.');
        expect(await previewText(page)).toContain('Deze offerte is 30 dagen geldig.');
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
    await app.paymentConditions.fill('Binnen 30 dagen na factuurdatum.');
    expect(await previewText(page)).toContain('Binnen 30 dagen na factuurdatum.');
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
        const text = await previewText(page);
        expect(text).toContain(`Datum: ${dutch(iso())}`);
        expect(text).not.toContain(`Datum: ${iso()}`);
    });

    test('een offerte toont tot wanneer hij geldig is', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();
        expect(await previewText(page)).toContain(`Geldig tot: ${dutch(iso(30))}`);
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
        expect(await previewText(page)).toContain(`Conform offerte ${offerteNummer}.`);
    });

    test('laat de offertetekst niet op de factuur staan', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();
        await app.convertToInvoice.click();

        expect(await previewText(page)).not.toContain('Deze offerte is 30 dagen geldig.');
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
        const text = await previewText(page);
        expect(text).toContain('FACTUREREN AAN:');
        expect(text).not.toContain('OFFERTE VOOR:');
    });

    test('een offerte is voor iemand', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();

        const text = await previewText(page);
        expect(text).toContain('OFFERTE VOOR:');
        expect(text).not.toContain('FACTUREREN AAN:');
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
        const text = await previewText(page);
        expect(text).toContain('Datum:');
        expect(text).not.toContain('Vervaldatum');
    });

    test('het formulier heeft maar één datumveld', async ({ page }) => {
        await expect(page.locator('input[type="date"]')).toHaveCount(1);
    });

    test('de betaaltermijn staat alleen in de betalingsvoorwaarden', async ({ page }) => {
        const app = ui(page);
        await app.paymentConditions.fill('Binnen 30 dagen na factuurdatum.');
        const text = await previewText(page);
        expect(text).toContain('Binnen 30 dagen na factuurdatum.');
        expect(text).not.toContain('Vervaldatum');
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
        expect(await previewText(page)).toContain('NL91 ABNA 0417 1643 00');
    });

    test('laat een al gegroepeerde IBAN ongemoeid', async ({ page }) => {
        const app = ui(page);
        await app.iban.fill('NL91 ABNA 0417 1643 00');
        expect(await previewText(page)).toContain('NL91 ABNA 0417 1643 00');
    });

    test('maakt kleine letters hoofdletters', async ({ page }) => {
        const app = ui(page);
        await app.iban.fill('nl91abna0417164300');
        expect(await previewText(page)).toContain('NL91 ABNA 0417 1643 00');
    });

    test('toont het voorbeeldnummer zolang er niets is ingevuld', async ({ page }) => {
        await expect(ui(page).iban).toHaveValue('');
        expect(await previewText(page)).toContain('NLxx XXXX XXXX XXXX XX');
    });
});

test('noemt rekeningnummer, bedrijfsnaam en factuurnummer in de betaalregel', async ({ page }) => {
    const app = ui(page);
    await app.iban.fill('NL91 ABNA 0417 1643 00');
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.documentNumber.fill('2026-042');

    expect(await previewText(page)).toContain(
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
    expect(await previewText(page)).toContain('2026-042');
});

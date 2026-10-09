import { test, expect } from '@playwright/test';
import { ui, openFoldout, openApp } from './helpers';

/**
 * De e-factuur (UBL / NLCIUS).
 *
 * Dit is de derde weergave van hetzelfde document, naast het voorbeeld en de
 * PDF, en dus de derde plek waar de btw-opstelling uit elkaar kan lopen. De
 * tests hier lezen daarom de XML in en vergelijken de bedragen met wat het
 * voorbeeld ernaast laat zien.
 *
 * Wat ze **niet** doen: de officiële Schematron van SI-UBL draaien. Daar is een
 * XSLT-motor voor nodig die niet in deze app past. In plaats daarvan toetsen ze
 * de regels die hier het makkelijkst misgaan: welvormdheid, de verplichte
 * velden, optellende totalen en — het belangrijkste — dat een
 * KOR-factuur categorie E krijgt en niet Z. Voor het echte werk hoort een
 * bestand eenmalig door een validator; dat staat in CLAUDE.md.
 */
const NS = {
    cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
};

/** Vult een factuur die alles heeft wat een e-factuur nodig heeft. */
const vulVolledigeFactuur = async (page: import('@playwright/test').Page) => {
    const app = ui(page);
    await openFoldout(page, 'Mijn Bedrijfsgegevens');
    await app.companyName.fill('Sonsbeek Advies BV');
    await app.companyKvk.fill('87654321');
    await app.companyVat.fill('NL123456789B01');
    await app.companyEmail.fill('info@sonsbeekadvies.nl');

    await openFoldout(page, 'Mijn Betaalgegevens');
    await app.iban.fill('NL91ABNA0417164300');

    await app.clientName.fill('Klant BV');
    await app.clientAddress.fill('Keizersgracht 10');
    await app.clientZip.fill('1015 CJ');
    await app.clientCity.fill('Amsterdam');
    await app.buyerReference.fill('INKOOP-2026-77');

    await app.itemDescription().fill('Advies');
    await app.itemQuantity().fill('10');
    await app.itemUnit().fill('uur');
    await app.itemPrice().fill('125');
    return app;
};

/** Downloadt de e-factuur en geeft de XML als tekst terug. */
const haalUbl = async (page: import('@playwright/test').Page) => {
    const app = ui(page);
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.downloadUbl.click(),
    ]);
    const stream = await download.createReadStream();
    const stukken: Buffer[] = [];
    for await (const stuk of stream!) stukken.push(stuk as Buffer);
    return { xml: Buffer.concat(stukken).toString('utf8'), naam: download.suggestedFilename() };
};

/**
 * Leest de XML in de browser in en haalt eruit wat we willen toetsen.
 *
 * Via DOMParser en niet met een reguliere expressie: dan is "is dit welvormde
 * XML" meteen onderdeel van de test, en worden naamruimten echt gerespecteerd.
 */
const ontleed = (page: import('@playwright/test').Page, xml: string) =>
    page.evaluate(({ xml, NS }) => {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        const fout = doc.querySelector('parsererror');
        if (fout) return { fout: fout.textContent ?? 'onleesbaar' } as const;

        const een = (ns: string, naam: string, binnen: Element | Document = doc) =>
            binnen.getElementsByTagNameNS(ns, naam)[0]?.textContent ?? null;
        const alle = (ns: string, naam: string, binnen: Element | Document = doc) =>
            Array.from(binnen.getElementsByTagNameNS(ns, naam));

        const regels = alle(NS.cac, 'InvoiceLine').map((regel) => ({
            id: een(NS.cbc, 'ID', regel),
            aantal: een(NS.cbc, 'InvoicedQuantity', regel),
            eenheid: alle(NS.cbc, 'InvoicedQuantity', regel)[0]?.getAttribute('unitCode') ?? null,
            regelbedrag: een(NS.cbc, 'LineExtensionAmount', regel),
            naam: een(NS.cbc, 'Name', regel),
            omschrijving: een(NS.cbc, 'Description', regel),
            categorie: een(NS.cbc, 'ID', alle(NS.cac, 'ClassifiedTaxCategory', regel)[0]!),
            percentage: een(NS.cbc, 'Percent', alle(NS.cac, 'ClassifiedTaxCategory', regel)[0]!),
            prijs: een(NS.cbc, 'PriceAmount', alle(NS.cac, 'Price', regel)[0]!),
        }));

        const regelsCredit = alle(NS.cac, 'CreditNoteLine').map((regel) => ({
            id: een(NS.cbc, 'ID', regel),
            aantal: een(NS.cbc, 'CreditedQuantity', regel),
            regelbedrag: een(NS.cbc, 'LineExtensionAmount', regel),
        }));

        const taxTotal = alle(NS.cac, 'TaxTotal')[0]!;
        const groepen = alle(NS.cac, 'TaxSubtotal', taxTotal).map((groep) => ({
            grondslag: een(NS.cbc, 'TaxableAmount', groep),
            btw: een(NS.cbc, 'TaxAmount', groep),
            categorie: een(NS.cbc, 'ID', alle(NS.cac, 'TaxCategory', groep)[0]!),
            percentage: een(NS.cbc, 'Percent', alle(NS.cac, 'TaxCategory', groep)[0]!),
            reden: een(NS.cbc, 'TaxExemptionReason', groep),
        }));

        const totalen = alle(NS.cac, 'LegalMonetaryTotal')[0]!;

        return {
            wortel: doc.documentElement.localName,
            naamruimte: doc.documentElement.namespaceURI,
            customizationID: een(NS.cbc, 'CustomizationID'),
            profileID: een(NS.cbc, 'ProfileID'),
            nummer: een(NS.cbc, 'ID'),
            datum: een(NS.cbc, 'IssueDate'),
            typeCode: een(NS.cbc, 'InvoiceTypeCode') ?? een(NS.cbc, 'CreditNoteTypeCode'),
            gecrediteerd: een(NS.cbc, 'ID', alle(NS.cac, 'InvoiceDocumentReference')[0] ?? doc.createElement('x')),
            regelsCredit,
            valuta: een(NS.cbc, 'DocumentCurrencyCode'),
            klantreferentie: een(NS.cbc, 'BuyerReference'),
            afzenderKvk: een(NS.cbc, 'EndpointID', alle(NS.cac, 'AccountingSupplierParty')[0]!),
            afzenderNaam: een(NS.cbc, 'Name', alle(NS.cac, 'AccountingSupplierParty')[0]!),
            ontvangerKvk: een(NS.cbc, 'EndpointID', alle(NS.cac, 'AccountingCustomerParty')[0]!),
            ontvangerNaam: een(NS.cbc, 'Name', alle(NS.cac, 'AccountingCustomerParty')[0]!),
            iban: een(NS.cbc, 'ID', alle(NS.cac, 'PayeeFinancialAccount')[0]!),
            betaalwijze: een(NS.cbc, 'PaymentMeansCode'),
            btwTotaal: een(NS.cbc, 'TaxAmount', taxTotal),
            groepen,
            regelTotaal: een(NS.cbc, 'LineExtensionAmount', totalen),
            exclusief: een(NS.cbc, 'TaxExclusiveAmount', totalen),
            inclusief: een(NS.cbc, 'TaxInclusiveAmount', totalen),
            teBetalen: een(NS.cbc, 'PayableAmount', totalen),
            regels,
        } as const;
    }, { xml, NS });

test.beforeEach(async ({ page }) => {
    await openApp(page);
});

test('levert welvormde UBL met de Nederlandse inperking', async ({ page }) => {
    await vulVolledigeFactuur(page);
    const { xml, naam } = await haalUbl(page);

    expect(naam).toMatch(/^efactuur_.*\.xml$/);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);

    const uit = await ontleed(page, xml);
    expect('fout' in uit ? uit.fout : null, 'de XML is niet welvormd').toBeNull();
    if ('fout' in uit) return;

    expect(uit.wortel).toBe('Invoice');
    expect(uit.naamruimte).toBe('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2');
    // NLCIUS, niet alleen de Europese norm: dit is wat Nederlandse ontvangers verwachten.
    expect(uit.customizationID).toContain('nlcius');
    expect(uit.profileID).toContain('peppol');
    expect(uit.typeCode).toBe('380');
    expect(uit.valuta).toBe('EUR');
});

test('neemt afzender, ontvanger en betaalgegevens over', async ({ page }) => {
    const app = await vulVolledigeFactuur(page);
    const nummer = await app.documentNumber.inputValue();
    const uit = await ontleed(page, (await haalUbl(page)).xml);
    if ('fout' in uit) throw new Error(uit.fout);

    expect(uit.nummer).toBe(nummer);
    expect(uit.datum).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(uit.klantreferentie).toBe('INKOOP-2026-77');
    expect(uit.afzenderNaam).toBe('Sonsbeek Advies BV');
    expect(uit.ontvangerNaam).toBe('Klant BV');
    // Het KvK-nummer is ook het adres waarop je over Peppol bereikbaar bent.
    expect(uit.afzenderKvk).toBe('87654321');
    expect(uit.iban).toBe('NL91ABNA0417164300');
    expect(uit.betaalwijze).toBe('30');
});

test('de bedragen in het bestand zijn dezelfde als in het voorbeeld', async ({ page }) => {
    const app = await vulVolledigeFactuur(page);

    // Wat het voorbeeld zegt, moet het bestand ook zeggen: dit is de derde
    // weergave van hetzelfde document.
    await expect(app.preview).toContainText('€ 1.250,00');
    await expect(app.preview).toContainText('€ 1.512,50');

    const uit = await ontleed(page, (await haalUbl(page)).xml);
    if ('fout' in uit) throw new Error(uit.fout);

    expect(uit.regelTotaal).toBe('1250.00');
    expect(uit.exclusief).toBe('1250.00');
    expect(uit.inclusief).toBe('1512.50');
    expect(uit.teBetalen).toBe('1512.50');
    expect(uit.btwTotaal).toBe('262.50');

    expect(uit.regels).toHaveLength(1);
    expect(uit.regels[0].aantal).toBe('10');
    expect(uit.regels[0].eenheid, 'uur hoort HUR te worden').toBe('HUR');
    expect(uit.regels[0].prijs).toBe('125.00');
    expect(uit.regels[0].regelbedrag).toBe('1250.00');
    expect(uit.regels[0].categorie).toBe('S');
    expect(uit.regels[0].percentage).toBe('21.00');
});

test('groepeert de btw per tarief, en die groepen tellen op tot het totaal', async ({ page }) => {
    const app = await vulVolledigeFactuur(page);
    await app.itemQuantity().fill('1');
    await app.itemPrice().fill('100');

    await app.addItem.click();
    await app.itemDescription(1).fill('Boek');
    await app.itemQuantity(1).fill('1');
    await app.itemPrice(1).fill('50');
    await app.itemVatRate(1).selectOption('9');

    const uit = await ontleed(page, (await haalUbl(page)).xml);
    if ('fout' in uit) throw new Error(uit.fout);

    expect(uit.groepen).toHaveLength(2);
    const perTarief = Object.fromEntries(uit.groepen.map(g => [g.percentage, g]));
    expect(perTarief['21.00'].grondslag).toBe('100.00');
    expect(perTarief['21.00'].btw).toBe('21.00');
    expect(perTarief['9.00'].grondslag).toBe('50.00');
    expect(perTarief['9.00'].btw).toBe('4.50');

    // De groepen moeten optellen tot het gemelde btw-totaal, net als op papier.
    const som = uit.groepen.reduce((a, g) => a + Number(g.btw), 0);
    expect(som.toFixed(2)).toBe(uit.btwTotaal);
    expect(uit.btwTotaal).toBe('25.50');
    expect(uit.teBetalen).toBe('175.50');
});

test.describe('kleineondernemersregeling', () => {
    /**
     * De kern van dit bestand. In UBL is E "hier geldt geen btw" en Z "hier
     * geldt btw, tegen nul procent". De KOR is een vrijstelling, dus E. Als Z
     * wegschrijven vertelt de boekhouding van je klant iets anders dan wat er
     * op de papieren factuur staat.
     */
    test('schrijft categorie E weg, niet Z', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.vatScheme.selectOption('kor');

        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);

        expect(uit.groepen).toHaveLength(1);
        expect(uit.groepen[0].categorie, 'vrijgesteld is E, nultarief is Z').toBe('E');
        expect(uit.groepen[0].categorie).not.toBe('Z');
        expect(uit.regels[0].categorie).toBe('E');
        expect(uit.regels[0].categorie).not.toBe('Z');
    });

    test('noemt de reden van de vrijstelling', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.vatScheme.selectOption('kor');

        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);
        expect(uit.groepen[0].reden).toContain('art. 25 Wet OB 1968');
    });

    test('rekent geen btw en laat het totaal gelijk zijn aan de grondslag', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.vatScheme.selectOption('kor');

        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);

        expect(uit.btwTotaal).toBe('0.00');
        expect(uit.groepen[0].btw).toBe('0.00');
        expect(uit.groepen[0].grondslag).toBe('1250.00');
        expect(uit.exclusief).toBe('1250.00');
        expect(uit.inclusief).toBe('1250.00');
        expect(uit.teBetalen).toBe('1250.00');
    });

    test('laat het tarief van de regel ongemoeid na uitzetten', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.vatScheme.selectOption('kor');
        await app.vatScheme.selectOption('normaal');

        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);
        expect(uit.regels[0].categorie).toBe('S');
        expect(uit.regels[0].percentage).toBe('21.00');
    });
});

test('het nultarief blijft Z', async ({ page }) => {
    // Een regel op 0% binnen het gewone regime: wél een tarief, namelijk nul.
    const app = await vulVolledigeFactuur(page);
    await app.itemVatRate().selectOption('0');

    const uit = await ontleed(page, (await haalUbl(page)).xml);
    if ('fout' in uit) throw new Error(uit.fout);
    expect(uit.regels[0].categorie).toBe('Z');
    expect(uit.groepen[0].categorie).toBe('Z');
    expect(uit.groepen[0].reden, 'het nultarief is geen vrijstelling').toBeNull();
});

test.describe('0% heeft een reden, en elke reden een eigen categorie', () => {
    /**
     * De kern van deze groep. 0% is in UBL niet één ding: verlegd is AE, een
     * intracommunautaire levering is K, uitvoer is G en alleen een echt
     * nultarief is Z. Alles als Z wegschrijven — wat deze app eerst deed —
     * vertelt het grootboek van de ontvanger iets anders dan wat er gebeurd is,
     * en de officiële validator merkt dat niet omdat Z op zichzelf geldig is.
     */
    const GEVALLEN = [
        { regime: 'verlegd', categorie: 'AE', zin: 'Btw verlegd' },
        { regime: 'icp', categorie: 'K', zin: 'Intracommunautaire levering' },
        { regime: 'export', categorie: 'G', zin: 'Uitvoer buiten de EU' },
        { regime: 'dienst-buiten-eu', categorie: 'O', zin: 'niet belast in Nederland' },
    ] as const;

    for (const { regime, categorie, zin } of GEVALLEN) {
        test(`${regime} wordt categorie ${categorie}`, async ({ page }) => {
            const app = await vulVolledigeFactuur(page);
            if (regime === 'icp') await app.clientCountry.fill('Duitsland');
            if (regime === 'export' || regime === 'dienst-buiten-eu') {
                await app.clientCountry.fill('Zwitserland');
            }
            // Verlegging en icp kunnen niet zonder het btw-nummer van de klant.
            if (regime === 'verlegd' || regime === 'icp') {
                await app.clientVat.fill('NL987654321B01');
            }
            await app.vatScheme.selectOption(regime);

            // De vermelding hoort ook op het papier te staan; anders is de
            // factuur onvolledig, los van de e-factuur.
            await expect(app.preview).toContainText(zin);

            const uit = await ontleed(page, (await haalUbl(page)).xml);
            if ('fout' in uit) throw new Error(uit.fout);
            expect(uit.groepen).toHaveLength(1);
            expect(uit.groepen[0].categorie).toBe(categorie);
            expect(uit.regels[0].categorie).toBe(categorie);
            expect(uit.btwTotaal).toBe('0.00');
            expect(uit.teBetalen).toBe(uit.exclusief);
        });
    }

    /**
     * Categorie O draagt géén btw-nummer, van niemand.
     *
     * BR-O-02 verbiedt in zo'n bestand het nummer van de leverancier (BT-31),
     * dat van zijn fiscaal vertegenwoordiger (BT-63) én dat van de klant
     * (BT-48). Dat is ruimer dan het klinkt: de eerste poging liet alleen dat
     * van de leverancier weg en werd nog steeds afgekeurd.
     *
     * De Schematron in check:efactuur bewaakt dit ook, maar die draait alleen
     * tegen een gebouwde app en met een JRE erbij. Deze test houdt het verband
     * vast in de gewone suite, inclusief het stuk dat geen schema kan zien:
     * op het papieren document hoort het nummer er juist wél op te staan,
     * want art. 35a eist het daar.
     */
    test('een dienst buiten de EU draagt geen enkel btw-nummer in het bestand', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientCountry.fill('Zwitserland');
        await app.clientVat.fill('NL987654321B01');
        await app.vatScheme.selectOption('dienst-buiten-eu');

        const { xml } = await haalUbl(page);
        expect(xml).not.toContain('PartyTaxScheme');
        expect(xml).not.toContain('NL123456789B01');
        expect(xml).not.toContain('NL987654321B01');
        // BR-O-05: geen tarief, ook geen 0.00.
        expect(xml).not.toContain('cbc:Percent');
        // Maar de leverancier blijft herkenbaar, anders valt BR-NL-1 om.
        expect(xml).toContain('schemeID="0106"');

        // En op papier staat het btw-nummer er gewoon op.
        await expect(app.preview).toContainText('NL123456789B01');
    });

    /**
     * Het spiegelbeeld van de icp-controle, en net zo min door een schema te
     * zien: een dienst "buiten de EU" aan een klant binnen de EU bestaat niet.
     */
    test('een dienst buiten de EU weigert een klant binnen de EU', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientCountry.fill('Duitsland');
        await app.vatScheme.selectOption('dienst-buiten-eu');

        await app.downloadUbl.click();
        await expect(page.getByText(/klant buiten de EU/)).toBeVisible();
    });

    /**
     * Een nultarief is géén regime meer.
     *
     * Het was er even, en het was verkeerd bedacht: het verborg het tarief en
     * het bedrag die de wet bij een echt nultarief juist op de factuur wil
     * hebben. Het gewone regime met een regel op 0% toont die wel, en levert
     * dezelfde UBL-categorie Z. BR-Z-10 verbiedt daar een vrijstellingsreden,
     * en die komt er langs dat pad ook niet.
     */
    test('een nultarief is het gewone regime met 0% per regel, niet een eigen keuze', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await expect(app.vatScheme.locator('option[value="nultarief"]')).toHaveCount(0);

        await app.itemVatRate().selectOption('0');
        // Het tarief hoort zichtbaar te zijn — dat is precies wat het
        // ingetrokken regime wegliet.
        await expect(app.preview).toContainText('BTW (0%)');

        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);
        expect(uit.groepen[0].categorie).toBe('Z');
        expect(uit.groepen[0].reden).toBeNull();
    });

    test('verlegd en icp zetten het btw-nummer van de klant op het document', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientVat.fill('NL987654321B01');
        await app.vatScheme.selectOption('verlegd');

        // Zonder dat nummer kan de afnemer de btw niet aangeven.
        await expect(app.preview).toContainText('Btw-nummer afnemer: NL987654321B01');
        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);
        expect(uit.groepen[0].reden).toContain('NL987654321B01');
    });

    test('verlegd weigert te exporteren zonder btw-nummer van de klant', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientVat.fill('');
        await app.vatScheme.selectOption('verlegd');

        await app.downloadUbl.click();
        await expect(app.status.filter({ hasText: 'btw-nummer van je klant' })).toBeVisible();
    });

    /**
     * Een intracommunautaire levering naar Nederland bestaat niet, en naar
     * buiten de EU is het uitvoer. Geen schema dat dit ziet: het is een feit
     * over de transactie, niet over het bestand.
     */
    test('icp weigert een Nederlandse klant', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientVat.fill('NL987654321B01');
        await app.vatScheme.selectOption('icp');

        await app.downloadUbl.click();
        await expect(app.status.filter({ hasText: 'niet naar Nederland' })).toBeVisible();
    });

    test('icp weigert een klant buiten de EU', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientCountry.fill('Zwitserland');
        await app.clientVat.fill('CHE123456789');
        await app.vatScheme.selectOption('icp');

        await app.downloadUbl.click();
        await expect(app.status.filter({ hasText: 'zit niet in de EU' })).toBeVisible();
    });

    test('icp noemt leverdatum en bestemmingsland', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientCountry.fill('Duitsland');
        await app.clientVat.fill('NL987654321B01');
        await app.vatScheme.selectOption('icp');
        await app.deliveryDate.fill('2026-09-30');

        // BR-IC-11 wil de leverdatum, BR-IC-12 het bestemmingsland.
        const { xml } = await haalUbl(page);
        expect(xml).toContain('<cbc:ActualDeliveryDate>2026-09-30</cbc:ActualDeliveryDate>');
        expect(xml).toContain('<cbc:IdentificationCode>DE</cbc:IdentificationCode>');
    });

    test('zonder leverdatum neemt icp de factuurdatum', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientCountry.fill('België');
        await app.clientVat.fill('BE0123456789');
        await app.vatScheme.selectOption('icp');

        const { xml } = await haalUbl(page);
        const datum = await page.locator('#datum').inputValue();
        expect(xml).toContain(`<cbc:ActualDeliveryDate>${datum}</cbc:ActualDeliveryDate>`);
        expect(xml).toContain('<cbc:IdentificationCode>BE</cbc:IdentificationCode>');
    });
});

test.describe('landcodes', () => {
    test('een Nederlandse landnaam wordt de juiste code, niet NL voor alles', async ({ page }) => {
        // Hier zat een echte fout: alles wat geen twee letters was en niet
        // "Nederland" heette, kreeg NL mee. Een Belgische klant stond dus als
        // Nederlands in de e-factuur, op elke factuur.
        const app = await vulVolledigeFactuur(page);
        await app.clientCountry.fill('Duitsland');

        const { xml } = await haalUbl(page);
        expect(xml).toContain('<cbc:IdentificationCode>DE</cbc:IdentificationCode>');
    });

    /**
     * En dat geldt ook voor je eigen land, wat het lang niet deed.
     *
     * Alleen de klant werd nagekeken. Een tikfout in je eigen adres viel in
     * `adres()` terug op NL en ging zo de deur uit — dezelfde fout als bij die
     * Belgische klant hierboven, alleen aan de andere kant van het document en
     * door niemand opgemerkt. Dat het meestal goed uitvalt omdat deze app een
     * Nederlands btw-nummer eist, maakt het niet juist.
     */
    test('ook een onbekend eigen land wordt geweigerd, niet geraden', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await openFoldout(page, 'Mijn Bedrijfsgegevens');
        await app.companyCountry.fill('Nederlnad');

        await app.downloadUbl.click();
        await expect(app.status.filter({ hasText: 'je eigen land' })).toBeVisible();
    });

    test('en een eigen land dat wél herkend wordt gaat gewoon mee', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await openFoldout(page, 'Mijn Bedrijfsgegevens');
        // Vier schrijfwijzen die allemaal NL horen op te leveren; leeg ook,
        // want het formulier zegt "alleen invullen bij buitenlandse klanten".
        await app.companyCountry.fill('The Netherlands');

        const { xml } = await haalUbl(page);
        expect(xml).toContain('<cbc:IdentificationCode>NL</cbc:IdentificationCode>');
    });

    test('de BIC gaat mee als die is ingevuld', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await openFoldout(page, 'Mijn Betaalgegevens');
        await app.bic.fill('ABNANL2A');

        const { xml } = await haalUbl(page);
        expect(xml).toContain('<cac:FinancialInstitutionBranch><cbc:ID>ABNANL2A</cbc:ID>');
    });

    test('en blijft weg als die er niet is, want een leeg element is geen gegeven', async ({ page }) => {
        await vulVolledigeFactuur(page);
        const { xml } = await haalUbl(page);
        expect(xml).not.toContain('FinancialInstitutionBranch');
    });

    test('een onbekend land wordt niet geraden maar geweigerd', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientCountry.fill('Verweggistan');

        await app.downloadUbl.click();
        await expect(app.status.filter({ hasText: 'landcode' })).toBeVisible();
    });

    test('een tweeletterige code mag je zelf invullen', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientCountry.fill('pt');

        const { xml } = await haalUbl(page);
        expect(xml).toContain('<cbc:IdentificationCode>PT</cbc:IdentificationCode>');
    });
});

test.describe('de klant als Peppol-adres', () => {
    /**
     * Zonder het KvK-nummer van de klant is het bestand geldige NLCIUS die je
     * zelf kunt aanleveren, maar kan een Peppol-toegangspunt het niet routeren.
     * Daarom optioneel en niet verplicht: een buitenlandse klant of een
     * particulier heeft geen KvK-nummer, en dan is een geweigerde export erger.
     */
    test('neemt het KvK-nummer van de klant over als het is ingevuld', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientKvk.fill('12345678');

        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);
        expect(uit.ontvangerKvk).toBe('12345678');
    });

    test('laat het weg als het er niet is, en blijft verder gewoon werken', async ({ page }) => {
        await vulVolledigeFactuur(page);
        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);
        expect(uit.ontvangerKvk).toBeNull();
        expect(uit.teBetalen).toBe('1512.50');
    });

    test('komt mee uit het klantenboek', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientKvk.fill('12345678');
        await app.saveClient.click();

        // Een andere klant kiezen en weer terug: het nummer hoort mee te komen.
        await app.clientPicker.selectOption('');
        await app.clientPicker.selectOption({ label: 'Klant BV' });

        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);
        expect(uit.ontvangerKvk).toBe('12345678');
    });
});

test.describe('wat er mis kan gaan', () => {
    test('weigert te exporteren zonder de verplichte gegevens, en zegt welke', async ({ page }) => {
        const app = ui(page);
        await app.clientName.fill('Klant BV');
        await app.itemPrice().fill('100');

        await app.downloadUbl.click();

        const melding = app.status.filter({ hasText: 'e-factuur' });
        await expect(melding).toBeVisible();
        await expect(melding).toContainText('KvK-nummer');
        await expect(melding).toContainText('btw-identificatienummer');
        await expect(melding).toContainText('referentie van je klant');
    });

    test('een vrij ingevulde eenheid wordt een geldige code', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        // Niemand kent alle UN/ECE-codes, dus het veld is vrij. Wat we niet
        // kennen wordt C62 — een geldige code — en niet de vrije tekst.
        await app.itemUnit().fill('bakje koffie');

        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);
        expect(uit.regels[0].eenheid).toBe('C62');
    });

    test('tekens die XML breken worden ontsnapt', async ({ page }) => {
        const app = await vulVolledigeFactuur(page);
        await app.clientName.fill('Jansen & Zn <BV> "De Hoek"');

        const { xml } = await haalUbl(page);
        expect(xml).not.toContain('<BV>');
        expect(xml).toContain('&amp;');

        // En na het inlezen staat de naam er weer gewoon: ontsnappen is geen
        // verminking.
        const uit = await ontleed(page, xml);
        if ('fout' in uit) throw new Error(uit.fout);
        expect(uit.ontvangerNaam).toBe('Jansen & Zn <BV> "De Hoek"');
    });

    test('een offerte biedt geen e-factuur aan', async ({ page }) => {
        const app = ui(page);
        await app.tab('Offerte').click();
        // Een offerte is geen factuur; UBL kent er een ander documenttype voor.
        await expect(app.downloadUbl).toHaveCount(0);
    });
});

test.describe('de creditfactuur', () => {
    /**
     * Een creditnota is in UBL een ánder document dan een factuur, niet een
     * factuur met een andere code erin. NLCIUS zegt dat met zoveel woorden
     * (BR-NL-8), en de officiële validator wees de eerste poging daarop af.
     */
    const maakCreditfactuur = async (page: import('@playwright/test').Page) => {
        const app = await vulVolledigeFactuur(page);
        const origineel = await app.documentNumber.inputValue();
        await app.saveDocument.click();
        await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

        await openFoldout(page, 'Bewaarde documenten');
        await app.archiveRowFor(origineel).view.click();
        await app.archiveDialog.getByRole('button', { name: 'Crediteren' }).click();
        await expect(app.archiveDialog).not.toBeVisible();
        return { app, origineel };
    };

    test('gaat als CreditNote de deur uit, niet als Invoice', async ({ page }) => {
        const { app } = await maakCreditfactuur(page);
        const { xml, naam } = await haalUbl(page);

        expect(naam).toContain('ecreditfactuur');
        const uit = await ontleed(page, xml);
        if ('fout' in uit) throw new Error(uit.fout);

        expect(uit.wortel).toBe('CreditNote');
        expect(uit.naamruimte).toBe('urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2');
        expect(uit.typeCode).toBe('381');
        // De regels heten daar ook anders.
        expect(uit.regelsCredit.length).toBeGreaterThan(0);
        expect(uit.regels).toHaveLength(0);
        await expect(app.preview).toContainText('CREDITFACTUUR');
    });

    test('verwijst naar de factuur die hij terugneemt', async ({ page }) => {
        const { origineel } = await maakCreditfactuur(page);
        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);

        // BR-55 wil de verwijzing; BR-NL-24 raadt de datum erbij juist af.
        expect(uit.gecrediteerd).toBe(origineel);
        expect((await haalUbl(page)).xml).not.toContain('<cac:InvoiceDocumentReference><cbc:ID>'
            + origineel + '</cbc:ID><cbc:IssueDate>');
    });

    test('houdt de bedragen positief', async ({ page }) => {
        await maakCreditfactuur(page);
        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);

        // De documentsoort zegt al welke kant het op gaat; een min erbij zou
        // dat een tweede keer zeggen en daarmee omkeren.
        expect(uit.teBetalen).toBe('1512.50');
        expect(uit.regelsCredit[0].regelbedrag).toBe('1250.00');
        expect((await haalUbl(page)).xml).not.toContain('>-');
    });

    test('een gewone factuur blijft Invoice met 380', async ({ page }) => {
        await vulVolledigeFactuur(page);
        const uit = await ontleed(page, (await haalUbl(page)).xml);
        if ('fout' in uit) throw new Error(uit.fout);
        expect(uit.wortel).toBe('Invoice');
        expect(uit.typeCode).toBe('380');
        expect(uit.gecrediteerd).toBeNull();
    });
});

test('een bewaarde factuur is nog als e-factuur te downloaden', async ({ page }) => {
    const app = await vulVolledigeFactuur(page);
    const nummer = await app.documentNumber.inputValue();
    await app.saveDocument.click();
    await expect(app.status.filter({ hasText: 'is bewaard' })).toBeVisible();

    await openFoldout(page, 'Bewaarde documenten');
    await app.archiveRowFor(nummer).view.click();

    const [download] = await Promise.all([
        page.waitForEvent('download'),
        app.archiveDialog.getByRole('button', { name: 'E-factuur' }).click(),
    ]);
    expect(download.suggestedFilename()).toContain('efactuur');
});

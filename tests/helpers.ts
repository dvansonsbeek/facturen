import { expect, type Page } from '@playwright/test';

/**
 * All selectors live here on purpose.
 *
 * The form's <label> elements have no htmlFor binding, so getByLabel does not
 * work and placeholders are the stable handle. When InvoiceForm is split into
 * smaller components, this should be the only test file that needs touching.
 */
export const ui = (page: Page) => ({
    tab: (name: 'Factuur' | 'Offerte') =>
        page.getByRole('button', { name, exact: true }).first(),

    /**
     * Het live voorbeeld. Bewust binnen .preview-wrapper: een bewaard document
     * opent in een venster met zijn eigen .invoice-preview, en zonder deze
     * begrenzing wijst "het voorbeeld" dan naar twee stukken tegelijk.
     */
    preview: page.locator('.preview-wrapper .invoice-preview'),

    /** Het klantblok, zodat klantasserties niet per ongeluk afzendertekst raken. */
    clientBlock: page.locator('.preview-wrapper .invoice-preview div').filter({
        has: page.locator('h3', { hasText: /Factureren aan:|Offerte voor:/ }),
    }).last(),

    // Mijn Bedrijfsgegevens
    companyName: page.locator('input[placeholder="Mijn Bedrijf BV"]'),
    companyEmail: page.locator('input[placeholder="info@mijnbedrijf.nl"]'),
    companyVat: page.locator('input[placeholder="NL123456789B01"]').first(),
    // Op de id: de klant heeft sinds kort dezelfde voorbeeldplaceholder, en een
    // selector op "12345678" wees daardoor naar twee velden tegelijk.
    companyKvk: page.locator('#bedrijf-kvk'),
    /** Je eigen land. Gaat als landcode de e-factuur in, net als dat van de klant. */
    companyCountry: page.locator('#bedrijf-land'),
    exportSettings: page.getByRole('button', { name: 'Export', exact: true }),
    clearSettings: page.getByRole('button', { name: 'Wissen', exact: true }),

    /** De klikbare kop van een inklapbare sectie. */
    companySummary: page.locator('details.foldout summary', { hasText: 'Mijn Bedrijfsgegevens' }),
    paymentSummary: page.locator('details.foldout summary', { hasText: 'Mijn Betaalgegevens' }),

    // Algemene Informatie
    documentNumber: page.locator('input.invoice-number-input'),
    /**
     * De btw-behandeling van het document. Was een KOR-vinkje; het is nu een
     * keuzelijst, omdat 0% vier verschillende redenen kan hebben die elk een
     * eigen vermelding en een eigen UBL-categorie krijgen.
     */
    vatScheme: page.locator('#btwRegime'),

    /**
     * De taal van het document, niet van de app. Staat naast de btw-behandeling,
     * want ze volgen allebei uit wie de klant is; zie lib/taal.ts.
     */
    documentTaal: page.locator('#documenttaal'),

    // Klantgegevens
    clientName: page.locator('input[placeholder="Naam van de klant"]'),
    clientPicker: page.locator('select#klantKiezen'),
    saveClient: page.getByRole('button', { name: /Opslaan|Bijwerken/ }),
    editClient: page.getByRole('button', { name: 'Bewerken', exact: true }),
    // Op titel en niet op naam: het archief heeft ook een Verwijderen per regel,
    // en dan wijst "Verwijderen" naar meer dan één knop.
    deleteClient: page.locator('button[title="Deze klant uit je klantenboek verwijderen"]'),
    clientAddress: page.locator('input[placeholder="Straatnaam 123"]'),
    // De tweede: de eerste hoort bij de afzender.
    clientCity: page.locator('input[placeholder="Amsterdam"]').nth(1),
    clientZip: page.locator('input[placeholder="1234 AB"]').nth(1),
    // Op de id en niet op de placeholder: die bevatte een hele uitleg, die naar
    // een <p> eronder is verhuisd omdat hij op een telefoon werd afgekapt. Een
    // selector mag niet omvallen omdat een hint herschreven wordt.
    clientCountry: page.locator('#klant-land'),
    clientVat: page.locator('input[placeholder="NL123456789B01"]').nth(1),
    clientKvk: page.locator('#klant-kvk'),

    // Items
    itemName: (i = 0) => page.locator('input[placeholder="Bijv. Webdesign"]').nth(i),
    itemDescription: (i = 0) => page.locator('textarea[placeholder="Omschrijving goederen/ diensten"]').nth(i),
    itemQuantity: (i = 0) => page.locator('input[placeholder="Aantal"]').nth(i),
    // Op de datalist en niet op de placeholder: die tekst is al eens ingekort
    // omdat hij in een smalle kolom niet paste, en dat brak drie tests die
    // niets met opmaak te maken hadden. list="eenheden" is wat het veld ís.
    itemUnit: (i = 0) => page.locator('input[list="eenheden"]').nth(i),
    itemPrice: (i = 0) => page.locator('input[placeholder="Eenheidsprijs"]').nth(i),
    itemVatRate: (i = 0) => page.locator('.item-row select').nth(i),
    addItem: page.getByRole('button', { name: /Item Toevoegen/ }),
    /** Het prullenbakje van één regel. */
    removeItem: (i = 0) => page.locator('.item-row button[title="Deze regel verwijderen"]').nth(i),

    // Betaalgegevens
    iban: page.locator('input[placeholder="NLxx XXXX XXXX XXXX XX"]'),
    /** De BIC bij het rekeningnummer; komt op het document en in de e-factuur. */
    bic: page.locator('#bic'),
    /** De einddatum van een offerte. Alleen daar: een factuur heeft er geen. */
    validUntil: page.locator('#geldig-tot'),
    /** De betaaltermijn als getal; hieruit komt de zin op het document. */
    paymentTermDays: page.locator('#betaaltermijn'),
    /** De eigen tekst die in plaats van die zin komt. */
    paymentConditions: page.locator('#betalingsvoorwaarden'),

    // Opmerkingen
    notes: page.locator('#opmerkingen'),

    // Algemene Informatie, alleen bij een factuur: nodig voor de e-factuur.
    buyerReference: page.locator('#klantreferentie'),
    /** Alleen zichtbaar bij een intracommunautaire levering. */
    deliveryDate: page.locator('#leverdatum'),

    downloadPdf: page.getByRole('button', { name: /Download PDF/i }),
    downloadUbl: page.getByRole('button', { name: /E-factuur \(UBL\)/ }),
    nextDocument: page.getByRole('button', { name: /Volgende (factuur|offerte)/ }),
    convertToInvoice: page.getByRole('button', { name: /Omzetten naar factuur/ }),

    // Bewaarde documenten
    saveDocument: page.getByRole('button', { name: 'Bewaren', exact: true }),
    archiveSummary: page.locator('details.foldout summary', { hasText: 'Bewaarde documenten' }),
    archiveRows: page.locator('.archief-regel'),
    /**
     * De archiefregel van een bepaald document, gezocht op nummer of klantnaam.
     *
     * Verkies dit boven een index. Het archief staat op bewaarmoment gesorteerd,
     * dus zodra er iets bij komt verschuift alles — een index wijst dan stil naar
     * een ander document, en een test die iets verwijdert gooit het verkeerde weg.
     */
    archiveRowFor: (tekst: string) => {
        const row = page.locator('.archief-regel').filter({ hasText: tekst });
        return {
            row,
            text: () => row.innerText().then(normalise),
            view: row.getByRole('button', { name: 'Bekijken' }),
            pdf: row.getByRole('button', { name: 'PDF', exact: true }),
            duplicate: row.getByRole('button', { name: 'Dupliceren' }),
            remove: row.getByRole('button', { name: 'Verwijderen' }),
        };
    },

    /** Eén regel uit het archief, met de knoppen die erbij horen. */
    archiveRow: (i = 0) => {
        const row = page.locator('.archief-regel').nth(i);
        return {
            row,
            text: () => row.innerText().then(normalise),
            view: row.getByRole('button', { name: 'Bekijken' }),
            pdf: row.getByRole('button', { name: 'PDF', exact: true }),
            duplicate: row.getByRole('button', { name: 'Dupliceren' }),
            remove: row.getByRole('button', { name: 'Verwijderen' }),
        };
    },
    /** Het venster waarin een bewaard document opent. */
    archiveDialog: page.locator('dialog.archief-venster'),
    archiveDialogClose: page.locator('dialog.archief-venster').getByRole('button', { name: 'Sluiten' }),
    /** Het voorbeeld binnen dat venster, los van het live voorbeeld ernaast. */
    archiveDialogPreview: page.locator('dialog.archief-venster .invoice-preview'),
    /** Het archief als tabel, voor je boekhouder; zie lib/csv.ts. */
    downloadCsv: page.getByRole('button', { name: 'Overzicht als CSV' }),
    /**
     * De melding onder het formulier (bewaren, dupliceren, e-factuur).
     *
     * Op klasse en niet op role="status": het logo, de beveiligingssectie en de
     * btw-behandeling hebben die rol ook, en dan wijst "de melding" naar meer
     * dan één element.
     */
    status: page.locator('p.form-melding'),

    // Beveiliging en privacy
    securitySummary: page.locator('details.foldout summary', { hasText: 'Beveiliging en privacy' }),
    newPassphrase: page.locator('#kluis-nieuw'),
    repeatPassphrase: page.locator('#kluis-herhaal'),
    /** Het veld om te ontgrendelen; een ander veld dan dat om er een in te stellen. */
    passphrase: page.locator('#kluis-zin'),
    encryptArchive: page.getByRole('button', { name: /Archief versleutelen|Bezig/ }),
    unlockArchive: page.getByRole('button', { name: /Ontgrendelen|Bezig/ }),
    lockArchive: page.getByRole('button', { name: 'Vergrendelen', exact: true }),
    removePassphrase: page.getByRole('button', { name: /Versleuteling eraf halen/ }),
    /** Meldingen binnen de beveiligingssectie, los van die onderaan het formulier. */
    securityStatus: page.locator('details.foldout', {
        has: page.locator('h3', { hasText: 'Beveiliging en privacy' }),
    }).locator('p[role="status"]'),
});

/**
 * Wait until React has hydrated and run its effects.
 *
 * `readServerFoldouts` returns the defaults while `readFoldouts` reads
 * localStorage, so which sections are open differs between the server render and
 * the client one. Right after a reload there is a window in which a section the
 * user had opened is still rendered closed — and a click in that window toggles
 * the DOM without React knowing, after which hydration undoes it. Anything that
 * depends on persisted state has to wait for this first.
 *
 * `data-theme` is the marker because it is set from an effect, so it cannot
 * appear before hydration has happened.
 */
export const waitForHydration = (page: Page) =>
    expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/);

/**
 * Open de app, en wacht tot React er echt achter zit.
 *
 * `page.goto` levert de door de server getekende HTML, en de velden staan daar
 * al in. Typen of klikken lukt dus meteen, maar React gooit dat weg zodra het
 * hydrateert: de state begint bij de beginwaarde en niet bij wat er in de DOM
 * staat. Onder druk — een trage machine, of meer workers dan kernen — duurt dat
 * lang genoeg om er echt tussen te komen, en dan verdwijnt de handeling zonder
 * dat er iets faalt. Een assertie die daarna tien seconden blijft kijken ziet
 * nooit meer iets veranderen, dus helpt opnieuw proberen niet.
 *
 * Daarom gaat elke spec hierlangs naar binnen en niet via `page.goto` zelf.
 * `waitForHydration` bestond al voor na een herlaadbeurt; dit is dezelfde val
 * bij de eerste keer openen, en die kostte het meeste.
 */
export const openApp = async (page: Page, pad = '/') => {
    await page.goto(pad);
    await waitForHydration(page);
};

/**
 * Ensure a foldout section is open, idempotently.
 *
 * Decide on the <details open> attribute, never on whether a child is visible.
 * A section whose contents arrive asynchronously — the archive and the vault are
 * read from IndexedDB — has no visible children yet while it is already open, so
 * a visibility check races the load and clicks an open section shut.
 */
export const openFoldout = async (page: Page, heading: string) => {
    await waitForHydration(page);
    const section = page
        .locator('details.foldout')
        .filter({ has: page.locator('h3', { hasText: heading }) });
    await expect(section).toBeVisible();
    if ((await section.getAttribute('open')) === null) {
        await section.locator('summary').click();
    }
    await expect(section).toHaveAttribute('open', '');
    return section;
};

/**
 * Intl currency output separates the symbol with a non-breaking space, which
 * makes assertions unreadable. Normalise it away.
 */
export const normalise = (text: string) => text.replace(/ /g, ' ');

export const previewText = async (page: Page) =>
    normalise(await page.locator('.preview-wrapper .invoice-preview').innerText());

/**
 * Wat er op het document hoort te staan, en wat er niet mag staan.
 *
 * Twee soorten asserties die elk een andere behandeling nodig hebben, en het
 * verschil is de reden dat dit een hulpmiddel is en geen handwerk per test.
 *
 * **Wat er wél staat, wordt afgewacht.** `expect(await previewText(page))` kijkt
 * precies één keer: heeft React nog niet getekend, dan faalt hij, en geen
 * timeout helpt want er wordt niets opnieuw geprobeerd. `toContainText` blijft
 * het proberen.
 *
 * Dat was níet de oorzaak van het flakeren, hoe aannemelijk het ook klonk. Met
 * alle 24 omgezet viel `document.spec.ts` onder `--workers=16` nog tien tot
 * twaalf keer om, en wat er omviel waren juist de wachtende asserties: een veld
 * dat na 24 pogingen nog steeds de beginwaarde gaf. Het typen zelf was
 * weggegooid, en dat lost geen assertie op. Zie `openApp` hierboven. Dit blijft
 * omdat een eenmalige lezing alsnog fout is, niet omdat het iets repareerde.
 *
 * **Wat er níet staat, wordt één keer gelezen.** Een herhalende "bevat niet"
 * kan al slagen vóórdat de wijziging heeft plaatsgevonden, en meet dan niets.
 *
 * **En daarom eist dit minstens één `bevat`.** Een afwezigheid zegt alleen iets
 * als vaststaat dat het voorbeeld bij is. Zonder anker slaagt "er staat geen
 * BTW:" ook op een voorbeeld dat nog leeg is — een test die niet kán falen, en
 * dat is erger dan een test die af en toe ten onrechte faalt. Vier van die
 * gevallen stonden hier, en deze eis is wat voorkomt dat er een vijfde bij komt.
 */
export const verwachtVoorbeeld = async (
    page: Page,
    { bevat, bevatNiet = [] }: { bevat: (string | RegExp)[]; bevatNiet?: (string | RegExp)[] },
) => {
    if (bevat.length === 0) {
        throw new Error(
            'verwachtVoorbeeld heeft minstens één `bevat` nodig: zonder iets dat '
            + 'moet verschijnen zegt "bevat niet" niets over een voorbeeld dat '
            + 'misschien nog niet getekend is.',
        );
    }

    const voorbeeld = page.locator('.preview-wrapper .invoice-preview');
    // useInnerText, en dat moet: zonder die vlag kijkt toContainText naar
    // textContent, en dat is de ruwe tekst uit de DOM. De kop boven de
    // klantgegevens staat daar als "Factureren aan:" terwijl er op het scherm
    // FACTUREREN AAN: staat, want dat doet CSS met text-transform. De
    // `bevatNiet`-kant hieronder leest innerText, dus zonder deze vlag zouden de
    // twee helften van deze functie naar verschillende tekst kijken.
    for (const stuk of bevat) {
        await expect(voorbeeld).toContainText(stuk, { useInnerText: true });
    }

    if (bevatNiet.length === 0) return;
    // Pas hierna, en in één keer: nu staat vast dat het voorbeeld bij is.
    const tekst = await previewText(page);
    for (const stuk of bevatNiet) {
        if (typeof stuk === 'string') expect(tekst, `"${stuk}" staat er wél`).not.toContain(stuk);
        else expect(tekst, `${stuk} komt wél voor`).not.toMatch(stuk);
    }
};

/** The preview's line-item table headers, e.g. ['Beschrijving', 'Aantal', ...]. */
export const previewHeaders = (page: Page) =>
    page.locator('.preview-wrapper .invoice-preview thead th').allInnerTexts();

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

/** The preview's line-item table headers, e.g. ['Beschrijving', 'Aantal', ...]. */
export const previewHeaders = (page: Page) =>
    page.locator('.preview-wrapper .invoice-preview thead th').allInnerTexts();

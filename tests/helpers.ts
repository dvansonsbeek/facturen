import type { Page } from '@playwright/test';

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

    preview: page.locator('.invoice-preview'),

    /** Het klantblok, zodat klantasserties niet per ongeluk afzendertekst raken. */
    clientBlock: page.locator('.invoice-preview div').filter({
        has: page.locator('h3', { hasText: /Factureren aan:|Offerte voor:/ }),
    }).last(),

    // Mijn Bedrijfsgegevens
    companyName: page.locator('input[placeholder="Mijn Bedrijf BV"]'),
    companyEmail: page.locator('input[placeholder="info@mijnbedrijf.nl"]'),
    companyVat: page.locator('input[placeholder="NL123456789B01"]').first(),
    companyKvk: page.locator('input[placeholder="12345678"]'),
    exportSettings: page.getByRole('button', { name: 'Export', exact: true }),
    clearSettings: page.getByRole('button', { name: 'Wissen', exact: true }),

    /** De klikbare kop van een inklapbare sectie. */
    companySummary: page.locator('details.foldout summary', { hasText: 'Mijn Bedrijfsgegevens' }),
    paymentSummary: page.locator('details.foldout summary', { hasText: 'Mijn Betaalgegevens' }),

    // Algemene Informatie
    documentNumber: page.locator('input.invoice-number-input'),
    korToggle: page.locator('#vatExempt'),

    // Klantgegevens
    clientName: page.locator('input[placeholder="Naam van de klant"]'),
    clientPicker: page.locator('select#klantKiezen'),
    saveClient: page.getByRole('button', { name: /Opslaan|Bijwerken/ }),
    editClient: page.getByRole('button', { name: 'Bewerken', exact: true }),
    deleteClient: page.getByRole('button', { name: 'Verwijderen', exact: true }),
    clientAddress: page.locator('input[placeholder="Straatnaam 123"]'),
    // De tweede: de eerste hoort bij de afzender.
    clientCity: page.locator('input[placeholder="Amsterdam"]').nth(1),
    clientZip: page.locator('input[placeholder="1234 AB"]').nth(1),
    clientCountry: page.locator('input[placeholder="Alleen invullen bij buitenlandse klanten"]'),
    clientVat: page.locator('input[placeholder="NL123456789B01"]').nth(1),

    // Items
    itemName: (i = 0) => page.locator('input[placeholder="Bijv. Webdesign"]').nth(i),
    itemDescription: (i = 0) => page.locator('textarea[placeholder="Omschrijving goederen/ diensten"]').nth(i),
    itemQuantity: (i = 0) => page.locator('input[placeholder="Aantal"]').nth(i),
    itemUnit: (i = 0) => page.locator('input[placeholder="uur, stuk…"]').nth(i),
    itemPrice: (i = 0) => page.locator('input[placeholder="Eenheidsprijs"]').nth(i),
    itemVatRate: (i = 0) => page.locator('.item-row select').nth(i),
    addItem: page.getByRole('button', { name: /Item Toevoegen/ }),

    // Betaalgegevens
    iban: page.locator('input[placeholder="NLxx XXXX XXXX XXXX XX"]'),
    paymentConditions: page.locator('input[placeholder="Binnen 14 dagen na factuurdatum."]'),

    // Opmerkingen
    notes: page.locator('textarea[placeholder="Extra tekst onderaan het document (optioneel)"]'),

    downloadPdf: page.getByRole('button', { name: /Download PDF/i }),
    nextDocument: page.getByRole('button', { name: /Volgende (factuur|offerte)/ }),
});

/**
 * Intl currency output separates the symbol with a non-breaking space, which
 * makes assertions unreadable. Normalise it away.
 */
export const normalise = (text: string) => text.replace(/ /g, ' ');

export const previewText = async (page: Page) =>
    normalise(await page.locator('.invoice-preview').innerText());

/** The preview's line-item table headers, e.g. ['Beschrijving', 'Aantal', ...]. */
export const previewHeaders = (page: Page) =>
    page.locator('.invoice-preview thead th').allInnerTexts();

import { Invoice, LineItem } from "@/types";
import { lineTotal, roundToCents, summariseDocument } from "@/lib/utils";

/**
 * De e-factuur: dezelfde factuur, als UBL-bestand in plaats van als PDF.
 *
 * ## Waarom
 *
 * Een e-factuur is geen PDF in een e-mail maar een machineleesbaar bestand dat
 * de boekhouding van je klant zelf kan inlezen. De Rijksoverheid neemt al geen
 * andere factuur meer aan, en voor binnenlands zakelijk verkeer komt het eraan.
 * Het past bij deze app omdat er niets voor nodig is dat een server vereist: het
 * is een tekstbestand dat hier in de browser wordt opgebouwd.
 *
 * ## Welke vorm
 *
 * UBL 2.1 in de Nederlandse uitvoering: **NLCIUS**, oftewel SI-UBL 2.0. Dat is
 * de nationale inperking van de Europese norm EN 16931, en het is wat Nederlandse
 * ontvangers verwachten. De CustomizationID zegt welke inperking het is, de
 * ProfileID welk Peppol-profiel; samen maken ze het bestand verzendbaar over
 * Peppol zonder dat deze app zelf iets verstuurt.
 *
 * ## Dit is een derde weergave van hetzelfde document
 *
 * Het voorbeeld op het scherm, de PDF en dit bestand zeggen alle drie wat de
 * factuur zegt. Ze mogen elkaar niet tegenspreken, dus de btw-opstelling komt
 * hier net als daar uit `summariseDocument`. Reken hier niets zelf uit; een
 * e-factuur die andere bedragen noemt dan de PDF die ernaast gaat, is erger dan
 * geen e-factuur.
 *
 * ## Vrijgesteld is niet nul — ook hier
 *
 * In UBL is dat het verschil tussen belastingcategorie **E** (vrijgesteld) en
 * **Z** (nultarief). De kleineondernemersregeling is een vrijstelling, dus E,
 * met een reden erbij. Een KOR-factuur als Z wegschrijven zegt tegen de
 * boekhouding van je klant dat er btw van toepassing is tegen 0% — en dat is
 * precies de fout die deze app elders al niet maakt.
 */

/** Wat er in het bestand komt te staan over welke norm het volgt. */
const CUSTOMIZATION_ID =
    'urn:cen.eu:en16931:2017#compliant#urn:fdc:nen.nl:nlcius:v1.0';
const PROFILE_ID = 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

/** 380 = handelsfactuur. Een creditnota (381) kent deze app nog niet. */
const INVOICE_TYPE_CODE = '380';

/** 30 = overboeking. De app kent geen andere betaalwijze. */
const PAYMENT_MEANS_CODE = '30';

/**
 * KvK-nummers worden in Peppol aangeduid met schema 0106. Daarmee is de
 * afzender ook adresseerbaar op het netwerk.
 */
const KVK_SCHEME_ID = '0106';

/**
 * Vrije eenheden naar UN/ECE Recommendation 20.
 *
 * Het eenheidsveld in het formulier is met opzet vrij in te vullen — niemand
 * kent alle eenheden. UBL wil een code uit de lijst. Wat we niet kennen wordt
 * C62 ("één"), de neutrale eenheid: dan staat er een geldige code en vertelt de
 * omschrijving van de regel wat het werkelijk is. Beter dan het bestand
 * ongeldig maken om een woord dat iemand zelf verzon.
 */
const UNIT_CODES: Record<string, string> = {
    uur: 'HUR',
    uren: 'HUR',
    stuk: 'H87',
    stuks: 'H87',
    dag: 'DAY',
    dagen: 'DAY',
    week: 'WEE',
    weken: 'WEE',
    maand: 'MON',
    maanden: 'MON',
    jaar: 'ANN',
    km: 'KMT',
    kilometer: 'KMT',
    liter: 'LTR',
    kg: 'KGM',
    kilo: 'KGM',
    m2: 'MTK',
    m3: 'MTQ',
    meter: 'MTR',
};

export const NEUTRALE_EENHEID = 'C62';

export const unitCode = (unit?: string): string =>
    UNIT_CODES[(unit ?? '').trim().toLowerCase()] ?? NEUTRALE_EENHEID;

/** XML-tekst: deze vijf tekens moeten weg, anders breekt het bestand. */
const esc = (waarde: string): string =>
    waarde
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');

/** Bedragen in UBL: punt als scheiding, altijd twee decimalen. */
const bedrag = (waarde: number): string => roundToCents(waarde).toFixed(2);

const tag =(naam: string, waarde: string, attrs = ''): string =>
    `<${naam}${attrs}>${esc(waarde)}</${naam}>`;

/**
 * De belastingcategorie van een regel.
 *
 * E en Z zijn niet uitwisselbaar: E zegt "hier geldt geen btw", Z zegt "hier
 * geldt btw, tegen nul procent". Export en intracommunautaire levering zijn Z;
 * de kleineondernemersregeling is E.
 */
export const taxCategory = (vatRate: number, isVatExempt: boolean): 'E' | 'S' | 'Z' =>
    isVatExempt ? 'E' : vatRate > 0 ? 'S' : 'Z';

export const VRIJSTELLING_REDEN =
    'Vrijgesteld van btw op grond van de kleineondernemersregeling (art. 25 Wet OB 1968).';

/**
 * Wat er nog ontbreekt voor een geldige e-factuur.
 *
 * Een lijst en geen enkele melding, want wie twee dingen mist wil dat in één
 * keer horen. Leeg betekent: dit kan weg.
 *
 * Deze eisen komen uit NLCIUS en niet uit deze app:
 * - een KvK-nummer, want daarmee ben je adresseerbaar (en het moet toch al op
 *   een factuur staan, Handelsregisterwet);
 * - een btw-identificatienummer van de afzender;
 * - een referentie van de koper. Daarmee legt de boekhouding van je klant de
 *   factuur bij de juiste opdracht of kostenplaats. Zonder die referentie wordt
 *   een e-factuur in de praktijk afgewezen, dus hem stilletjes vullen met het
 *   factuurnummer zou een bestand opleveren dat wel door de controle komt en
 *   daarna alsnog blijft liggen.
 */
export const ontbrekendeVelden = (data: Invoice): string[] => {
    const ontbreekt: string[] = [];
    if (!data.sender.kvkNumber?.trim()) ontbreekt.push('je KvK-nummer');
    if (!data.sender.vatNumber?.trim()) ontbreekt.push('je btw-identificatienummer');
    if (!data.client.name.trim()) ontbreekt.push('de naam van je klant');
    if (!data.buyerReference?.trim()) ontbreekt.push('een referentie van je klant');
    return ontbreekt;
};

const adres = (
    p: { address?: string; zip?: string; city?: string; country?: string },
): string => {
    const landcode = /^(|nederland|nl|the netherlands|netherlands)$/i.test((p.country ?? '').trim())
        ? 'NL'
        // Een vrij ingevuld land kan geen landcode worden. Twee letters nemen we
        // over, de rest valt terug op NL, want dit is een Nederlandse app en een
        // ongeldige code maakt het hele bestand onbruikbaar.
        : (p.country ?? '').trim().length === 2
            ? (p.country ?? '').trim().toUpperCase()
            : 'NL';

    return [
        '<cac:PostalAddress>',
        p.address?.trim() ? tag('cbc:StreetName', p.address.trim()) : '',
        p.city?.trim() ? tag('cbc:CityName', p.city.trim()) : '',
        p.zip?.trim() ? tag('cbc:PostalZone', p.zip.trim()) : '',
        '<cac:Country>',
        tag('cbc:IdentificationCode', landcode),
        '</cac:Country>',
        '</cac:PostalAddress>',
    ].filter(Boolean).join('');
};

const afzender = (data: Invoice): string => {
    const kvk = (data.sender.kvkNumber ?? '').trim();
    return [
        '<cac:AccountingSupplierParty><cac:Party>',
        tag('cbc:EndpointID', kvk, ` schemeID="${KVK_SCHEME_ID}"`),
        `<cac:PartyIdentification>${tag('cbc:ID', kvk, ` schemeID="${KVK_SCHEME_ID}"`)}</cac:PartyIdentification>`,
        `<cac:PartyName>${tag('cbc:Name', data.sender.name)}</cac:PartyName>`,
        adres(data.sender),
        '<cac:PartyTaxScheme>',
        tag('cbc:CompanyID', (data.sender.vatNumber ?? '').replace(/\s+/g, '')),
        `<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme>`,
        '</cac:PartyTaxScheme>',
        '<cac:PartyLegalEntity>',
        tag('cbc:RegistrationName', data.sender.name),
        tag('cbc:CompanyID', kvk, ` schemeID="${KVK_SCHEME_ID}"`),
        '</cac:PartyLegalEntity>',
        data.sender.email?.trim()
            ? `<cac:Contact>${tag('cbc:ElectronicMail', data.sender.email.trim())}</cac:Contact>`
            : '',
        '</cac:Party></cac:AccountingSupplierParty>',
    ].filter(Boolean).join('');
};

const ontvanger = (data: Invoice): string => {
    const btw = (data.client.vatNumber ?? '').replace(/\s+/g, '');
    const kvk = (data.client.kvkNumber ?? '').trim();
    return [
        '<cac:AccountingCustomerParty><cac:Party>',
        // Het adres waarop je klant over Peppol bereikbaar is. Optioneel, want
        // een buitenlandse klant of een particulier heeft geen KvK-nummer;
        // zonder dit blijft het bestand geldig om zelf aan te leveren, maar kan
        // een Peppol-toegangspunt het niet routeren.
        kvk ? tag('cbc:EndpointID', kvk, ` schemeID="${KVK_SCHEME_ID}"`) : '',
        kvk
            ? `<cac:PartyIdentification>${tag('cbc:ID', kvk, ` schemeID="${KVK_SCHEME_ID}"`)}</cac:PartyIdentification>`
            : '',
        `<cac:PartyName>${tag('cbc:Name', data.client.name)}</cac:PartyName>`,
        adres(data.client),
        btw
            ? '<cac:PartyTaxScheme>'
              + tag('cbc:CompanyID', btw)
              + `<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme>`
              + '</cac:PartyTaxScheme>'
            : '',
        '<cac:PartyLegalEntity>'
        + tag('cbc:RegistrationName', data.client.name)
        + (kvk ? tag('cbc:CompanyID', kvk, ` schemeID="${KVK_SCHEME_ID}"`) : '')
        + '</cac:PartyLegalEntity>',
        data.client.email?.trim()
            ? `<cac:Contact>${tag('cbc:ElectronicMail', data.client.email.trim())}</cac:Contact>`
            : '',
        '</cac:Party></cac:AccountingCustomerParty>',
    ].filter(Boolean).join('');
};

const betaling = (data: Invoice): string => {
    const iban = (data.bankAccount ?? '').replace(/\s+/g, '').toUpperCase();
    const delen = [];
    if (iban) {
        delen.push(
            '<cac:PaymentMeans>',
            tag('cbc:PaymentMeansCode', PAYMENT_MEANS_CODE),
            tag('cbc:PaymentID', data.invoiceNumber),
            '<cac:PayeeFinancialAccount>',
            tag('cbc:ID', iban),
            data.bic?.trim()
                ? `<cac:FinancialInstitutionBranch>${tag('cbc:ID', data.bic.trim())}</cac:FinancialInstitutionBranch>`
                : '',
            '</cac:PayeeFinancialAccount>',
            '</cac:PaymentMeans>',
        );
    }
    if (data.paymentConditions?.trim()) {
        delen.push(`<cac:PaymentTerms>${tag('cbc:Note', data.paymentConditions.trim())}</cac:PaymentTerms>`);
    }
    return delen.filter(Boolean).join('');
};

/**
 * De btw-opstelling, per tarief, uit summariseDocument.
 *
 * Bij een vrijstelling is er één groep: de hele grondslag, nul btw, categorie E
 * met de reden erbij. Geen tarieven, geen bedragen — net als op het papier.
 */
const btwTotalen = (items: LineItem[], isVatExempt: boolean): string => {
    const { subtotal, vatTotals } = summariseDocument(items, isVatExempt);

    if (isVatExempt) {
        return [
            '<cac:TaxTotal>',
            tag('cbc:TaxAmount', bedrag(0), ' currencyID="EUR"'),
            '<cac:TaxSubtotal>',
            tag('cbc:TaxableAmount', bedrag(subtotal), ' currencyID="EUR"'),
            tag('cbc:TaxAmount', bedrag(0), ' currencyID="EUR"'),
            '<cac:TaxCategory>',
            tag('cbc:ID', 'E'),
            tag('cbc:Percent', '0.00'),
            tag('cbc:TaxExemptionReason', VRIJSTELLING_REDEN),
            `<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme>`,
            '</cac:TaxCategory>',
            '</cac:TaxSubtotal>',
            '</cac:TaxTotal>',
        ].join('');
    }

    // De grondslag per tarief, op dezelfde manier opgeteld als lib/utils.ts dat
    // doet: per tarief over het geheel, daarna afronden.
    const grondslag = items.reduce<Record<number, number>>((acc, item) => {
        acc[item.vatRate] = (acc[item.vatRate] ?? 0) + lineTotal(item);
        return acc;
    }, {});

    const totaalBtw = Object.values(vatTotals).reduce((a, b) => a + b, 0);

    const groepen = Object.keys(grondslag)
        .map(Number)
        .sort((a, b) => b - a)
        .map((tarief) => [
            '<cac:TaxSubtotal>',
            tag('cbc:TaxableAmount', bedrag(grondslag[tarief]), ' currencyID="EUR"'),
            tag('cbc:TaxAmount', bedrag(vatTotals[tarief] ?? 0), ' currencyID="EUR"'),
            '<cac:TaxCategory>',
            tag('cbc:ID', taxCategory(tarief, false)),
            tag('cbc:Percent', tarief.toFixed(2)),
            `<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme>`,
            '</cac:TaxCategory>',
            '</cac:TaxSubtotal>',
        ].join(''))
        .join('');

    return [
        '<cac:TaxTotal>',
        tag('cbc:TaxAmount', bedrag(totaalBtw), ' currencyID="EUR"'),
        groepen,
        '</cac:TaxTotal>',
    ].join('');
};

const regels = (items: LineItem[], isVatExempt: boolean): string =>
    items.map((item, i) => {
        const naam = item.name?.trim() || item.description.trim() || `Regel ${i + 1}`;
        return [
            '<cac:InvoiceLine>',
            tag('cbc:ID', String(i + 1)),
            tag('cbc:InvoicedQuantity', String(item.quantity), ` unitCode="${unitCode(item.unit)}"`),
            tag('cbc:LineExtensionAmount', bedrag(lineTotal(item)), ' currencyID="EUR"'),
            '<cac:Item>',
            tag('cbc:Name', naam),
            // Alleen als hij iets toevoegt: tweemaal dezelfde tekst is ruis in
            // het systeem van de ontvanger.
            item.description.trim() && item.description.trim() !== naam
                ? tag('cbc:Description', item.description.trim())
                : '',
            '<cac:ClassifiedTaxCategory>',
            tag('cbc:ID', taxCategory(item.vatRate, isVatExempt)),
            tag('cbc:Percent', isVatExempt ? '0.00' : item.vatRate.toFixed(2)),
            `<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme>`,
            '</cac:ClassifiedTaxCategory>',
            '</cac:Item>',
            `<cac:Price>${tag('cbc:PriceAmount', bedrag(item.unitPrice), ' currencyID="EUR"')}</cac:Price>`,
            '</cac:InvoiceLine>',
        ].filter(Boolean).join('');
    }).join('');

/**
 * Bouwt de e-factuur.
 *
 * Geeft altijd geldige XML terug, ook als `ontbrekendeVelden` nog iets meldt —
 * het scherm houdt de knop tegen, deze functie niet. Zo blijft hij te testen met
 * minimale gegevens.
 */
export const buildUblInvoice = (data: Invoice): string => {
    const { subtotal, total } = summariseDocument(data.items, data.isVatExempt);

    const body = [
        tag('cbc:CustomizationID', CUSTOMIZATION_ID),
        tag('cbc:ProfileID', PROFILE_ID),
        tag('cbc:ID', data.invoiceNumber),
        tag('cbc:IssueDate', data.date),
        tag('cbc:InvoiceTypeCode', INVOICE_TYPE_CODE),
        data.notes?.trim() ? tag('cbc:Note', data.notes.trim()) : '',
        tag('cbc:DocumentCurrencyCode', 'EUR'),
        // De referentie waarmee je klant de factuur terugvindt in zijn eigen
        // administratie. NLCIUS wil deze of een opdrachtnummer.
        tag('cbc:BuyerReference', (data.buyerReference ?? '').trim()),
        afzender(data),
        ontvanger(data),
        betaling(data),
        btwTotalen(data.items, data.isVatExempt),
        '<cac:LegalMonetaryTotal>',
        tag('cbc:LineExtensionAmount', bedrag(subtotal), ' currencyID="EUR"'),
        tag('cbc:TaxExclusiveAmount', bedrag(subtotal), ' currencyID="EUR"'),
        tag('cbc:TaxInclusiveAmount', bedrag(total), ' currencyID="EUR"'),
        tag('cbc:PayableAmount', bedrag(total), ' currencyID="EUR"'),
        '</cac:LegalMonetaryTotal>',
        regels(data.items, data.isVatExempt),
    ].filter(Boolean).join('');

    return '<?xml version="1.0" encoding="UTF-8"?>'
        + '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"'
        + ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"'
        + ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
        + body
        + '</Invoice>';
};

/** De bestandsnaam waaronder de e-factuur wordt aangeboden. */
export const ublFilename = (invoiceNumber: string): string =>
    `efactuur_${invoiceNumber.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xml`;

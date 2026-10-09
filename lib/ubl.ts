import { Invoice, LineItem, Taal, VatScheme, Discount } from "@/types";
import { lineTotal, roundToCents, summariseDocument } from "@/lib/utils";
import {
    chargesVat, clientVatStatement, schemeOf, statementFor, VAT_SCHEMES,
} from "@/lib/vat-schemes";
import { isEuLand, landcode } from "@/lib/countries";

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

/**
 * Een factuur en een creditnota zijn in UBL twee verschillende documenten.
 *
 * Dat is niet wat je zou denken: EN 16931 laat een creditnota ook toe als
 * gewoon Invoice-document met typecode 381, en zo stond het hier eerst. NLCIUS
 * staat dat niet toe — BR-NL-8 zegt met zoveel woorden dat bij code 381 het
 * CreditNote-schema gebruikt móet worden. De officiële validator wees het af;
 * zelf nadenken had deze regel niet opgeleverd.
 *
 * Verder is het dezelfde inhoud: andere naam voor de wortel, de typecode, de
 * regels en het aantal per regel. De bedragen blijven positief, want de
 * documentsoort zegt al welke kant het op gaat; een min erbij zou dat een
 * tweede keer zeggen en daarmee omkeren.
 */
interface Documentvorm {
    wortel: string;
    naamruimte: string;
    typeCode: string;
    typeWaarde: string;
    regel: string;
    aantal: string;
}

const FACTUUR: Documentvorm = {
    wortel: 'Invoice',
    naamruimte: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    typeCode: 'cbc:InvoiceTypeCode',
    typeWaarde: '380',
    regel: 'cac:InvoiceLine',
    aantal: 'cbc:InvoicedQuantity',
};

const CREDITNOTA: Documentvorm = {
    wortel: 'CreditNote',
    naamruimte: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2',
    typeCode: 'cbc:CreditNoteTypeCode',
    typeWaarde: '381',
    regel: 'cac:CreditNoteLine',
    aantal: 'cbc:CreditedQuantity',
};

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
 * 0% is in UBL niet één ding. Het regime van het document bepaalt de categorie:
 * vrijgesteld (KOR) is E, verlegd is AE, een intracommunautaire levering is K,
 * uitvoer is G, en alleen een echt nultarief is Z. Pas bij het gewone regime
 * volgt de categorie het tarief van de regel: S boven nul, Z op nul.
 *
 * Alles als Z wegschrijven — wat deze app eerder deed — vertelt het grootboek
 * van de ontvanger iets anders dan wat er gebeurd is, en de officiële validator
 * merkt dat niet: Z is op zichzelf geldig.
 */
export const taxCategory = (
    vatRate: number,
    scheme: VatScheme,
): 'E' | 'S' | 'Z' | 'AE' | 'K' | 'G' | 'O' =>
    VAT_SCHEMES[scheme].ublCategory ?? (vatRate > 0 ? 'S' : 'Z');

/**
 * Of dit document buiten het bereik van de heffing valt: UBL-categorie O.
 *
 * Die categorie heeft twee eisen die de rest niet heeft, en allebei komen ze uit
 * de officiële Schematron en niet uit redeneren:
 *
 * - **BR-O-05**: een regel met categorie O mag géén tarief dragen. Niet 0.00,
 *   maar helemaal geen `cbc:Percent`. Bij elk ander regime staat er wel een.
 * - **BR-O-02**: zo'n factuur mag géén btw-identificatienummer bevatten. Niet dat
 *   van de leverancier (BT-31), niet dat van zijn fiscaal vertegenwoordiger
 *   (BT-63) en ook niet dat van de klant (BT-48). Zie `zonderBtwNummers`.
 */
export const buitenBereik = (scheme: VatScheme): boolean =>
    VAT_SCHEMES[scheme].ublCategory === 'O';

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

    const scheme = schemeOf(data);

    // Bij verlegging en een intracommunautaire levering geeft je klant de btw
    // aan, en dat kan hij niet zonder dat zijn btw-nummer op de factuur staat.
    // Zowel de wet als de e-factuurregels (BR-AE-*, BR-IC-*) eisen het.
    if (VAT_SCHEMES[scheme].requiresClientVat && !data.client.vatNumber?.trim()) {
        ontbreekt.push('het btw-nummer van je klant');
    }

    // Een land dat we niet kennen zou anders als NL de deur uit gaan, en dat is
    // een onwaarheid op een factuur. Liever weigeren dan gokken.
    const land = landcode(data.client.country);
    if (!land) {
        ontbreekt.push(`een landcode voor "${data.client.country}" (twee letters, bijvoorbeeld DE)`);
    }

    // Een intracommunautaire levering gaat naar een ánder EU-land. Naar
    // Nederland is het een binnenlandse levering en naar buiten de EU uitvoer;
    // in beide gevallen is dit het verkeerde regime. Geen schema dat dit ziet —
    // het is een feit over de transactie, niet over het bestand.
    if (scheme === 'icp') {
        if (land === 'NL') {
            ontbreekt.push('een EU-land buiten Nederland bij je klant: een intracommunautaire levering gaat niet naar Nederland');
        } else if (land && !isEuLand(land)) {
            ontbreekt.push(`een EU-land bij je klant: ${land} zit niet in de EU, dus dit is uitvoer en geen intracommunautaire levering`);
        }
    }

    // Spiegelbeeld daarvan, en net zo min door een schema te zien: een dienst
    // "buiten de EU" aan een klant binnen de EU bestaat niet. Binnen de EU is
    // het verlegging, in Nederland gewoon btw.
    if (scheme === 'dienst-buiten-eu' && land && isEuLand(land)) {
        ontbreekt.push(
            land === 'NL'
                ? 'een klant buiten de EU: naar een Nederlandse klant is dit een gewone binnenlandse dienst'
                : `een klant buiten de EU: ${land} zit in de EU, dus hier hoort btw verlegd bij`,
        );
    }
    return ontbreekt;
};

const adres = (
    p: { address?: string; zip?: string; city?: string; country?: string },
): string => [
    '<cac:PostalAddress>',
    p.address?.trim() ? tag('cbc:StreetName', p.address.trim()) : '',
    p.city?.trim() ? tag('cbc:CityName', p.city.trim()) : '',
    p.zip?.trim() ? tag('cbc:PostalZone', p.zip.trim()) : '',
    '<cac:Country>',
    // Onbekend land valt hier terug op NL om het bestand welvormd te houden;
    // `ontbrekendeVelden` houdt de export dan al tegen, zodat het nooit zover
    // komt dat er een verzonnen code de deur uit gaat.
    tag('cbc:IdentificationCode', landcode(p.country) ?? 'NL'),
    '</cac:Country>',
    '</cac:PostalAddress>',
].filter(Boolean).join('');

/**
 * Waar en wanneer er geleverd is.
 *
 * De leverdatum (BT-72) gaat mee zodra die is ingevuld — die hoort ook op het
 * papier (art. 35a lid 1 Wet OB 1968), dus de twee zeggen hetzelfde. Bij een
 * intracommunautaire levering móet er een datum staan (BR-IC-11) en ook de
 * landcode van de bestemming (BR-IC-12); leeg laten betekent daar dat de
 * factuurdatum wordt genomen.
 *
 * Staat er niets in te vullen, dan blijft het hele blok weg: wat niets
 * toevoegt hoort niet in het bestand.
 */
const levering = (data: Invoice, scheme: VatScheme): string => {
    const datum = (data.deliveryDate || '').trim();
    if (!datum && scheme !== 'icp') return '';

    return [
        '<cac:Delivery>',
        // ActualDeliveryDate vóór DeliveryLocation: cac:Delivery is zelf ook
        // een vaste reeks.
        tag('cbc:ActualDeliveryDate', datum || data.date.trim()),
        scheme === 'icp'
            ? '<cac:DeliveryLocation><cac:Address><cac:Country>'
              + tag('cbc:IdentificationCode', landcode(data.client.country) ?? 'NL')
              + '</cac:Country></cac:Address></cac:DeliveryLocation>'
            : '',
        '</cac:Delivery>',
    ].filter(Boolean).join('');
};

/**
 * Of er in dit bestand géén enkel btw-identificatienummer mag staan.
 *
 * Dit is **BR-O-02**, en de reikwijdte ervan is ruimer dan hij klinkt: een
 * factuur met categorie O mag het nummer van de leverancier (BT-31), dat van
 * zijn fiscaal vertegenwoordiger (BT-63) *en* dat van de klant (BT-48) geen van
 * drieën bevatten.
 *
 * Opgemeten en niet beredeneerd. De eerste poging liet alleen dat van de
 * leverancier weg en werd nog steeds afgekeurd, omdat het nummer van de klant er
 * ook nog stond.
 *
 * Twee dingen die hierbij overeind blijven, allebei gecontroleerd met diezelfde
 * Schematron:
 *
 * - **BR-NL-1 blijft voldaan.** De leverancier is hier herkenbaar aan zijn
 *   KvK-nummer in `cac:PartyLegalEntity` en `cbc:EndpointID`, en dat is wat
 *   NLCIUS vraagt. Zonder die uitkomst was categorie O onbruikbaar geweest.
 * - **BR-O-11/12 kunnen hier niet afgaan.** Die verbieden categorie O naast een
 *   andere categorie op hetzelfde document, en het regime is per document en
 *   nooit per regel. Dat is dus al door de opzet gedekt.
 *
 * Hier wijken papier en bestand bewust van elkaar af: art. 35a lid 1 Wet OB wil
 * je btw-identificatienummer op de factuur, EN 16931 verbiedt het in de XML bij
 * deze categorie. Het staat dus wel op de PDF en niet in het e-factuurbestand.
 */
const zonderBtwNummers = (data: Invoice): boolean => buitenBereik(schemeOf(data));

const afzender = (data: Invoice): string => {
    const kvk = (data.sender.kvkNumber ?? '').trim();
    return [
        '<cac:AccountingSupplierParty><cac:Party>',
        tag('cbc:EndpointID', kvk, ` schemeID="${KVK_SCHEME_ID}"`),
        `<cac:PartyIdentification>${tag('cbc:ID', kvk, ` schemeID="${KVK_SCHEME_ID}"`)}</cac:PartyIdentification>`,
        `<cac:PartyName>${tag('cbc:Name', data.sender.name)}</cac:PartyName>`,
        adres(data.sender),
        // Weg bij categorie O; zie zonderBtwNummers hieronder. Op het papieren
        // document blijft het nummer wél staan, want art. 35a eist het daar.
        zonderBtwNummers(data)
            ? ''
            : '<cac:PartyTaxScheme>'
              + tag('cbc:CompanyID', (data.sender.vatNumber ?? '').replace(/\s+/g, ''))
              + `<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme>`
              + '</cac:PartyTaxScheme>',
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
        btw && !zonderBtwNummers(data)
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
const btwTotalen = (
    items: LineItem[],
    scheme: VatScheme,
    clientVat?: string,
    discount?: Discount,
    // De reden volgt de taal van het document, zodat papier en bestand dezelfde
    // zin dragen. Verder is het bestand taalonafhankelijk: UBL draagt codes.
    taal: Taal = 'nl',
): string => {
    const isVatExempt = !chargesVat(scheme);
    // De grondslag ná korting: wat hier staat moet overeenkomen met wat er
    // onderaan het papier staat, en met de AllowanceCharge hieronder.
    const { subtotal, discount: korting, vatBases, vatTotals } =
        summariseDocument(items, isVatExempt, discount);
    const belastbaar = roundToCents(subtotal - korting);

    if (isVatExempt) {
        // Eén groep: de hele grondslag, nul btw, de categorie van het regime en
        // de reden erbij. Dezelfde zin als op het papier, zodat de twee niet
        // uit elkaar lopen.
        // Let op BR-Z-10: bij categorie Z mág er geen reden staan. Dat raakt
        // alleen het ingetrokken `nultarief`-regime, dat nog voor bewaarde
        // documenten bestaat; een 0%-regel onder `normaal` loopt via de
        // tarievenlus hieronder en krijgt daar nooit een reden mee.
        const reden = VAT_SCHEMES[scheme].ublCategory === 'Z'
            ? ''
            : [statementFor(scheme, taal), clientVatStatement(scheme, clientVat, taal)]
                .filter(Boolean).join(' ');
        return [
            '<cac:TaxTotal>',
            tag('cbc:TaxAmount', bedrag(0), ' currencyID="EUR"'),
            '<cac:TaxSubtotal>',
            tag('cbc:TaxableAmount', bedrag(belastbaar), ' currencyID="EUR"'),
            tag('cbc:TaxAmount', bedrag(0), ' currencyID="EUR"'),
            '<cac:TaxCategory>',
            tag('cbc:ID', taxCategory(0, scheme)),
            // BR-O-05: bij categorie O mag er helemaal geen tarief staan, ook
            // geen 0.00. Bij elk ander vrijgesteld regime juist wel.
            buitenBereik(scheme) ? '' : tag('cbc:Percent', '0.00'),
            reden ? tag('cbc:TaxExemptionReason', reden) : '',
            `<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme>`,
            '</cac:TaxCategory>',
            '</cac:TaxSubtotal>',
            '</cac:TaxTotal>',
        ].filter(Boolean).join('');
    }

    // De grondslag per tarief komt uit summariseDocument en wordt hier niet
    // opnieuw uitgerekend: die heeft de korting al naar verhouding over de
    // tarieven verdeeld, en twee plekken die dezelfde verdeling doen is precies
    // hoe het papier en de XML uit elkaar gaan lopen.
    const grondslag = vatBases;

    const totaalBtw = Object.values(vatTotals).reduce((a, b) => a + b, 0);

    const groepen = Object.keys(grondslag)
        .map(Number)
        .sort((a, b) => b - a)
        .map((tarief) => [
            '<cac:TaxSubtotal>',
            tag('cbc:TaxableAmount', bedrag(grondslag[tarief]), ' currencyID="EUR"'),
            tag('cbc:TaxAmount', bedrag(vatTotals[tarief] ?? 0), ' currencyID="EUR"'),
            '<cac:TaxCategory>',
            tag('cbc:ID', taxCategory(tarief, 'normaal')),
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

/**
 * De korting, zoals EN 16931 hem wil zien.
 *
 * Niet één bedrag onderaan, maar **één AllowanceCharge per btw-categorie**. Dat
 * moet ook wel: een korting verlaagt de grondslag, en de ontvanger moet kunnen
 * narekenen welke grondslag bij welk tarief hoort. Staan er 21%- en 9%-regels
 * op, dan zijn het dus twee elementen.
 *
 * Het bedrag per tarief is het verschil tussen de grondslag vóór en ná korting,
 * en dat komt uit dezelfde verdeling als het papier gebruikt — zie
 * summariseDocument. Zelf opnieuw delen zou centen verschil opleveren, en dan
 * weigert de validator terecht.
 *
 * Plek in het schema: na PaymentTerms en vóór TaxTotal. UBL is een vaste reeks;
 * scripts/controleer-efactuur.mjs toetst die volgorde, want Schematron doet dat
 * niet.
 */
const kortingen = (items: LineItem[], scheme: VatScheme, discount?: Discount): string => {
    const isVatExempt = !chargesVat(scheme);
    const voor = summariseDocument(items, isVatExempt);
    const na = summariseDocument(items, isVatExempt, discount);
    if (na.discount <= 0) return '';

    return Object.keys(na.vatBases)
        .map(Number)
        .sort((a, b) => b - a)
        .map((tarief) => {
            const deel = roundToCents((voor.vatBases[tarief] ?? 0) - (na.vatBases[tarief] ?? 0));
            if (deel <= 0) return '';
            return [
                '<cac:AllowanceCharge>',
                // false = aftrek. true zou een toeslag zijn.
                tag('cbc:ChargeIndicator', 'false'),
                tag('cbc:AllowanceChargeReason', 'Korting'),
                tag('cbc:Amount', bedrag(deel), ' currencyID="EUR"'),
                '<cac:TaxCategory>',
                tag('cbc:ID', taxCategory(tarief, scheme)),
                buitenBereik(scheme) ? '' : tag('cbc:Percent', isVatExempt ? '0.00' : tarief.toFixed(2)),
                `<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme>`,
                '</cac:TaxCategory>',
                '</cac:AllowanceCharge>',
            ].join('');
        })
        .join('');
};

const regels = (items: LineItem[], scheme: VatScheme, vorm: Documentvorm): string => {
    const isVatExempt = !chargesVat(scheme);
    return items.map((item, i) => {
        const naam = item.name?.trim() || item.description.trim() || `Regel ${i + 1}`;
        return [
            `<${vorm.regel}>`,
            tag('cbc:ID', String(i + 1)),
            tag(vorm.aantal, String(item.quantity), ` unitCode="${unitCode(item.unit)}"`),
            tag('cbc:LineExtensionAmount', bedrag(lineTotal(item)), ' currencyID="EUR"'),
            '<cac:Item>',
            tag('cbc:Name', naam),
            // Alleen als hij iets toevoegt: tweemaal dezelfde tekst is ruis in
            // het systeem van de ontvanger.
            item.description.trim() && item.description.trim() !== naam
                ? tag('cbc:Description', item.description.trim())
                : '',
            '<cac:ClassifiedTaxCategory>',
            tag('cbc:ID', taxCategory(item.vatRate, scheme)),
            buitenBereik(scheme) ? '' : tag('cbc:Percent', isVatExempt ? '0.00' : item.vatRate.toFixed(2)),
            `<cac:TaxScheme>${tag('cbc:ID', 'VAT')}</cac:TaxScheme>`,
            '</cac:ClassifiedTaxCategory>',
            '</cac:Item>',
            `<cac:Price>${tag('cbc:PriceAmount', bedrag(item.unitPrice), ' currencyID="EUR"')}</cac:Price>`,
            `</${vorm.regel}>`,
        ].filter(Boolean).join('');
    }).join('');
};

/**
 * Bouwt de e-factuur.
 *
 * Geeft altijd geldige XML terug, ook als `ontbrekendeVelden` nog iets meldt —
 * het scherm houdt de knop tegen, deze functie niet. Zo blijft hij te testen met
 * minimale gegevens.
 */
export const buildUblInvoice = (data: Invoice): string => {
    const scheme = schemeOf(data);
    const vorm = data.creditOf ? CREDITNOTA : FACTUUR;
    const { subtotal, discount: korting, total } = summariseDocument(
        data.items, !chargesVat(scheme), data.discount,
    );

    const body = [
        tag('cbc:CustomizationID', CUSTOMIZATION_ID),
        tag('cbc:ProfileID', PROFILE_ID),
        tag('cbc:ID', data.invoiceNumber),
        tag('cbc:IssueDate', data.date),
        tag(vorm.typeCode, vorm.typeWaarde),
        data.notes?.trim() ? tag('cbc:Note', data.notes.trim()) : '',
        tag('cbc:DocumentCurrencyCode', 'EUR'),
        // De referentie waarmee je klant de factuur terugvindt in zijn eigen
        // administratie. NLCIUS wil deze of een opdrachtnummer.
        tag('cbc:BuyerReference', (data.buyerReference ?? '').trim()),
        // De factuur die wordt teruggedraaid. Verplicht bij een creditnota
        // (BR-55 wil een verwijzing naar het voorafgaande stuk), en in het
        // schema staat BillingReference hier: na BuyerReference en vóór de
        // partijen.
        //
        // Alleen het nummer: de datum van de oorspronkelijke factuur erbij
        // zetten wordt door BR-NL-24 afgeraden. Op het papier staat hij wel,
        // want daar moet de verwijzing voor een mens ondubbelzinnig zijn.
        data.creditOf
            ? '<cac:BillingReference><cac:InvoiceDocumentReference>'
              + tag('cbc:ID', data.creditOf.number)
              + '</cac:InvoiceDocumentReference></cac:BillingReference>'
            : '',
        afzender(data),
        ontvanger(data),
        // cac:Delivery staat in het schema tussen AccountingCustomerParty en
        // PaymentMeans; UBL is een vaste reeks, dus de plek is niet vrij.
        levering(data, scheme),
        betaling(data),
        // Vóór TaxTotal: UBL is een vaste reeks, dus de plek ligt vast.
        kortingen(data.items, scheme, data.discount),
        btwTotalen(data.items, scheme, data.client.vatNumber, data.discount, data.taal ?? 'nl'),
        '<cac:LegalMonetaryTotal>',
        // De som van de regels staat hier zónder korting (BR-CO-10); de korting
        // zit in AllowanceTotalAmount en gaat er bij TaxExclusiveAmount vanaf
        // (BR-CO-13). Zo kan de ontvanger de opstelling naspelen.
        tag('cbc:LineExtensionAmount', bedrag(subtotal), ' currencyID="EUR"'),
        tag('cbc:TaxExclusiveAmount', bedrag(roundToCents(subtotal - korting)), ' currencyID="EUR"'),
        tag('cbc:TaxInclusiveAmount', bedrag(total), ' currencyID="EUR"'),
        korting > 0 ? tag('cbc:AllowanceTotalAmount', bedrag(korting), ' currencyID="EUR"') : '',
        tag('cbc:PayableAmount', bedrag(total), ' currencyID="EUR"'),
        '</cac:LegalMonetaryTotal>',
        regels(data.items, scheme, vorm),
    ].filter(Boolean).join('');

    return '<?xml version="1.0" encoding="UTF-8"?>'
        + `<${vorm.wortel} xmlns="${vorm.naamruimte}"`
        + ' xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"'
        + ' xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
        + body
        + `</${vorm.wortel}>`;
};

/**
 * De bestandsnaam waaronder de e-factuur wordt aangeboden.
 *
 * Een creditnota heet ook zo: in een map met e-facturen wil je ze uit elkaar
 * kunnen houden zonder ze te openen.
 */
export const ublFilename = (data: Pick<Invoice, 'invoiceNumber' | 'creditOf'>): string => {
    const soort = data.creditOf ? 'ecreditfactuur' : 'efactuur';
    return `${soort}_${data.invoiceNumber.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xml`;
};

import { Taal } from "@/types";

/**
 * Wat er op het document staat, per taal.
 *
 * **De app blijft Nederlands.** Dit gaat alleen over het papier. De gebruiker is
 * een Nederlandse ondernemer en leest het formulier prima; zijn klant in
 * Stuttgart of Chicago leest "Wij verzoeken u vriendelijk het totale
 * factuurbedrag over te maken" niet. Drie van de zes btw-behandelingen bestaan
 * juist omdát die klant in het buitenland zit, dus dit hoorde erbij.
 *
 * De e-factuur raakt dit niet: UBL draagt categoriecodes en geen proza, dus
 * `lib/ubl.ts` levert in beide talen hetzelfde bestand op, op de
 * `TaxExemptionReason` na — die volgt het document, zodat papier en bestand
 * dezelfde zin dragen.
 *
 * Losse fragmenten en geen volzinnen voor de betaalalinea, omdat het voorbeeld
 * er `<strong>` doorheen zet en de PDF `styles.label`. Eén string zou in de ene
 * weergave opmaak verliezen die de andere wel heeft, en dan lopen de twee uit
 * elkaar — precies wat tests/pdf.spec.ts bewaakt.
 */
export interface DocumentTeksten {
    factuur: string;
    offerte: string;
    creditfactuur: string;

    datum: string;
    leverdatum: string;
    geldigTot: string;

    btw: string;
    kvk: string;
    email: string;

    /** De kop boven de klantgegevens. De PDF zet hem zelf in kapitalen. */
    offerteVoor: string;
    facturerenAan: string;

    kolomBeschrijving: string;
    kolomAantal: string;
    kolomPrijs: string;
    kolomBtw: string;
    kolomTotaal: string;
    /** Wat er staat als een regel geen naam heeft gekregen. */
    geenNaam: string;

    subtotaal: string;
    korting: string;
    /** "BTW (21%)" / "VAT (21%)". */
    btwRegel: (tarief: string) => string;
    totaal: string;
    teCrediteren: string;

    opmerkingen: string;
    betalingsvoorwaarden: string;
    /**
     * De betaaltermijn als zin. Dit is precies waarom hij een getal werd: als
     * vrije tekst stond hij in het Nederlands op een Engelse factuur.
     */
    betaaltermijn: (dagen: number) => string;

    /** De betaalalinea, in stukken; zie de opmerking bovenaan. */
    betaling: {
        verzoek: string;
        tenNameVan: string;
        vermeld: string;
        dank: string;
    };
    /** Op een creditfactuur gaat het geld de andere kant op. */
    creditFooter: string;
    qrBijschrift: { voorbeeld: string; pdf: string };

    /** "Creditfactuur bij factuur 2026-001 van 09-10-2026." */
    creditVerwijzing: (nummer: string, datum: string) => string;
    /** Het btw-nummer van de afnemer onder de vermelding. */
    btwNummerAfnemer: (nummer: string) => string;
}

export const TEKSTEN: Record<Taal, DocumentTeksten> = {
    nl: {
        factuur: 'FACTUUR',
        offerte: 'OFFERTE',
        creditfactuur: 'CREDITFACTUUR',

        datum: 'Datum',
        leverdatum: 'Datum levering/dienst',
        geldigTot: 'Geldig tot',

        btw: 'BTW',
        kvk: 'KvK',
        email: 'E-mail',

        offerteVoor: 'Offerte voor:',
        facturerenAan: 'Factureren aan:',

        kolomBeschrijving: 'Beschrijving',
        kolomAantal: 'Aantal',
        kolomPrijs: 'Prijs',
        kolomBtw: 'BTW',
        kolomTotaal: 'Totaal',
        geenNaam: 'Geen naam',

        subtotaal: 'Subtotaal',
        korting: 'Korting',
        btwRegel: (tarief) => `BTW (${tarief}%)`,
        totaal: 'Totaal',
        teCrediteren: 'Te crediteren',

        opmerkingen: 'Opmerkingen',
        betalingsvoorwaarden: 'Betalingsvoorwaarden',
        betaaltermijn: (dagen) => `Binnen ${dagen} ${dagen === 1 ? 'dag' : 'dagen'} na factuurdatum.`,

        betaling: {
            verzoek: 'Wij verzoeken u vriendelijk het totale factuurbedrag over te maken naar rekeningnummer',
            tenNameVan: 'ten name van',
            vermeld: 'Vermeld hierbij a.u.b. het factuurnummer:',
            dank: 'Hartelijk dank voor uw vertrouwen!',
        },
        creditFooter:
            'Dit bedrag wordt met u verrekend of aan u terugbetaald. Er hoeft naar aanleiding '
            + 'van deze creditfactuur niets te worden overgemaakt.',
        qrBijschrift: {
            voorbeeld:
                'Scan deze code met uw bankapp om de overschrijving ingevuld te krijgen. Werkt '
                + 'niet bij elke bank; de gegevens hierboven kunt u altijd overnemen.',
            pdf:
                'Scan met uw bankapp om de overschrijving ingevuld te krijgen. Werkt niet bij '
                + 'elke bank; de gegevens onderaan kunt u altijd overnemen.',
        },

        creditVerwijzing: (nummer, datum) => `Creditfactuur bij factuur ${nummer} van ${datum}.`,
        btwNummerAfnemer: (nummer) => `Btw-nummer afnemer: ${nummer}.`,
    },
    en: {
        factuur: 'INVOICE',
        offerte: 'QUOTATION',
        creditfactuur: 'CREDIT NOTE',

        datum: 'Date',
        leverdatum: 'Date of supply',
        geldigTot: 'Valid until',

        btw: 'VAT',
        // Voluit en niet "CoC": die afkorting kent niemand buiten Nederland,
        // en dit nummer is juist bedoeld om na te trekken.
        kvk: 'Chamber of Commerce',

        offerteVoor: 'Quotation for:',
        facturerenAan: 'Bill to:',
        email: 'E-mail',

        kolomBeschrijving: 'Description',
        kolomAantal: 'Quantity',
        kolomPrijs: 'Price',
        kolomBtw: 'VAT',
        kolomTotaal: 'Total',
        geenNaam: 'Unnamed item',

        subtotaal: 'Subtotal',
        korting: 'Discount',
        btwRegel: (tarief) => `VAT (${tarief}%)`,
        totaal: 'Total',
        teCrediteren: 'To be credited',

        opmerkingen: 'Notes',
        betalingsvoorwaarden: 'Payment terms',
        betaaltermijn: (dagen) => `Payable within ${dagen} ${dagen === 1 ? 'day' : 'days'} of the invoice date.`,

        betaling: {
            verzoek: 'Please transfer the total invoice amount to account number',
            tenNameVan: 'held by',
            vermeld: 'Please quote the invoice number:',
            dank: 'Thank you for your business!',
        },
        creditFooter:
            'This amount will be settled with you or refunded. No payment is required in '
            + 'response to this credit note.',
        qrBijschrift: {
            voorbeeld:
                'Scan this code with your banking app to prefill the transfer. Not supported by '
                + 'every bank; you can always use the details above.',
            pdf:
                'Scan with your banking app to prefill the transfer. Not supported by every '
                + 'bank; you can always use the details below.',
        },

        creditVerwijzing: (nummer, datum) => `Credit note for invoice ${nummer} dated ${datum}.`,
        btwNummerAfnemer: (nummer) => `Customer's VAT number: ${nummer}.`,
    },
};

export const teksten = (taal: Taal = 'nl'): DocumentTeksten => TEKSTEN[taal] ?? TEKSTEN.nl;

/** Wat er in de keuzelijst staat. De app zelf blijft Nederlands. */
export const TAAL_NAMEN: Record<Taal, string> = {
    nl: 'Nederlands',
    en: 'Engels',
};

export const TAAL_ORDER: Taal[] = ['nl', 'en'];

/**
 * De maandafkortingen voor een Engelstalige datum.
 *
 * Met de hand en niet met Intl. `en-GB` maakt van september "Sept" en `en-US`
 * zet de maand voorop, en welke van de twee je krijgt hangt af van de
 * ICU-versie van de omgeving. Het voorbeeld draait in de browser en de PDF in
 * dezelfde browser maar via een andere weg; tests/pdf.spec.ts legt die twee
 * naast elkaar en zou op zo'n verschil omvallen. Een vaste tabel is
 * voorspelbaar, en dat is hier meer waard dan lokalisatie.
 */
const MAANDEN_EN = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * De datum zoals hij op het document komt.
 *
 * Nederlands is 09-10-2026. Engels is "9 Oct 2026" en met opzet niet 10/09/2026
 * of 09/10/2026: dat eerste leest een Amerikaan als 9 september en dat tweede
 * leest een Nederlander als 9 oktober. Op een factuur met een betaaltermijn is
 * dat geen detail.
 */
export const datumInTaal = (isoDatum: string, taal: Taal = 'nl'): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDatum);
    if (!match) return isoDatum;
    const [, jaar, maand, dag] = match;
    if (taal !== 'en') return `${dag}-${maand}-${jaar}`;
    const naam = MAANDEN_EN[Number(maand) - 1];
    return naam ? `${Number(dag)} ${naam} ${jaar}` : `${dag}-${maand}-${jaar}`;
};

/**
 * Het bedrag zoals het op het document komt.
 *
 * Nederlands: € 1.234,56. Engels: €1,234.56. Dat verschil is geen smaak maar
 * een leesfout die je anders uitlokt: wie "€ 1.234,56" gewend is als
 * Engelstalige leest daar duizend keer te weinig. De euro blijft, want de app
 * rekent alleen in euro's.
 *
 * en-IE en niet en-US of en-GB: Ierland is het Engelstalige euroland, dus daar
 * is deze notatie thuis.
 */
export const bedragInTaal = (bedrag: number, taal: Taal = 'nl'): string =>
    new Intl.NumberFormat(taal === 'en' ? 'en-IE' : 'nl-NL', {
        style: 'currency',
        currency: 'EUR',
    }).format(bedrag);

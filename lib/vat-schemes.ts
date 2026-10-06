import { Invoice, Quotation, VatScheme } from "@/types";

/**
 * De btw-behandeling van een document.
 *
 * Deze app bood eerder alleen "wel btw" of "vrijgesteld (KOR)", plus een
 * 0%-tarief per regel zonder dat ergens stond *waarom* het 0% was. Dat is op
 * twee manieren te kort:
 *
 * - **Op papier.** Bij een verlegde factuur, een intracommunautaire levering of
 *   uitvoer moet op de factuur staan waarom er geen btw wordt gerekend. Een
 *   factuur met alleen "BTW (0%): € 0,00" zegt dat niet.
 * - **In de e-factuur.** 0% is in UBL niet één categorie. Een
 *   intracommunautaire levering is K, uitvoer is G, een verlegde factuur is AE,
 *   en alleen een echt nultarief is Z. Alles als Z wegschrijven vertelt het
 *   grootboek van de ontvanger iets anders dan wat er gebeurd is — en de
 *   officiële validator merkt dat niet, want Z is op zichzelf geldig.
 *
 * ## Waarom per document en niet per regel
 *
 * Deze keuzes volgen uit *wie je klant is en waar hij zit*, niet uit wat je
 * hem levert: een afnemer met een EU-btw-nummer, een afnemer buiten de EU, een
 * sector waarvoor de verleggingsregeling geldt. Een factuur die voor de helft
 * intracommunautair is en voor de helft met 21% btw bestaat in de praktijk niet.
 *
 * ## Eén weergaveregel
 *
 * Alle regimes behalve `normaal` zien er op het document hetzelfde uit: regels
 * exclusief btw, geen btw-bedragen, totaal gelijk aan het subtotaal, plus de
 * zin die erbij hoort. Daardoor blijft `summariseDocument` ongewijzigd — het
 * enige dat verschilt is de zin en de UBL-categorie.
 *
 * ## Let op de tekst
 *
 * De zinnen hieronder zijn de gangbare formuleringen. Bewust staan er geen
 * artikelnummers in die ik niet met zekerheid ken: een verzonnen verwijzing is
 * erger dan geen verwijzing. Voor KOR staat de verwijzing er wel, die is
 * vastgesteld. Wie een specifiekere vermelding nodig heeft, zet die erbij in
 * Opmerkingen.
 */
export type { VatScheme };

export interface VatSchemeInfo {
    /** Wat er in de keuzelijst staat. */
    label: string;
    /** Korte toelichting onder de keuze, zodat je weet wanneer je dit kiest. */
    hint: string;
    /** De vermelding op het document. Leeg bij `normaal`. */
    statement: string;
    /** De UBL-categorie (EN 16931). Null bij `normaal`: die volgt het tarief per regel. */
    ublCategory: 'E' | 'AE' | 'K' | 'G' | 'Z' | null;
    /**
     * Of het btw-nummer van de klant verplicht is. Bij een verlegde factuur en
     * een intracommunautaire levering wel — zowel de wet als de e-factuurregels
     * (BR-AE-*, BR-IC-*) eisen het, want zonder dat nummer kan de ontvanger de
     * btw niet aangeven.
     */
    requiresClientVat: boolean;
}

export const VAT_SCHEMES: Record<VatScheme, VatSchemeInfo> = {
    normaal: {
        label: 'Normaal — btw volgens het tarief per regel',
        hint: 'De gewone situatie: 21% of 9% per regel, of 0% als dat het juiste tarief is.',
        statement: '',
        ublCategory: null,
        requiresClientVat: false,
    },
    kor: {
        label: 'Kleineondernemersregeling (KOR) — vrijgesteld van btw',
        hint: 'Je bent aangemeld voor de KOR. Er mag dan geen btw op de factuur staan.',
        statement:
            'Vrijgesteld van btw op grond van de kleineondernemersregeling (art. 25 Wet OB 1968).',
        ublCategory: 'E',
        requiresClientVat: false,
    },
    verlegd: {
        label: 'Btw verlegd naar de afnemer',
        hint: 'De verleggingsregeling, bijvoorbeeld bij onderaanneming in de bouw of bij uitlenen van personeel. Je klant draagt de btw af.',
        statement: 'Btw verlegd naar de afnemer. Verleggingsregeling van toepassing.',
        ublCategory: 'AE',
        requiresClientVat: true,
    },
    icp: {
        label: 'Intracommunautaire levering — 0% btw',
        hint: 'Levering aan een ondernemer in een ander EU-land met een geldig btw-nummer. Je klant geeft de btw in zijn eigen land aan.',
        statement: 'Intracommunautaire levering, 0% btw.',
        ublCategory: 'K',
        requiresClientVat: true,
    },
    export: {
        label: 'Uitvoer buiten de EU — 0% btw',
        hint: 'Levering aan een klant buiten de Europese Unie.',
        statement: 'Uitvoer buiten de EU, 0% btw.',
        ublCategory: 'G',
        requiresClientVat: false,
    },
    /**
     * Niet meer te kiezen, en met opzet nog aanwezig.
     *
     * Dit regime was er even, en het was verkeerd bedacht. Een echt nultarief
     * is geen vrijstelling: de wet wil dan juist dát het tarief en het bedrag
     * op de factuur staan, en dit regime verborg ze. Precies de informatie die
     * `normaal` met een regel op 0% wél toont — met dezelfde UBL-categorie Z,
     * want die volgt daar het tarief van de regel. De gevallen waar wél een
     * vermelding bij hoort (verlegging, intracommunautair, uitvoer) hebben hun
     * eigen regime hierboven, dus er bleef niets over om te dekken.
     *
     * Het staat er nog omdat een bewaard document deze waarde kan hebben, en
     * een uitgereikt document moet blijven renderen zoals het is uitgereikt —
     * dezelfde reden dat `isVatExempt` nog bestaat. Nieuwe documenten kunnen
     * het niet krijgen: het staat niet in VAT_SCHEME_ORDER.
     */
    nultarief: {
        label: 'Nultarief — 0% btw om een andere reden',
        hint: 'Niet meer te kiezen; gebruik het gewone regime met 0% per regel.',
        statement: '0% btw.',
        ublCategory: 'Z',
        requiresClientVat: false,
    },
};

/** Wat er in de keuzelijst staat, in deze volgorde. */
export const VAT_SCHEME_ORDER: VatScheme[] = ['normaal', 'kor', 'verlegd', 'icp', 'export'];

/**
 * Het regime van een document, ook als het van vóór deze keuze is.
 *
 * Bewaarde documenten staan vast en worden nooit herschreven, dus er liggen
 * records met alleen het oude `isVatExempt`. Die blijven zo gewoon leesbaar; de
 * migratie zit hier en niet in de opslag.
 */
export const schemeOf = (data: Pick<Invoice | Quotation, 'vatScheme' | 'isVatExempt'>): VatScheme => {
    // Een geïmporteerd bestand mag hier alles in gezet hebben, en een regime dat
    // ooit verdwijnt mag de app niet laten omvallen op een ontbrekende tabelrij.
    if (data.vatScheme && data.vatScheme in VAT_SCHEMES) return data.vatScheme;
    return data.isVatExempt ? 'kor' : 'normaal';
};

/** Of er btw berekend en vermeld wordt. Alleen bij het gewone regime. */
export const chargesVat = (scheme: VatScheme): boolean => scheme === 'normaal';

/** De vermelding die op het document hoort, of null als er geen nodig is. */
export const statementFor = (scheme: VatScheme): string | null =>
    VAT_SCHEMES[scheme].statement || null;

/**
 * De aanvulling met het btw-nummer van de afnemer.
 *
 * Bij verlegging en een intracommunautaire levering hoort dat nummer op de
 * factuur: daarmee geeft de afnemer de btw aan. Staat het er niet, dan valt
 * hier niets te melden — verzinnen kan niet. Het formulier waarschuwt, en de
 * e-factuur weigert; zie `ontbrekendeVelden` in lib/ubl.ts.
 */
export const clientVatStatement = (scheme: VatScheme, clientVat?: string): string | null =>
    VAT_SCHEMES[scheme].requiresClientVat && clientVat?.trim()
        ? `Btw-nummer afnemer: ${clientVat.trim()}.`
        : null;

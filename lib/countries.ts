/**
 * Landnamen naar ISO 3166-1 alpha-2, en wie er in de EU zit.
 *
 * Het landveld in het formulier is vrije tekst, met als afspraak dat leeg
 * "Nederland" betekent — vandaar de hint "alleen invullen bij buitenlandse
 * klanten". Voor een e-factuur moet daar een landcode van staan, en EN 16931
 * maakt die verplicht voor zowel de afzender als de ontvanger.
 *
 * Eerder viel alles wat niet "Nederland" of al een tweeletterige code was,
 * terug op NL. Daarmee kreeg een klant in België de code NL mee: niet alleen
 * verkeerd bij een intracommunautaire levering, maar op elke factuur.
 *
 * Wat hier niet in staat wordt niet geraden. Een verkeerde landcode is erger
 * dan een geweigerde export, dus `ontbrekendeVelden` in lib/ubl.ts meldt het
 * en de gebruiker vult een code in.
 */

/** De EU-lidstaten. Nodig om te zien of een intracommunautaire levering kan. */
export const EU_LANDEN = new Set([
    'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR',
    'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO',
    'SE', 'SI', 'SK',
]);

/**
 * Nederlandse en Engelse namen van de landen waar een Nederlandse kleine
 * ondernemer realistisch naar factureert: de EU plus de buurlanden en een paar
 * veelvoorkomende bestemmingen erbuiten.
 */
const NAMEN: Record<string, string> = {
    nederland: 'NL', netherlands: 'NL', 'the netherlands': 'NL', holland: 'NL',
    belgie: 'BE', belgië: 'BE', belgium: 'BE',
    duitsland: 'DE', germany: 'DE', deutschland: 'DE',
    frankrijk: 'FR', france: 'FR',
    luxemburg: 'LU', luxembourg: 'LU',
    oostenrijk: 'AT', austria: 'AT',
    spanje: 'ES', spain: 'ES',
    italie: 'IT', italië: 'IT', italy: 'IT',
    portugal: 'PT',
    ierland: 'IE', ireland: 'IE',
    denemarken: 'DK', denmark: 'DK',
    zweden: 'SE', sweden: 'SE',
    finland: 'FI',
    polen: 'PL', poland: 'PL',
    tsjechie: 'CZ', tsjechië: 'CZ', 'czech republic': 'CZ', czechia: 'CZ',
    slowakije: 'SK', slovakia: 'SK',
    slovenie: 'SI', slovenië: 'SI', slovenia: 'SI',
    hongarije: 'HU', hungary: 'HU',
    roemenie: 'RO', roemenië: 'RO', romania: 'RO',
    bulgarije: 'BG', bulgaria: 'BG',
    kroatie: 'HR', kroatië: 'HR', croatia: 'HR',
    griekenland: 'GR', greece: 'GR',
    estland: 'EE', estonia: 'EE',
    letland: 'LV', latvia: 'LV',
    litouwen: 'LT', lithuania: 'LT',
    cyprus: 'CY',
    malta: 'MT',
    // Buiten de EU, veelvoorkomend.
    'verenigd koninkrijk': 'GB', engeland: 'GB', 'united kingdom': 'GB', uk: 'GB',
    zwitserland: 'CH', switzerland: 'CH',
    noorwegen: 'NO', norway: 'NO',
    'verenigde staten': 'US', 'united states': 'US', usa: 'US', amerika: 'US',
    canada: 'CA',
    turkije: 'TR', turkey: 'TR',
};

/**
 * De landcode voor wat iemand heeft ingetypt.
 *
 * Leeg betekent Nederland, want dat is wat het formulier afspreekt. Twee
 * letters worden overgenomen. Een naam die we kennen wordt omgezet. De rest
 * geeft null: dan weten we het niet, en raden we niet.
 */
export const landcode = (vrijeTekst?: string): string | null => {
    const tekst = (vrijeTekst ?? '').trim();
    if (!tekst) return 'NL';
    if (/^[A-Za-z]{2}$/.test(tekst)) return tekst.toUpperCase();
    return NAMEN[tekst.toLowerCase()] ?? null;
};

export const isEuLand = (code: string | null): boolean => !!code && EU_LANDEN.has(code);

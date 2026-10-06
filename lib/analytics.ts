/**
 * Bezoekersaantallen via GoatCounter, met een telpixel in plaats van hun script.
 *
 * ## Waarom geen count.js
 *
 * GoatCounter levert een scriptje dat je in je pagina zet. Dat werkt prima en
 * het is nog privacyvriendelijk ook — maar niet hier. Deze pagina houdt
 * ontsleutelde klantgegevens vast, en zolang het archief open staat ook de
 * sleutel in het geheugen. SecurityPanel.tsx vertelt gebruikers met zoveel
 * woorden dat alles wat in deze pagina draait daarbij kan. Dan is er geen
 * verdedigbare reden om er andermans script bij te zetten.
 *
 * Een afbeelding kan niets lezen. Daarom bouwen we de telpixel zelf: het
 * beveiligingsbeleid hoeft alleen `img-src` open te zetten voor één host,
 * terwijl `script-src` en `connect-src` dicht blijven zoals ze waren.
 *
 * De referrer en de schermgrootte vult GoatCounters eigen script normaal in;
 * die zetten we hier zelf in de URL, zodat de pixel evenveel zegt als het
 * script zonder dat er code van buiten draait.
 *
 * ## Wat er wel en niet verstuurd wordt
 *
 * Wel: het pad van de pagina, waar je vandaan kwam en je schermformaat. Dat
 * gaat over het bezoek, niet over het document. Niet: iets wat je intypt —
 * geen klantnaam, geen bedrag, geen factuurnummer. Dat kan ook niet, want deze
 * functie krijgt het document niet te zien.
 *
 * ## Uit, tenzij
 *
 * Zonder NEXT_PUBLIC_GOATCOUNTER gebeurt er niets: geen pixel, en het
 * beveiligingsbeleid blijft dicht. Zo blijven de ontwikkelserver en de
 * testsuite precies zoals ze waren, en staat het alleen aan in de gepubliceerde
 * versie waar de variabele gezet is.
 */

/** De code van de GoatCounter-site, zonder `.goatcounter.com`. */
export const GOATCOUNTER_CODE = (process.env.NEXT_PUBLIC_GOATCOUNTER ?? '').trim();

/** De host waar de pixel heen gaat, of null als tellen uitstaat. */
export const analyticsHost = (): string | null =>
    GOATCOUNTER_CODE ? `https://${GOATCOUNTER_CODE}.goatcounter.com` : null;

/**
 * Of deze bezoeker geteld wil worden.
 *
 * Do Not Track en Global Privacy Control zijn allebei een uitgesproken "nee".
 * Ze afdwingen hoeft niet van de wet, maar een app die privacy als uitgangspunt
 * neemt en dat signaal dan negeert, meent het niet.
 */
export const wilGeteldWorden = (nav: Navigator): boolean => {
    const dnt = (nav as Navigator & { doNotTrack?: string }).doNotTrack;
    const gpc = (nav as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
    if (dnt === '1' || gpc === true) return false;

    // Een bestuurde browser is geen bezoeker. Zonder dit telt elke CI-draai mee
    // — de publicatiecontrole en de UAT-reis openen de gepubliceerde build een
    // paar keer per commit, en dat zou de cijfers onbruikbaar maken.
    return nav.webdriver !== true;
};

/**
 * De URL van de telpixel, of null als er niet geteld wordt.
 *
 * Apart van het aanroepen gehouden zodat een test kan nagaan wat er precies in
 * staat — en vooral wat er niet in staat.
 */
export const telpixelUrl = (
    locatie: { pathname: string; search: string },
    referrer: string,
    scherm: { width: number; height: number; pixelRatio: number },
): string | null => {
    const host = analyticsHost();
    if (!host) return null;

    const parameters = new URLSearchParams({
        p: locatie.pathname,
        // Alleen de herkomst, niet de hele verwijzende URL met zijn eigen
        // queryparameters: daar kan van alles in staan dat ons niets aangaat.
        r: herkomst(referrer),
        s: `${scherm.width},${scherm.height},${scherm.pixelRatio}`,
        // GoatCounter negeert deze; hij staat er tegen tussenliggende caches.
        rnd: Math.random().toString(36).slice(2, 10),
    });
    return `${host}/count?${parameters}`;
};

/** Van een verwijzende URL alleen de host, of leeg als er geen is. */
const herkomst = (referrer: string): string => {
    if (!referrer) return '';
    try {
        return new URL(referrer).host;
    } catch {
        return '';
    }
};

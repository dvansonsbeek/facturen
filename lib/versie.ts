/**
 * Welke versie van de app je draait, en of hij sinds je vorige bezoek veranderd is.
 *
 * Nodig sinds de app offline werkt. Online haalt de service worker altijd de
 * nieuwste versie op — zo bereikt een herstelde fout iedereen, en dat weegt hier
 * zwaar: een factuurprogramma dat blijft hangen op een oude versie blijft
 * verkeerde facturen maken nadat de fout al verholpen is.
 *
 * Maar stilletjes veranderen onder iemands handen hoort er niet bij. "Je hebt
 * deze versie" is alleen waar als je het merkt wanneer dat niet meer zo is.
 * Vandaar deze melding: eenmalig, als de bouwdatum anders is dan die van je
 * vorige bezoek.
 *
 * Dezelfde vorm als de andere opslagen (subscribe / read / readServer), en om
 * dezelfde reden: readVersie geeft steeds dezelfde waarde terug zolang er niets
 * verandert, en readServerVersie geeft null — de server weet niet wat jij de
 * vorige keer zag, dus zonder dat zou de hydratatie niet kloppen.
 */

const SLEUTEL = 'facturen.laatstGezienVersie';

/** De bouwdatum als ISO-dag, gezet in next.config.ts. Leeg als die ontbreekt. */
export const BOUWVERSIE = (process.env.NEXT_PUBLIC_BOUWDATUM ?? '').trim();

/** Een ISO-dag als 7-10-2026; leeg of onbruikbaar wordt een nette tekst. */
export const alsDatum = (iso: string): string => {
    const delen = iso.split('-');
    if (delen.length !== 3) return 'onbekende datum';
    const [jaar, maand, dag] = delen;
    return `${Number(dag)}-${maand}-${jaar}`;
};

/** De vorige versie, maar alleen als die anders was dan deze. */
let vorige: string | null = null;
let bepaald = false;
const luisteraars = new Set<() => void>();

/**
 * Leest één keer uit wat je de vorige keer zag en legt meteen deze versie vast.
 *
 * Meteen vastleggen en niet pas bij het sluiten: de melding hoort één keer te
 * komen. Wie de pagina herlaadt heeft hem gezien.
 */
const bepaal = () => {
    if (bepaald) return;
    bepaald = true;
    if (!BOUWVERSIE) return;

    try {
        const gezien = localStorage.getItem(SLEUTEL);
        // Geen melding bij een eerste bezoek: er is dan niets veranderd, je
        // begint gewoon.
        if (gezien && gezien !== BOUWVERSIE) vorige = gezien;
        localStorage.setItem(SLEUTEL, BOUWVERSIE);
    } catch {
        // Geen opslag (privémodus): dan melden we niets. Een melding die elke
        // keer terugkomt is erger dan geen melding.
        vorige = null;
    }
    luisteraars.forEach((luisteraar) => luisteraar());
};

export const subscribeVersie = (onStoreChange: () => void) => {
    luisteraars.add(onStoreChange);
    bepaal();
    return () => {
        luisteraars.delete(onStoreChange);
    };
};

export const readVersie = (): string | null => vorige;

/** De server weet niet wat jij de vorige keer zag; die meldt dus niets. */
export const readServerVersie = (): string | null => null;

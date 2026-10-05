import {
    leidSleutelAf, nieuweKop, ontsleutel, versleutel,
    type SleutelKop, type Versleuteld,
} from "@/lib/crypto";
import { KLUIS, metWinkel, opslagWerkt } from "@/lib/idb";

/**
 * De wachtwoordzin en de sleutel die eruit volgt.
 *
 * Eén zin voor alles wat versleuteld is, en dus één plek die de sleutel kent.
 * Welke opslagen meedoen staat hier niet: die melden zich aan met
 * `doeMee`, en deze module zegt ze wanneer ze moeten herschrijven, herladen of
 * dichtgaan. Zonder die omkering zou de kluis het klantenboek en het archief
 * moeten kennen, en zouden die twee elkaar via de kluis gaan importeren.
 *
 * Wat versleuteling wel en niet beschermt staat in lib/crypto.ts; die uitleg
 * hoort bij de keuzes daar en wordt in het scherm herhaald voor de gebruiker.
 */
const KLUIS_ID = 'sleutel';

/** Een bekende tekst, versleuteld bewaard, om te zien of de zin klopt. */
const PROEFTEKST = 'facturen-sleutelproef';

export interface KluisRecord {
    id: string;
    kop: SleutelKop;
    proef: Versleuteld;
}

export interface KluisStand {
    /** Of er een wachtwoordzin is ingesteld. */
    ingesteld: boolean;
    /** Ingesteld, maar in deze sessie nog niet ingevoerd. */
    vergrendeld: boolean;
    /** Onwaar als de browser geen opslagruimte geeft. */
    opslagWerkt: boolean;
}

/**
 * Een opslag die meedoet met de wachtwoordzin.
 *
 * `herschrijf` zet alles wat er al staat om naar de nieuwe sleutel, `herlaad`
 * leest en ontsleutelt na het ontgrendelen, en `sluit` vergeet wat er in het
 * geheugen staat. Alle drie worden ook aangeroepen als er niets te doen is;
 * ze horen dus veilig te zijn om twee keer te doen.
 */
export interface Kluisgebruiker {
    herschrijf: () => Promise<void>;
    herlaad: () => Promise<void>;
    sluit: () => void;
}

const gebruikers = new Set<Kluisgebruiker>();
export const doeMee = (gebruiker: Kluisgebruiker) => {
    gebruikers.add(gebruiker);
};

const listeners = new Set<() => void>();
const meld = () => listeners.forEach((listener) => listener());

export const subscribeKluis = (onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
        listeners.delete(onStoreChange);
    };
};

/**
 * De sleutel staat alleen hier, in het geheugen van deze pagina, en is
 * extractable: false. Na herladen is hij weg en voer je de zin opnieuw in. Hem
 * bewaren zou de versleuteling zinloos maken — dan kan iedereen met toegang
 * tot dit apparaat er weer bij.
 */
let sleutel: CryptoKey | null = null;
let kop: SleutelKop | null = null;

export const huidigeSleutel = () => sleutel;
export const huidigeKop = () => kop;

/** Eén vaste referentie per stand, vanwege useSyncExternalStore. */
const STAND_STANDAARD: KluisStand = Object.freeze({
    ingesteld: false, vergrendeld: false, opslagWerkt: true,
});
let standCache: KluisStand = STAND_STANDAARD;

const verversStand = () => {
    const volgende: KluisStand = {
        ingesteld: kop !== null,
        vergrendeld: kop !== null && sleutel === null,
        opslagWerkt: opslagWerkt(),
    };
    if (volgende.ingesteld !== standCache.ingesteld
        || volgende.vergrendeld !== standCache.vergrendeld
        || volgende.opslagWerkt !== standCache.opslagWerkt) {
        standCache = Object.freeze(volgende);
    }
};

export const readKluis = (): KluisStand => standCache;
export const readServerKluis = (): KluisStand => STAND_STANDAARD;

/**
 * Of er een zin is ingesteld, voorzover we dat weten.
 *
 * De kop komt asynchroon uit IndexedDB, dus vlak na het laden is dit nog
 * onwaar. Opslagen die zelf aan de vorm van hun gegevens kunnen zien dat ze
 * versleuteld zijn — zoals het klantenboek — moeten daar niet op wachten.
 */
export const isIngesteld = () => kop !== null;
export const isVergrendeld = () => kop !== null && sleutel === null;

let geladen = false;
let aanHetLaden: Promise<void> | null = null;

const leesKop = async () => {
    try {
        const record = await metWinkel<KluisRecord | undefined>(
            KLUIS, 'readonly', (winkel) => winkel.get(KLUIS_ID),
        );
        kop = record?.kop ?? null;
    } catch {
        kop = null;
    }
    geladen = true;
    verversStand();
    meld();
};

/** Leest de kop één keer in; opslagen roepen dit aan bij hun eigen eerste lading. */
export const zorgDatKluisGeladenIs = (): Promise<void> => {
    if (geladen) return Promise.resolve();
    if (!aanHetLaden) {
        aanHetLaden = leesKop().finally(() => {
            aanHetLaden = null;
        });
    }
    return aanHetLaden;
};

/**
 * Zet een wachtwoordzin, en laat alle meedoende opslagen zich opnieuw
 * wegschrijven.
 *
 * Eerst omzetten, dan pas de kop vastleggen: breekt het halverwege af, dan
 * staat er geen kop en is wat er omgezet is nog te lezen met de sleutel die
 * nog in het geheugen zit. Omgekeerd zou er een kop staan bij deels onversleutelde
 * gegevens.
 */
export const stelIn = async (zin: string): Promise<boolean> => {
    if (isVergrendeld()) return false;

    try {
        const nieuwe = nieuweKop();
        const nieuweSleutel = await leidSleutelAf(zin, nieuwe);
        const proef = await versleutel(nieuweSleutel, PROEFTEKST);

        sleutel = nieuweSleutel;
        for (const gebruiker of gebruikers) await gebruiker.herschrijf();

        await metWinkel(KLUIS, 'readwrite', (winkel) => winkel.put(
            { id: KLUIS_ID, kop: nieuwe, proef } satisfies KluisRecord,
        ));
        kop = nieuwe;
    } catch {
        sleutel = null;
        verversStand();
        meld();
        return false;
    }

    verversStand();
    meld();
    return true;
};

/** Ontgrendelt met de wachtwoordzin. Onwaar bij een verkeerde zin. */
export const ontgrendel = async (zin: string): Promise<boolean> => {
    await zorgDatKluisGeladenIs();
    if (!kop) return false;

    try {
        const kandidaat = await leidSleutelAf(zin, kop);
        const record = await metWinkel<KluisRecord | undefined>(
            KLUIS, 'readonly', (winkel) => winkel.get(KLUIS_ID),
        );
        if (!record) return false;

        // De proef zegt of de zin klopt zonder dat we gegevens hoeven te raken,
        // en voorkomt dat een verkeerde zin half ontsleutelde rommel oplevert.
        if (await ontsleutel<string>(kandidaat, record.proef) !== PROEFTEKST) return false;

        sleutel = kandidaat;
        for (const gebruiker of gebruikers) await gebruiker.herlaad();
    } catch {
        return false;
    }

    verversStand();
    meld();
    return true;
};

/** Vergeet de sleutel weer; alles wat versleuteld is, is daarna onleesbaar. */
export const vergrendel = () => {
    if (!kop) return;
    sleutel = null;
    for (const gebruiker of gebruikers) gebruiker.sluit();
    verversStand();
    meld();
};

/** Haalt de versleuteling eraf en schrijft alles leesbaar terug. */
export const verwijderZin = async (): Promise<boolean> => {
    if (!kop || !sleutel) return false;
    try {
        // Eerst de sleutel laten vallen, dan herschrijven: de opslagen kijken
        // naar huidigeSleutel() om te bepalen of ze versleutelen.
        sleutel = null;
        for (const gebruiker of gebruikers) await gebruiker.herschrijf();
        await metWinkel(KLUIS, 'readwrite', (winkel) => winkel.delete(KLUIS_ID));
    } catch {
        return false;
    }
    kop = null;
    verversStand();
    meld();
    return true;
};

/**
 * Voor Export: de kop en de proef, zodat een geïmporteerd bestand met dezelfde
 * zin te openen is. Geen van beide is geheim — een zout en een versleutelde
 * bekende tekst — en zonder ze is een versleutelde reservekopie waardeloos.
 */
export const exportKluis = async (): Promise<KluisRecord | null> => {
    try {
        return (await metWinkel<KluisRecord | undefined>(
            KLUIS, 'readonly', (winkel) => winkel.get(KLUIS_ID),
        )) ?? null;
    } catch {
        return null;
    }
};

/**
 * Voor Import: neemt de kluis van het bestand over.
 *
 * De sleutel van deze sessie hoort daar niet bij, dus die valt weg: na een
 * import met een eigen kluis is alles vergrendeld tot de zin van dat bestand
 * is ingevoerd.
 */
export const importKluis = async (record: KluisRecord): Promise<boolean> => {
    try {
        await metWinkel(KLUIS, 'readwrite', (winkel) => winkel.put({ ...record, id: KLUIS_ID }));
    } catch {
        return false;
    }
    sleutel = null;
    kop = record.kop;
    geladen = true;
    verversStand();
    meld();
    return true;
};

/** Na Wissen: geen kop, geen sleutel, niets meer vergrendeld. */
export const vergeetKluis = async () => {
    try {
        await metWinkel(KLUIS, 'readwrite', (winkel) => winkel.clear());
    } catch {
        // niets te wissen
    }
    sleutel = null;
    kop = null;
    geladen = true;
    verversStand();
    meld();
};

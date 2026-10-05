import { Client } from "@/types";
import { generateId } from "@/lib/utils";
import { isVersleuteld, ontsleutel, versleutel, type Versleuteld } from "@/lib/crypto";
import { doeMee, huidigeSleutel } from "@/lib/vault";

/**
 * Het klantenboek: de klanten die je bewaart om ze niet elke keer opnieuw te
 * hoeven typen. Staat in localStorage, op dit apparaat.
 *
 * Let op het onderscheid: dit boek is van jou, maar de klant *op een document*
 * is een kopie die je eruit kiest. Een adres dat je voor één factuur aanpast
 * verandert de bewaarde klant dus niet; daar is Opslaan voor.
 *
 * **Dit boek doet mee met de wachtwoordzin.** Het bevat namen en adressen van
 * anderen — persoonsgegevens van derden — en dat is precies waar het om gaat
 * als er iemand anders bij dit apparaat kan. Je eigen bedrijfsgegevens en je
 * factuurnummers blijven wel leesbaar: die staan op elke factuur die je
 * verstuurt en in het handelsregister, en nummers zijn geen geheim.
 *
 * Omdat ontsleutelen asynchroon is en readClients synchroon moet blijven, werkt
 * het zo: op schijf staat dan één versluierd blok, het boek leest als leeg tot
 * je ontgrendelt, en opslaan wordt geweigerd zolang het vergrendeld is. Dat
 * laatste is geen gemak maar noodzaak — een leesbare klant naast een
 * versleuteld blok wegschrijven zou de helft alsnog open leggen.
 */
export interface SavedClient extends Client {
    id: string;
}

const STORAGE_KEY = 'facturen.klanten';

export const NO_CLIENTS: SavedClient[] = [];

const listeners = new Set<() => void>();
const meld = () => listeners.forEach((listener) => listener());

let cachedValue: SavedClient[] = NO_CLIENTS;
let gelezen = false;
/** Waar als er op schijf een versleuteld blok staat waar we geen sleutel voor hebben. */
let vergrendeld = false;

export const klantenVergrendeld = () => vergrendeld;

const byName = (a: SavedClient, b: SavedClient) =>
    a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' });

const schoon = (lijst: unknown): SavedClient[] =>
    Array.isArray(lijst)
        ? (lijst as SavedClient[]).filter(c => c && typeof c.id === 'string').sort(byName)
        : NO_CLIENTS;

const leesRuw = (): string | null => {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        // Privémodus of geblokkeerde site-data: dan werken we zonder opslag.
        return null;
    }
};

/**
 * Leest het boek in. Synchroon, want readClients is dat ook.
 *
 * Staat er een versleuteld blok, dan kan hier niets mee gebeuren — ontsleutelen
 * is asynchroon. Het boek blijft dan leeg en gemarkeerd als vergrendeld; de
 * kluis roept `herlaad` zodra er een sleutel is.
 */
const leesIn = () => {
    gelezen = true;
    const raw = leesRuw();
    if (raw === null) {
        cachedValue = NO_CLIENTS;
        vergrendeld = false;
        return;
    }
    try {
        const parsed = JSON.parse(raw);
        if (isVersleuteld(parsed)) {
            cachedValue = NO_CLIENTS;
            vergrendeld = true;
            return;
        }
        cachedValue = schoon(parsed);
        vergrendeld = false;
    } catch {
        cachedValue = NO_CLIENTS;
        vergrendeld = false;
    }
};

export const subscribeClients = (onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    // Een ander tabblad dat opslaat, moet hier ook doorkomen.
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === null) {
            leesIn();
            onStoreChange();
        }
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(onStoreChange);
        window.removeEventListener('storage', onStorage);
    };
};

export const readClients = (): SavedClient[] => {
    if (!gelezen) leesIn();
    return cachedValue;
};

export const readServerClients = (): SavedClient[] => NO_CLIENTS;

const zetWeg = (waarde: unknown) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(waarde));
    } catch {
        // Zonder opslag onthouden we het alleen voor deze sessie.
    }
};

/**
 * Schrijft het boek naar schijf, versleuteld als er een sleutel is.
 *
 * Asynchroon omdat versleutelen dat is: dat is één AES-bewerking op een paar
 * kilobyte, want de langzame stap — het afleiden van de sleutel — is bij het
 * ontgrendelen al gedaan.
 */
const schrijf = async (lijst: SavedClient[]): Promise<void> => {
    const sleutel = huidigeSleutel();
    zetWeg(sleutel ? await versleutel(sleutel, lijst) : lijst);
};

/**
 * Zet het geheugen om en schrijft daarna weg.
 *
 * Het scherm loopt dus voor op de schijf. Voor losse bewerkingen is dat goed:
 * typen hoort niet op een schrijfactie te wachten. Waar het wél moet kloppen —
 * bij het instellen van een wachtwoordzin, waar de kluis hierna zijn kop
 * vastlegt — gebruikt `herschrijf` de belofte die hier uit komt.
 */
const persist = (next: SavedClient[]): Promise<void> => {
    const sorted = [...next].sort(byName);
    cachedValue = sorted;
    gelezen = true;
    meld();
    return schrijf(sorted);
};

/**
 * Bewaart de klant onder zijn naam: bestaat die naam al, dan wordt die klant
 * bijgewerkt, anders komt er een nieuwe bij.
 *
 * Geeft null als het boek vergrendeld is. De aanroeper moet dat zeggen, want
 * stilzwijgend niets bewaren is erger dan een melding.
 */
export const saveClient = (client: Client): SavedClient | null => {
    if (vergrendeld) return null;
    const existing = findClientByName(client.name);
    const saved: SavedClient = { ...client, id: existing?.id ?? generateId() };
    const rest = readClients().filter(c => c.id !== saved.id);
    void persist([...rest, saved]);
    return saved;
};

export const deleteClient = (id: string): boolean => {
    if (vergrendeld) return false;
    void persist(readClients().filter(c => c.id !== id));
    return true;
};

/** Voor import: vervangt het hele boek. */
export const replaceClients = (list: SavedClient[]): boolean => {
    if (vergrendeld) return false;
    void persist(list
        .filter(c => c && typeof c.name === 'string')
        .map(c => ({ ...c, id: c.id ?? generateId() })));
    return true;
};

/**
 * Wat Export meeneemt: het boek zoals het op schijf staat, dus versleuteld als
 * het dat is. Zelfde reden als bij het archief — een reservekopie die alles
 * alsnog leesbaar wegschrijft haalt de versleuteling onderuit.
 */
export const exportClients = (): SavedClient[] | Versleuteld => {
    const raw = leesRuw();
    if (raw === null) return NO_CLIENTS;
    try {
        const parsed = JSON.parse(raw);
        return isVersleuteld(parsed) ? parsed : schoon(parsed);
    } catch {
        return NO_CLIENTS;
    }
};

/** Voor import: schrijft weg wat er in het bestand stond, versleuteld of niet. */
export const importClients = (waarde: SavedClient[] | Versleuteld): boolean => {
    if (isVersleuteld(waarde)) {
        zetWeg(waarde);
        // Opnieuw inlezen zet hem op vergrendeld: het blok hoort bij de zin van
        // het bestand, niet bij een sleutel die we nu al zouden hebben.
        leesIn();
        meld();
        return true;
    }
    return replaceClients(waarde);
};

export const clearClients = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // niets te wissen
    }
    cachedValue = NO_CLIENTS;
    gelezen = true;
    vergrendeld = false;
    meld();
};

export const findClientByName = (name: string): SavedClient | undefined => {
    const needle = name.trim().toLowerCase();
    if (!needle) return undefined;
    return readClients().find(c => c.name.trim().toLowerCase() === needle);
};

/** Meedoen met de wachtwoordzin; zie lib/vault.ts. */
doeMee({
    // Opnieuw wegschrijven met de sleutel die er nu is — of juist leesbaar
    // terug als die net is weggehaald. persist() kijkt zelf welke het is.
    // Hier wél wachten op de schijf: de kluis legt hierna zijn kop vast, en een
    // kop naast een nog onversleuteld boek is precies de toestand die niet mag.
    herschrijf: async () => {
        if (vergrendeld) return;
        await persist(readClients());
    },
    herlaad: async () => {
        const sleutel = huidigeSleutel();
        const raw = leesRuw();
        if (!sleutel || raw === null) return;
        try {
            const parsed = JSON.parse(raw);
            if (!isVersleuteld(parsed)) return;
            const leesbaar = await ontsleutel<SavedClient[]>(sleutel, parsed);
            if (!leesbaar) return;
            cachedValue = schoon(leesbaar);
            vergrendeld = false;
            gelezen = true;
            meld();
        } catch {
            // Blijft vergrendeld; de kluis meldt zelf dat de zin niet klopte.
        }
    },
    sluit: () => {
        // Alleen dichtdoen als er ook echt een versleuteld blok op schijf staat.
        const raw = leesRuw();
        if (raw === null) return;
        try {
            if (!isVersleuteld(JSON.parse(raw))) return;
        } catch {
            return;
        }
        cachedValue = NO_CLIENTS;
        vergrendeld = true;
        meld();
    },
});

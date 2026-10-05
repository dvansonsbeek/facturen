import { Invoice, Quotation } from "@/types";
import { summariseDocument } from "@/lib/utils";

/**
 * Je bewaarde facturen en offertes.
 *
 * Twee dingen maken deze opslag anders dan de rest.
 *
 * **Hij staat in IndexedDB, niet in localStorage.** Documenten stapelen op, en
 * localStorage is krap (ongeveer 5 MB) en deelt die ruimte al met een geüpload
 * logo als data-URL. IndexedDB is ruimer, en hij is asynchroon — precies wat
 * nodig is als de inhoud later versleuteld wordt, want Web Crypto is dat ook.
 *
 * **Een bewaard document verandert nooit meer.** Een uitgereikte factuur is een
 * vastgesteld stuk: de ontvanger heeft hem, en de btw-aangifte verwijst ernaar.
 * Kon je hem hier nog bijwerken, dan liep jouw administratie uit de pas met die
 * van je klant zonder dat iemand het zag. Daarom is er geen bijwerkfunctie, en
 * schrijft bewaarDocument met add() in plaats van put(): IndexedDB weigert dan
 * zelf een bestaand id. Een document aanpassen doe je door het te dupliceren
 * naar een nieuw concept, met een nieuw nummer.
 *
 * Daarom bewaren we ook het hele document inclusief jouw bedrijfs- en
 * betaalgegevens van dat moment. Die staan normaal in de instellingen en gelden
 * voor alles; verhuis je volgend jaar, dan zou een factuur van vorig jaar
 * ineens je nieuwe adres tonen. Wat is uitgereikt, blijft staan zoals het is
 * uitgereikt.
 */
export type DocumentSoort = 'factuur' | 'offerte';

export interface BewaardDocument {
    id: string;
    soort: DocumentSoort;
    /** Overgenomen uit het document, zodat de lijst niet elk document hoeft uit te rekenen. */
    nummer: string;
    datum: string;
    klant: string;
    totaal: number;
    /** Wanneer je op Bewaren drukte, niet de factuurdatum. */
    bewaardOp: string;
    /** Het document zoals het is uitgereikt, met jouw gegevens van dat moment. */
    document: Invoice | Quotation;
}

const DB_NAAM = 'facturen';
const DB_VERSIE = 1;
const WINKEL = 'documenten';

/**
 * Eén vaste lege lijst. useSyncExternalStore vergelijkt op referentie, dus een
 * nieuwe [] bij elke aanroep laat React eindeloos opnieuw renderen.
 */
const LEEG: readonly BewaardDocument[] = Object.freeze([]);

const listeners = new Set<() => void>();
const meld = () => listeners.forEach((listener) => listener());

let cache: readonly BewaardDocument[] = LEEG;
let geladen = false;
let aanHetLaden: Promise<void> | null = null;

/** Waar als de browser geen IndexedDB geeft, bijvoorbeeld in privémodus. */
let opslagWerkt = true;
export const documentOpslagWerkt = () => opslagWerkt;

const open = (): Promise<IDBDatabase> =>
    new Promise((klaar, mislukt) => {
        let verzoek: IDBOpenDBRequest;
        try {
            verzoek = indexedDB.open(DB_NAAM, DB_VERSIE);
        } catch (fout) {
            mislukt(fout);
            return;
        }
        verzoek.onupgradeneeded = () => {
            const db = verzoek.result;
            if (!db.objectStoreNames.contains(WINKEL)) {
                const winkel = db.createObjectStore(WINKEL, { keyPath: 'id' });
                winkel.createIndex('bewaardOp', 'bewaardOp');
            }
        };
        verzoek.onsuccess = () => klaar(verzoek.result);
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onblocked = () => mislukt(new Error('IndexedDB geblokkeerd'));
    });

const metWinkel = async <T>(
    modus: IDBTransactionMode,
    doe: (winkel: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
    const db = await open();
    try {
        return await new Promise<T>((klaar, mislukt) => {
            const transactie = db.transaction(WINKEL, modus);
            const verzoek = doe(transactie.objectStore(WINKEL));
            verzoek.onsuccess = () => klaar(verzoek.result);
            verzoek.onerror = () => mislukt(verzoek.error);
            transactie.onabort = () => mislukt(transactie.error);
        });
    } finally {
        db.close();
    }
};

/** Nieuwste eerst: dat is waar je naar zoekt als je iets terugzoekt. */
const sorteer = (documenten: BewaardDocument[]): readonly BewaardDocument[] =>
    Object.freeze([...documenten].sort((a, b) => b.bewaardOp.localeCompare(a.bewaardOp)));

const laad = async () => {
    try {
        const alles = await metWinkel<BewaardDocument[]>('readonly', (winkel) => winkel.getAll());
        cache = sorteer(alles);
        opslagWerkt = true;
    } catch {
        // Geen IndexedDB: de app werkt verder, alleen bewaart hij niets.
        cache = LEEG;
        opslagWerkt = false;
    }
    geladen = true;
    meld();
};

/**
 * De lijst wordt asynchroon ingelezen, maar useSyncExternalStore leest
 * synchroon. Daarom geeft readDocuments eerst de lege lijst — dezelfde
 * referentie die de server geeft, dus hydratatie klopt — en meldt deze functie
 * zich zodra de echte inhoud binnen is.
 */
const zorgDatGeladenIs = () => {
    if (geladen || aanHetLaden) return;
    aanHetLaden = laad().finally(() => {
        aanHetLaden = null;
    });
};

export const subscribeDocuments = (onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    zorgDatGeladenIs();
    return () => {
        listeners.delete(onStoreChange);
    };
};

export const readDocuments = (): readonly BewaardDocument[] => cache;

/** De server kent het apparaat niet; die rendert dus een leeg archief. */
export const readServerDocuments = (): readonly BewaardDocument[] => LEEG;

/**
 * Legt het document vast zoals het er nu uitziet.
 *
 * Geeft terug wat er bewaard is, of null als het niet kon. Dat laatste moet de
 * aanroeper zeggen: stilzwijgend niets bewaren is erger dan een melding.
 */
export const bewaarDocument = async (
    stuk: Invoice | Quotation,
    soort: DocumentSoort,
): Promise<BewaardDocument | null> => {
    const nummer = 'invoiceNumber' in stuk ? stuk.invoiceNumber : stuk.quotationNumber;
    const { total } = summariseDocument(stuk.items, stuk.isVatExempt);

    const record: BewaardDocument = {
        // Niet het id van het concept: dat blijft bestaan terwijl je doortypt,
        // en twee keer bewaren moet twee documenten geven, geen botsing.
        id: `${soort}-${nummer}-${Date.now()}`,
        soort,
        nummer,
        datum: stuk.date,
        klant: stuk.client.name,
        totaal: total,
        bewaardOp: new Date().toISOString(),
        // Diep kopiëren: het concept wordt hierna verder bewerkt, en een
        // bewaard document mag daar niet in meebewegen.
        document: structuredClone(stuk),
    };

    try {
        await metWinkel('readwrite', (winkel) => winkel.add(record));
        opslagWerkt = true;
    } catch {
        opslagWerkt = false;
        return null;
    }

    cache = sorteer([...cache, record]);
    meld();
    return record;
};

/**
 * Verwijdert één bewaard document.
 *
 * Bijwerken kan niet, verwijderen wel. Dit is jouw browser en jouw
 * administratie: data die je er niet meer uit krijgt is een slechtere uitkomst
 * dan data die je per ongeluk weggooit. Vandaar wel een bevestiging in de
 * schermlaag, en Export om een kopie buiten de browser te houden.
 */
export const verwijderDocument = async (id: string): Promise<boolean> => {
    try {
        await metWinkel('readwrite', (winkel) => winkel.delete(id));
    } catch {
        return false;
    }
    cache = Object.freeze(cache.filter((d) => d.id !== id));
    meld();
    return true;
};

/** Voor Import: zet het archief op wat er in het bestand stond. */
export const replaceDocuments = async (documenten: BewaardDocument[]): Promise<boolean> => {
    try {
        await metWinkel('readwrite', (winkel) => winkel.clear());
        for (const document of documenten) {
            await metWinkel('readwrite', (winkel) => winkel.put(document));
        }
    } catch {
        return false;
    }
    cache = sorteer(documenten);
    meld();
    return true;
};

export const clearDocuments = async () => {
    try {
        await metWinkel('readwrite', (winkel) => winkel.clear());
    } catch {
        // niets te wissen
    }
    cache = LEEG;
    geladen = true;
    meld();
};

import { Invoice, Quotation } from "@/types";
import { summariseDocument } from "@/lib/utils";
import {
    isVersleuteld, leidSleutelAf, nieuweKop, ontsleutel, versleutel,
    type SleutelKop, type Versleuteld,
} from "@/lib/crypto";

/**
 * Je bewaarde facturen en offertes.
 *
 * Drie dingen maken deze opslag anders dan de rest.
 *
 * **Hij staat in IndexedDB, niet in localStorage.** Documenten stapelen op, en
 * localStorage is krap (ongeveer 5 MB) en deelt die ruimte al met een geüpload
 * logo als data-URL. IndexedDB is ruimer, en hij is asynchroon — wat nodig is
 * voor versleuteling, want Web Crypto is dat ook.
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
 *
 * **Hij kan versleuteld zijn.** Stelt de gebruiker een wachtwoordzin in, dan
 * gaat elk record als één versluierd blok naar schijf en blijft alleen het id
 * leesbaar — geen klantnamen, geen bedragen, ook niet het factuurnummer. Zie
 * lib/crypto.ts voor wat dat wel en niet beschermt. Zonder zin is alles gewoon
 * leesbaar, en dat is de standaard: een vergeten zin betekent dat het archief
 * weg is, en dat mag niemand overkomen die er niet om gevraagd heeft.
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

/** Hoe een versleuteld record op schijf staat: alleen het id ligt open. */
interface VersleuteldRecord {
    id: string;
    blok: Versleuteld;
}

type RuwRecord = BewaardDocument | VersleuteldRecord;

const isVersleuteldRecord = (r: RuwRecord): r is VersleuteldRecord =>
    isVersleuteld((r as VersleuteldRecord).blok);

/** De stand van de versleuteling, voor het scherm. */
export interface KluisStand {
    /** Of er een wachtwoordzin is ingesteld. */
    ingesteld: boolean;
    /** Ingesteld maar nog niet ontgrendeld in deze sessie. */
    vergrendeld: boolean;
    /** Onwaar als de browser geen IndexedDB geeft, bijvoorbeeld in privémodus. */
    opslagWerkt: boolean;
}

const DB_NAAM = 'facturen';
const DB_VERSIE = 2;
const WINKEL = 'documenten';
const KLUIS = 'kluis';
const KLUIS_ID = 'sleutel';

/** Wat er versleuteld wordt bewaard om te kunnen controleren of de zin klopt. */
const PROEFTEKST = 'facturen-sleutelproef';

interface KluisRecord {
    id: string;
    kop: SleutelKop;
    proef: Versleuteld;
}

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

/**
 * De sleutel staat alleen hier, in het geheugen van deze pagina, en is
 * extractable: false. Na herladen is hij weg en voer je de zin opnieuw in. Hem
 * bewaren zou de versleuteling zinloos maken — dan kan iedereen met toegang
 * tot dit apparaat er weer bij.
 */
let sleutel: CryptoKey | null = null;
let kop: SleutelKop | null = null;
let opslagWerkt = true;

/** Eén vaste referentie per stand, weer vanwege useSyncExternalStore. */
/** Wat de server rendert: hij kent het apparaat niet, dus geen kluis. */
const STAND_STANDAARD: KluisStand = Object.freeze({
    ingesteld: false, vergrendeld: false, opslagWerkt: true,
});

let standCache: KluisStand = STAND_STANDAARD;
const verversStand = () => {
    const volgende: KluisStand = {
        ingesteld: kop !== null,
        vergrendeld: kop !== null && sleutel === null,
        opslagWerkt,
    };
    if (volgende.ingesteld !== standCache.ingesteld
        || volgende.vergrendeld !== standCache.vergrendeld
        || volgende.opslagWerkt !== standCache.opslagWerkt) {
        standCache = volgende;
    }
};

export const readKluis = (): KluisStand => standCache;
export const readServerKluis = (): KluisStand => STAND_STANDAARD;

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
                db.createObjectStore(WINKEL, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(KLUIS)) {
                db.createObjectStore(KLUIS, { keyPath: 'id' });
            }
        };
        verzoek.onsuccess = () => klaar(verzoek.result);
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onblocked = () => mislukt(new Error('IndexedDB geblokkeerd'));
    });

const metWinkel = async <T>(
    naam: string,
    modus: IDBTransactionMode,
    doe: (winkel: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
    const db = await open();
    try {
        return await new Promise<T>((klaar, mislukt) => {
            const transactie = db.transaction(naam, modus);
            const verzoek = doe(transactie.objectStore(naam));
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

/**
 * Maakt van de ruwe records een leesbare lijst. Versleutelde records worden
 * overgeslagen zolang er geen sleutel is; dat is de vergrendelde toestand.
 */
const ontsluit = async (ruw: RuwRecord[]): Promise<BewaardDocument[]> => {
    const uit: BewaardDocument[] = [];
    for (const record of ruw) {
        if (!isVersleuteldRecord(record)) {
            uit.push(record);
            continue;
        }
        if (!sleutel) continue;
        const leesbaar = await ontsleutel<BewaardDocument>(sleutel, record.blok);
        if (leesbaar) uit.push(leesbaar);
    }
    return uit;
};

const laad = async () => {
    try {
        const kluis = await metWinkel<KluisRecord | undefined>(
            KLUIS, 'readonly', (winkel) => winkel.get(KLUIS_ID),
        );
        kop = kluis?.kop ?? null;

        const ruw = await metWinkel<RuwRecord[]>(WINKEL, 'readonly', (winkel) => winkel.getAll());
        cache = sorteer(await ontsluit(ruw));
        opslagWerkt = true;
    } catch {
        // Geen IndexedDB: de app werkt verder, alleen bewaart hij niets.
        cache = LEEG;
        opslagWerkt = false;
    }
    geladen = true;
    verversStand();
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

export const documentOpslagWerkt = () => opslagWerkt;

/** Hoe een record naar schijf gaat: versleuteld als er een sleutel is. */
const naarSchijf = async (document: BewaardDocument): Promise<RuwRecord> =>
    sleutel ? { id: document.id, blok: await versleutel(sleutel, document) } : document;

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
    // Vergrendeld kan er niet bewaard worden: zonder sleutel zou het record
    // leesbaar naast de versleutelde terechtkomen.
    if (kop && !sleutel) return null;

    const nummer = 'invoiceNumber' in stuk ? stuk.invoiceNumber : stuk.quotationNumber;
    const { total } = summariseDocument(stuk.items, stuk.isVatExempt);

    const record: BewaardDocument = {
        // Een toevalsgetal en niet iets met het nummer erin: bij versleuteling
        // ligt het id open, en dan zou het factuurnummer alsnog te lezen zijn.
        id: crypto.randomUUID(),
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
        const opSchijf = await naarSchijf(record);
        await metWinkel(WINKEL, 'readwrite', (winkel) => winkel.add(opSchijf));
        opslagWerkt = true;
    } catch {
        opslagWerkt = false;
        verversStand();
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
        await metWinkel(WINKEL, 'readwrite', (winkel) => winkel.delete(id));
    } catch {
        return false;
    }
    cache = Object.freeze(cache.filter((d) => d.id !== id));
    meld();
    return true;
};

/**
 * Wat Export meeneemt: de records zoals ze op schijf staan, plus de kop die bij
 * de wachtwoordzin hoort.
 *
 * Bewust niet ontsleuteld. Een reservekopie die alles alsnog leesbaar wegschrijft
 * haalt de versleuteling onderuit; wie zijn archief heeft beveiligd verwacht niet
 * dat de back-up dat niet is. Keerzijde: zonder de zin is ook de kopie onleesbaar.
 */
export const exportDocuments = async (): Promise<{ records: RuwRecord[]; kop: SleutelKop | null }> => {
    try {
        const records = await metWinkel<RuwRecord[]>(WINKEL, 'readonly', (w) => w.getAll());
        return { records, kop };
    } catch {
        return { records: [], kop: null };
    }
};

/** Voor Import: zet het archief op wat er in het bestand stond. */
export const replaceDocuments = async (
    records: RuwRecord[],
    nieuweSleutelKop?: SleutelKop | null,
): Promise<boolean> => {
    try {
        await metWinkel(WINKEL, 'readwrite', (winkel) => winkel.clear());
        for (const record of records) {
            await metWinkel(WINKEL, 'readwrite', (winkel) => winkel.put(record));
        }

        // Een bestand met versleutelde records heeft zijn eigen kop nodig,
        // anders valt er niets meer af te leiden.
        if (nieuweSleutelKop) {
            const bestaand = await metWinkel<KluisRecord | undefined>(
                KLUIS, 'readonly', (w) => w.get(KLUIS_ID),
            );
            if (!bestaand || JSON.stringify(bestaand.kop) !== JSON.stringify(nieuweSleutelKop)) {
                // De sleutel van deze sessie hoort niet bij deze kop meer.
                sleutel = null;
            }
            kop = nieuweSleutelKop;
        }
    } catch {
        return false;
    }

    cache = sorteer(await ontsluit(records));
    verversStand();
    meld();
    return true;
};

export const clearDocuments = async () => {
    try {
        await metWinkel(WINKEL, 'readwrite', (winkel) => winkel.clear());
        await metWinkel(KLUIS, 'readwrite', (winkel) => winkel.clear());
    } catch {
        // niets te wissen
    }
    cache = LEEG;
    sleutel = null;
    kop = null;
    geladen = true;
    verversStand();
    meld();
};

/**
 * Zet een wachtwoordzin op het archief, en versleutelt wat er al staat.
 *
 * Kan alleen als het archief leesbaar is: anders zouden er twee sleutels door
 * elkaar lopen en was de helft onleesbaar.
 */
export const stelWachtwoordzinIn = async (zin: string): Promise<boolean> => {
    if (kop && !sleutel) return false;

    try {
        const nieuwe = nieuweKop();
        const nieuweSleutel = await leidSleutelAf(zin, nieuwe);
        const proef = await versleutel(nieuweSleutel, PROEFTEKST);

        // Eerst alles omzetten, dan pas de kop vastleggen: breekt het halverwege
        // af, dan staat er geen kop en blijft het archief leesbaar.
        const huidig = [...cache];
        sleutel = nieuweSleutel;
        for (const document of huidig) {
            const blok = await versleutel(nieuweSleutel, document);
            await metWinkel(WINKEL, 'readwrite', (w) => w.put(
                { id: document.id, blok } satisfies VersleuteldRecord,
            ));
        }

        await metWinkel(KLUIS, 'readwrite', (w) => w.put({
            id: KLUIS_ID, kop: nieuwe, proef,
        } satisfies KluisRecord));
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

/** Ontgrendelt het archief met de wachtwoordzin. Onwaar bij een verkeerde zin. */
export const ontgrendel = async (zin: string): Promise<boolean> => {
    if (!kop) return false;
    try {
        const kandidaat = await leidSleutelAf(zin, kop);
        const kluis = await metWinkel<KluisRecord | undefined>(
            KLUIS, 'readonly', (w) => w.get(KLUIS_ID),
        );
        if (!kluis) return false;

        // De proef zegt of de zin klopt, zonder dat we een document hoeven te
        // raken en zonder dat een verkeerde zin halve resultaten oplevert.
        if (await ontsleutel<string>(kandidaat, kluis.proef) !== PROEFTEKST) return false;

        sleutel = kandidaat;
        const ruw = await metWinkel<RuwRecord[]>(WINKEL, 'readonly', (w) => w.getAll());
        cache = sorteer(await ontsluit(ruw));
    } catch {
        return false;
    }
    verversStand();
    meld();
    return true;
};

/** Vergeet de sleutel weer. Het archief is daarna onleesbaar tot je ontgrendelt. */
export const vergrendel = () => {
    if (!kop) return;
    sleutel = null;
    cache = LEEG;
    verversStand();
    meld();
};

/**
 * Haalt de versleuteling er weer af en schrijft alles leesbaar terug. Kan
 * alleen als het archief op dit moment ontgrendeld is.
 */
export const verwijderWachtwoordzin = async (): Promise<boolean> => {
    if (!kop || !sleutel) return false;
    try {
        for (const document of cache) {
            await metWinkel(WINKEL, 'readwrite', (w) => w.put(document));
        }
        await metWinkel(KLUIS, 'readwrite', (w) => w.delete(KLUIS_ID));
    } catch {
        return false;
    }
    sleutel = null;
    kop = null;
    verversStand();
    meld();
    return true;
};

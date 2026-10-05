import { Invoice, Quotation } from "@/types";
import { summariseDocument } from "@/lib/utils";
import { isVersleuteld, ontsleutel, versleutel, type Versleuteld } from "@/lib/crypto";
import { DOCUMENTEN, metWinkel, opslagWerkt } from "@/lib/idb";
import { doeMee, huidigeSleutel, zorgDatKluisGeladenIs } from "@/lib/vault";

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
 * **Hij kan versleuteld zijn.** Zie lib/vault.ts voor de sleutel en
 * lib/crypto.ts voor wat dat wel en niet beschermt. Staat er een zin, dan gaat
 * elk record als één versluierd blok naar schijf en blijft alleen het id
 * leesbaar — geen klantnamen, geen bedragen, ook niet het factuurnummer.
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

export type RuwDocumentRecord = BewaardDocument | VersleuteldRecord;

const isVersleuteldRecord = (r: RuwDocumentRecord): r is VersleuteldRecord =>
    isVersleuteld((r as VersleuteldRecord).blok);

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

/** Nieuwste eerst: dat is waar je naar zoekt als je iets terugzoekt. */
const sorteer = (documenten: BewaardDocument[]): readonly BewaardDocument[] =>
    Object.freeze([...documenten].sort((a, b) => b.bewaardOp.localeCompare(a.bewaardOp)));

/**
 * Maakt van de ruwe records een leesbare lijst. Versleutelde records worden
 * overgeslagen zolang er geen sleutel is; dat is de vergrendelde toestand.
 */
const ontsluit = async (ruw: RuwDocumentRecord[]): Promise<BewaardDocument[]> => {
    const sleutel = huidigeSleutel();
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

const leesAlles = () =>
    metWinkel<RuwDocumentRecord[]>(DOCUMENTEN, 'readonly', (winkel) => winkel.getAll());

const laad = async () => {
    // De kop eerst, anders weet ontsluit() nog niet of er een zin staat.
    await zorgDatKluisGeladenIs();
    try {
        cache = sorteer(await ontsluit(await leesAlles()));
    } catch {
        // Geen IndexedDB: de app werkt verder, alleen bewaart hij niets.
        cache = LEEG;
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

export const documentOpslagWerkt = opslagWerkt;

/** Hoe een record naar schijf gaat: versleuteld als er een sleutel is. */
const naarSchijf = async (document: BewaardDocument): Promise<RuwDocumentRecord> => {
    const sleutel = huidigeSleutel();
    return sleutel ? { id: document.id, blok: await versleutel(sleutel, document) } : document;
};

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
        await metWinkel(DOCUMENTEN, 'readwrite', (winkel) => winkel.add(opSchijf));
    } catch {
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
        await metWinkel(DOCUMENTEN, 'readwrite', (winkel) => winkel.delete(id));
    } catch {
        return false;
    }
    cache = Object.freeze(cache.filter((d) => d.id !== id));
    meld();
    return true;
};

/**
 * Wat Export meeneemt: de records zoals ze op schijf staan.
 *
 * Bewust niet ontsleuteld. Een reservekopie die alles alsnog leesbaar
 * wegschrijft haalt de versleuteling onderuit; wie zijn archief heeft beveiligd
 * verwacht niet dat de back-up dat niet is.
 */
export const exportDocuments = async (): Promise<RuwDocumentRecord[]> => {
    try {
        return await leesAlles();
    } catch {
        return [];
    }
};

/** Voor Import: zet het archief op wat er in het bestand stond. */
export const replaceDocuments = async (records: RuwDocumentRecord[]): Promise<boolean> => {
    try {
        await metWinkel(DOCUMENTEN, 'readwrite', (winkel) => winkel.clear());
        for (const record of records) {
            await metWinkel(DOCUMENTEN, 'readwrite', (winkel) => winkel.put(record));
        }
    } catch {
        return false;
    }
    cache = sorteer(await ontsluit(records));
    meld();
    return true;
};

export const clearDocuments = async () => {
    try {
        await metWinkel(DOCUMENTEN, 'readwrite', (winkel) => winkel.clear());
    } catch {
        // niets te wissen
    }
    cache = LEEG;
    geladen = true;
    meld();
};

/**
 * Meedoen met de wachtwoordzin.
 *
 * `herschrijf` zet alles om naar de huidige sleutel — of juist terug naar
 * leesbaar als de sleutel net is weggehaald. Beide gevallen zijn hetzelfde
 * stukje werk, want naarSchijf() kijkt zelf of er een sleutel is.
 */
doeMee({
    herschrijf: async () => {
        for (const document of cache) {
            const opSchijf = await naarSchijf(document);
            await metWinkel(DOCUMENTEN, 'readwrite', (winkel) => winkel.put(opSchijf));
        }
    },
    herlaad: async () => {
        cache = sorteer(await ontsluit(await leesAlles()));
        meld();
    },
    sluit: () => {
        cache = LEEG;
        meld();
    },
});

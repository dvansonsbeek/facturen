/**
 * De IndexedDB van deze app, en het enige wat de vorm ervan kent.
 *
 * Twee opslagen gebruiken hem — het documentarchief en de kluis met de kop die
 * bij je wachtwoordzin hoort — en die moeten dezelfde database en hetzelfde
 * versienummer aanhouden. Twee modules die elk hun eigen open() doen, draaien
 * vroeg of laat met een ander versienummer en blokkeren elkaars upgrade.
 */
export const DB_NAAM = 'facturen';
export const DB_VERSIE = 2;
export const DOCUMENTEN = 'documenten';
export const KLUIS = 'kluis';

/** Onwaar zodra de browser geen IndexedDB geeft, bijvoorbeeld in privémodus. */
let werkt = true;
export const opslagWerkt = () => werkt;

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
            if (!db.objectStoreNames.contains(DOCUMENTEN)) {
                db.createObjectStore(DOCUMENTEN, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(KLUIS)) {
                db.createObjectStore(KLUIS, { keyPath: 'id' });
            }
        };
        verzoek.onsuccess = () => klaar(verzoek.result);
        verzoek.onerror = () => mislukt(verzoek.error);
        verzoek.onblocked = () => mislukt(new Error('IndexedDB geblokkeerd'));
    });

/**
 * Doet één bewerking op één opslag en geeft het resultaat terug. Zet `werkt`
 * om, zodat het scherm kan zeggen dat er niets bewaard wordt in plaats van het
 * stilzwijgend niet te doen.
 */
export const metWinkel = async <T>(
    naam: string,
    modus: IDBTransactionMode,
    doe: (winkel: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
    let db: IDBDatabase;
    try {
        db = await open();
    } catch (fout) {
        werkt = false;
        throw fout;
    }
    try {
        const uitkomst = await new Promise<T>((klaar, mislukt) => {
            const transactie = db.transaction(naam, modus);
            const verzoek = doe(transactie.objectStore(naam));
            verzoek.onsuccess = () => klaar(verzoek.result);
            verzoek.onerror = () => mislukt(verzoek.error);
            transactie.onabort = () => mislukt(transactie.error);
        });
        werkt = true;
        return uitkomst;
    } finally {
        db.close();
    }
};

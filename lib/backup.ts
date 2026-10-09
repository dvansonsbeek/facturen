import { Sender } from "@/types";
import { isVersleuteld, type Versleuteld } from "@/lib/crypto";
import type { SavedClient } from "@/lib/clients";
import type { RuwDocumentRecord } from "@/lib/documents";
import type { KluisRecord } from "@/lib/vault";

/**
 * Het bestand achter Export en Import.
 *
 * Export en Import stonden honderd regels uit elkaar in InvoiceForm, en wat er
 * precies in het bestand hoort te zitten stond nergens. Daarmee kon de ene kant
 * veranderen zonder de andere — en belangrijker: er werd van alles ingelezen
 * wat nooit gecontroleerd is.
 *
 * ## Waarom dit meer dan een vormcontrole is
 *
 * Importeren wíst eerst en schrijft daarna. Een bestand met `documents: [1,2,3]`
 * leegde dus je archief, liep vast op het eerste record en meldde achteraf dat
 * het niet gelukt was — terwijl het origineel al weg was. Eén keer het verkeerde
 * JSON-bestand uit je downloadmap aanwijzen was genoeg.
 *
 * Daarom wordt hier het hele bestand eerst nagelopen. Deugt er iets niet, dan
 * is er nog niets aangeraakt. En wat er wél in zit wordt geteld, zodat het
 * scherm kan vragen of je dat echt wilt vervangen — net als Wissen dat doet,
 * dat niet destructiever is maar wél om bevestiging vroeg.
 */

/** Alleen deze sleutels komen uit een bestand in de instellingen terecht. */
const SETTING_SLEUTELS = ['bankAccount', 'bic', 'paymentTermDays', 'paymentConditions'] as const;

export interface BackupBestand {
    sender?: Partial<Sender>;
    bankAccount?: string;
    bic?: string;
    /** Zie lib/settings.ts: een ouder bestand draagt alleen paymentConditions. */
    paymentTermDays?: number;
    paymentConditions?: string;
    clients?: SavedClient[] | Versleuteld;
    numbering?: { factuur?: string; offerte?: string };
    documents?: RuwDocumentRecord[];
    kluis?: KluisRecord;
}

/** Wat erin zit, om de gebruiker te kunnen vragen of hij dat wil vervangen. */
export interface BackupInhoud {
    documenten: number;
    klanten: number | 'versleuteld';
    heeftBedrijfsgegevens: boolean;
    heeftNummering: boolean;
    versleuteld: boolean;
}

export type Inspectie =
    | { ok: true; bestand: BackupBestand; inhoud: BackupInhoud }
    | { ok: false; problemen: string[] };

const isObject = (waarde: unknown): waarde is Record<string, unknown> =>
    typeof waarde === 'object' && waarde !== null && !Array.isArray(waarde);

/**
 * Een bewaard document zoals het op schijf staat: versleuteld (alleen id en
 * blok) of leesbaar. Alleen de velden waar de app op leunt worden geëist; een
 * ouder bestand met minder eromheen moet gewoon kunnen.
 */
const isDocumentRecord = (waarde: unknown): boolean => {
    if (!isObject(waarde) || typeof waarde.id !== 'string' || !waarde.id) return false;
    if (isVersleuteld(waarde.blok)) return true;
    return typeof waarde.nummer === 'string'
        && typeof waarde.soort === 'string'
        && isObject(waarde.document);
};

const isKlant = (waarde: unknown): boolean =>
    isObject(waarde) && typeof waarde.name === 'string';

const isKluis = (waarde: unknown): boolean =>
    isObject(waarde)
    && isObject(waarde.kop)
    && Array.isArray((waarde.kop as Record<string, unknown>).zout)
    && typeof (waarde.kop as Record<string, unknown>).ronden === 'number'
    && isVersleuteld(waarde.proef);

/**
 * Leest het bestand na zonder iets te wijzigen.
 *
 * Geeft óf de inhoud met een telling, óf een lijst met wat eraan mankeert — een
 * lijst en niet één melding, want wie twee dingen mist wil dat in één keer
 * horen.
 */
export const inspecteerBackup = (tekst: string): Inspectie => {
    let ruw: unknown;
    try {
        ruw = JSON.parse(tekst);
    } catch {
        return { ok: false, problemen: ['dit is geen JSON-bestand'] };
    }
    if (!isObject(ruw)) {
        return { ok: false, problemen: ['dit bestand bevat geen instellingen'] };
    }

    // Een heel oud bestand bevatte alleen de bedrijfsgegevens zelf, zonder
    // iets eromheen.
    const bron: Record<string, unknown> = 'sender' in ruw ? ruw : { sender: ruw };
    const problemen: string[] = [];

    if (bron.sender !== undefined && !isObject(bron.sender)) {
        problemen.push('de bedrijfsgegevens kloppen niet');
    }

    if (bron.documents !== undefined) {
        if (!Array.isArray(bron.documents)) {
            problemen.push('het archief in dit bestand is geen lijst');
        } else {
            const stuk = bron.documents.findIndex((d) => !isDocumentRecord(d));
            if (stuk !== -1) {
                problemen.push(`document ${stuk + 1} in dit bestand is geen bewaard document`);
            }
        }
    }

    if (bron.clients !== undefined && !isVersleuteld(bron.clients)) {
        if (!Array.isArray(bron.clients)) {
            problemen.push('het klantenboek in dit bestand is geen lijst');
        } else {
            const stuk = bron.clients.findIndex((c) => !isKlant(c));
            if (stuk !== -1) problemen.push(`klant ${stuk + 1} in dit bestand heeft geen naam`);
        }
    }

    if (bron.numbering !== undefined && !isObject(bron.numbering)) {
        problemen.push('de nummering in dit bestand klopt niet');
    }

    // Een kluis die niet deugt is het ergst: die zou alles vergrendelen achter
    // een zin die nergens bij hoort.
    if (bron.kluis !== undefined && bron.kluis !== null && !isKluis(bron.kluis)) {
        problemen.push('de versleuteling in dit bestand is onvolledig');
    }

    if (problemen.length > 0) return { ok: false, problemen };

    const documents = (bron.documents as RuwDocumentRecord[] | undefined) ?? undefined;
    const clients = bron.clients as SavedClient[] | Versleuteld | undefined;

    const bestand: BackupBestand = {
        sender: bron.sender as Partial<Sender> | undefined,
        ...Object.fromEntries(
            SETTING_SLEUTELS
                .filter((k) => typeof bron[k] === 'string')
                .map((k) => [k, bron[k]]),
        ),
        clients,
        numbering: bron.numbering as BackupBestand['numbering'],
        documents,
        kluis: (bron.kluis as KluisRecord | undefined) ?? undefined,
    };

    return {
        ok: true,
        bestand,
        inhoud: {
            documenten: documents?.length ?? 0,
            klanten: clients === undefined ? 0 : isVersleuteld(clients) ? 'versleuteld' : clients.length,
            heeftBedrijfsgegevens: isObject(bron.sender),
            heeftNummering: isObject(bron.numbering),
            versleuteld: isKluis(bron.kluis),
        },
    };
};

/** De zin waarmee het scherm vraagt of dit echt vervangen mag worden. */
export const vervangingsVraag = (
    nieuw: BackupInhoud,
    huidig: { documenten: number; klanten: number },
): string => {
    const komt = [
        // "1 bewaard document" maar "2 bewaarde documenten": het bijvoeglijk
        // naamwoord buigt mee, niet alleen het zelfstandige.
        nieuw.documenten === 1 ? '1 bewaard document' : `${nieuw.documenten} bewaarde documenten`,
        nieuw.klanten === 'versleuteld'
            ? 'een versleuteld klantenboek'
            : `${nieuw.klanten} ${nieuw.klanten === 1 ? 'klant' : 'klanten'}`,
    ].join(' en ');

    const staat = `${huidig.documenten} ${huidig.documenten === 1 ? 'document' : 'documenten'} `
        + `en ${huidig.klanten} ${huidig.klanten === 1 ? 'klant' : 'klanten'}`;

    return `Dit bestand bevat ${komt}.\n\n`
        + `Importeren vervangt wat er nu in deze browser staat: ${staat}. `
        + 'Dat kan niet ongedaan worden gemaakt.'
        + (nieuw.versleuteld
            ? '\n\nHet bestand is versleuteld; na het importeren heb je de wachtwoordzin '
              + 'van dít bestand nodig om je klanten en documenten te zien.'
            : '')
        + '\n\nDoorgaan?';
};

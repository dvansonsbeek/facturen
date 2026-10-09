import { BewaardDocument } from "@/lib/documents";
import { schemeOf, chargesVat, VAT_SCHEMES } from "@/lib/vat-schemes";
import { summariseDocument } from "@/lib/utils";
import { Invoice } from "@/types";

/**
 * Het archief als CSV, voor je boekhouder.
 *
 * Dit is het enige antwoord dat deze app kán geven op "koppeling met de
 * boekhouding". Een echte koppeling vraagt een server en daarmee een verwerker,
 * en dat is precies wat hier niet bestaat. Een bestand dat je zelf doorstuurt
 * vraagt niemand om toestemming en laat je gegevens in je eigen hand.
 *
 * Het archief had alleen Export, en dat is een reservekopie: JSON, bedoeld om
 * terug te zetten, niet om te lezen. Terwijl de voorwaardenpagina zegt dat je
 * zeven jaar moet bewaren, en wie zeven jaar bewaart, wordt er ooit naar
 * gevraagd.
 */

/** Wat er in de kop staat, en in deze volgorde. */
const KOLOMMEN = [
    'Soort', 'Nummer', 'Datum', 'Klant', 'Land', 'Btw-behandeling',
    'Subtotaal', 'Korting', 'Btw 21%', 'Btw 9%', 'Btw 0%', 'Totaal',
] as const;

/**
 * Puntkomma en geen komma, en een komma als decimaalteken.
 *
 * Nederlandstalige Excel verwacht het zo. Een bestand met komma's als scheiding
 * en punten als decimaalteken belandt daar in één kolom, en dan is het voor de
 * ontvanger geen overzicht maar werk.
 */
const SCHEIDING = ';';

/** Een bedrag zoals een Nederlandse spreadsheet het leest: 1234,56. */
const bedrag = (n: number): string => n.toFixed(2).replace('.', ',');

/**
 * Eén veld, veilig tussen aanhalingstekens als dat nodig is.
 *
 * Een klantnaam mag alles bevatten, inclusief de puntkomma waarmee we scheiden.
 * Zonder dit schuift zo'n naam de rest van de regel een kolom op.
 */
const veld = (waarde: string): string =>
    /[";\r\n]/.test(waarde) ? `"${waarde.replace(/"/g, '""')}"` : waarde;

/**
 * Hoe een bewaard document in de tabel komt te staan.
 *
 * Een creditfactuur krijgt hier wél een minteken, anders dan op papier. Dat is
 * geen tegenspraak maar een ander publiek: op een document leest een mens dat
 * er "Te crediteren" boven staat, in een kolom telt een spreadsheet op. Zonder
 * minteken klopt de som niet, en optellen is het enige wat je met zo'n bestand
 * doet. De kolom Soort zegt er nog steeds bij wat het is.
 */
const regel = (bewaard: BewaardDocument): string => {
    const doc = bewaard.document;
    const scheme = schemeOf(doc);
    const { subtotal, discount, vatTotals, total } =
        summariseDocument(doc.items, !chargesVat(scheme), doc.discount);

    const credit = !!(doc as Invoice).creditOf;
    const teken = credit ? -1 : 1;
    const soort = bewaard.soort === 'offerte'
        ? 'Offerte'
        : credit ? 'Creditfactuur' : 'Factuur';

    return [
        soort,
        bewaard.nummer,
        bewaard.datum,
        bewaard.klant,
        doc.client.country?.trim() || 'Nederland',
        VAT_SCHEMES[scheme].label.split(' — ')[0],
        bedrag(subtotal * teken),
        bedrag(discount * teken),
        bedrag((vatTotals[21] ?? 0) * teken),
        bedrag((vatTotals[9] ?? 0) * teken),
        bedrag((vatTotals[0] ?? 0) * teken),
        bedrag(total * teken),
    ].map(veld).join(SCHEIDING);
};

/**
 * De hele tabel, met kop.
 *
 * Een BOM vooraan, en dat is geen bijgeloof: zonder die drie bytes leest Excel
 * het bestand als Latin-1 en wordt "Müller GmbH" tot "MÃ¼ller GmbH". Regels
 * eindigen op CRLF, want dat is wat RFC 4180 zegt en wat Excel het liefst heeft.
 */
export const documentenAlsCsv = (documenten: readonly BewaardDocument[]): string =>
    `﻿${[KOLOMMEN.join(SCHEIDING), ...documenten.map(regel)].join('\r\n')}\r\n`;

/** Bijvoorbeeld facturen_2026-10-09.csv. */
export const csvBestandsnaam = (vandaag = new Date()): string =>
    `facturen_${vandaag.toISOString().slice(0, 10)}.csv`;

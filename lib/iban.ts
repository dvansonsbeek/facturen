/**
 * Controleert een IBAN op zijn eigen controlegetal.
 *
 * ## Waarom dit er moet zijn
 *
 * Een rekeningnummer staat op elke factuur en gaat sinds kort ook in een
 * betaal-QR. De app nam tot nu toe elke reeks tekens aan: `formatIban` zette
 * alleen spaties om de vier. Een tikfout leverde daarmee gewoon een
 * betaalopdracht op.
 *
 * Meestal valt dat mee — een verkeerd nummer bestaat niet en de overschrijving
 * mislukt. Maar niet altijd: er is een kans dat een tikfout een geldig nummer
 * oplevert dat van iemand anders is, en dan gaat het geld daarheen. Precies
 * daarvoor zit er een controlegetal in een IBAN, en dat niet nakijken is het
 * weggooien van de enige bescherming die het formaat zelf biedt.
 *
 * ## Hoe de controle werkt (ISO 13616 / ISO 7064 MOD-97-10)
 *
 * Verplaats de eerste vier tekens naar het eind, vervang elke letter door haar
 * positie in het alfabet plus negen (A=10 … Z=35), en lees het geheel als één
 * groot getal. Deelt dat getal door 97 met rest 1, dan klopt het nummer.
 *
 * Het getal is te groot voor een gewone JavaScript-number, dus de rest wordt in
 * stukjes berekend. Geen BigInt: dat werkt ook, maar stukjes zijn hier even
 * duidelijk en sneller.
 *
 * Wat dit wél vangt: vrijwel elke tikfout van één teken en vrijwel elke
 * verwisseling van twee tekens. Wat dit níet kan: zien of het nummer van jóu is.
 * Daarvoor bestaat een naam-nummercontrole bij de bank, en die vraagt een
 * server — zie de uitleg bij de betaal-QR.
 */

/** Lengte per land. Alleen wat een Nederlandse kleine ondernemer tegenkomt. */
const LENGTES: Record<string, number> = {
    NL: 18, BE: 16, DE: 22, FR: 27, LU: 20, AT: 20, ES: 24, IT: 27, PT: 25,
    IE: 22, DK: 18, SE: 24, FI: 18, PL: 28, CZ: 24, SK: 24, SI: 19, HU: 28,
    RO: 24, BG: 22, HR: 21, GR: 27, EE: 20, LV: 21, LT: 20, CY: 28, MT: 31,
    GB: 22, CH: 21, NO: 15,
};

export type IbanOordeel =
    | { ok: true; genormaliseerd: string }
    | { ok: false; reden: string };

/** Zonder spaties en in hoofdletters; zo wordt een IBAN gerekend en bewaard. */
export const normaliseerIban = (iban: string): string =>
    iban.replace(/\s+/g, '').toUpperCase();

/** De rest bij deling door 97, in stukjes omdat het getal niet in een number past. */
const mod97 = (cijfers: string): number => {
    let rest = 0;
    for (const teken of cijfers) {
        rest = (rest * 10 + Number(teken)) % 97;
    }
    return rest;
};

/**
 * Keurt een IBAN.
 *
 * Een leeg veld is geen fout: je mag een factuur maken zonder rekeningnummer,
 * bijvoorbeeld bij contante betaling. Dan is er alleen geen betaal-QR.
 */
export const keurIban = (ruw: string): IbanOordeel => {
    const iban = normaliseerIban(ruw);
    if (!iban) return { ok: false, reden: 'leeg' };

    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(iban)) {
        return {
            ok: false,
            reden: 'een IBAN begint met twee letters en twee cijfers, daarna letters en cijfers',
        };
    }

    const land = iban.slice(0, 2);
    const verwacht = LENGTES[land];
    if (verwacht === undefined) {
        return { ok: false, reden: `${land} is geen land dat deze app kent` };
    }
    if (iban.length !== verwacht) {
        return {
            ok: false,
            reden: `een ${land}-IBAN heeft ${verwacht} tekens, dit zijn er ${iban.length}`,
        };
    }

    // Eerste vier tekens naar achteren, letters naar hun getalswaarde.
    const herschikt = iban.slice(4) + iban.slice(0, 4);
    const cijfers = [...herschikt]
        .map((teken) => (/[A-Z]/.test(teken) ? String(teken.charCodeAt(0) - 55) : teken))
        .join('');

    if (mod97(cijfers) !== 1) {
        return {
            ok: false,
            reden: 'het controlegetal klopt niet, waarschijnlijk door een tikfout',
        };
    }

    return { ok: true, genormaliseerd: iban };
};

/** Kort: deugt dit nummer? */
export const isGeldigeIban = (ruw: string): boolean => keurIban(ruw).ok;

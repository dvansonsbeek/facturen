/**
 * De lopende nummers van je facturen en offertes.
 *
 * Een factuur moet een opeenvolgend nummer hebben dat hem eenduidig
 * identificeert (art. 35a Wet OB 1968). Twee facturen met hetzelfde nummer zijn
 * daarmee een echt probleem; een gat in de reeks is hooguit iets om uit te
 * leggen. Daarom onthouden we waar je gebleven was, in plaats van elke keer
 * weer op -001 te beginnen.
 *
 * Let op de grens: dit is één browser op één apparaat. Factureer je ook vanaf
 * een ander apparaat, dan lopen er twee reeksen naast elkaar en kunnen er wél
 * dubbele nummers ontstaan. Zonder server valt dat niet te ondervangen; Export
 * en Import nemen de stand mee als je verhuist.
 */
export interface Numbering {
    jaar: string;
    factuur: string;
    offerte: string;
}

const STORAGE_KEY = 'facturen.nummering';

const currentYear = () => new Date().toISOString().slice(0, 4);

/** Per jaar één vaste referentie, zodat getSnapshot stabiel blijft. */
const defaultsByYear = new Map<string, Numbering>();
const defaultsFor = (jaar: string): Numbering => {
    let defaults = defaultsByYear.get(jaar);
    if (!defaults) {
        defaults = { jaar, factuur: `${jaar}-001`, offerte: `OFF-${jaar}-001` };
        defaultsByYear.set(jaar, defaults);
    }
    return defaults;
};

const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedValue: Numbering | null = null;

const readRaw = (): string | null => {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
};

export const subscribeNumbering = (onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
        listeners.delete(onStoreChange);
    };
};

export const readNumbering = (): Numbering => {
    const jaar = currentYear();
    const raw = readRaw();
    if (raw === cachedRaw && cachedValue?.jaar === jaar) return cachedValue;

    cachedRaw = raw;
    if (raw === null) {
        cachedValue = defaultsFor(jaar);
        return cachedValue;
    }
    try {
        const stored = JSON.parse(raw) as Partial<Numbering>;
        // Een nieuw jaar begint met een nieuwe reeks.
        cachedValue = stored.jaar === jaar
            ? { ...defaultsFor(jaar), ...stored, jaar }
            : defaultsFor(jaar);
    } catch {
        cachedValue = defaultsFor(jaar);
    }
    return cachedValue;
};

export const readServerNumbering = (): Numbering => defaultsFor(currentYear());

export const writeNumbering = (patch: Partial<Omit<Numbering, 'jaar'>>) => {
    const next: Numbering = { ...readNumbering(), ...patch, jaar: currentYear() };
    try {
        const raw = JSON.stringify(next);
        localStorage.setItem(STORAGE_KEY, raw);
        cachedRaw = raw;
    } catch {
        cachedRaw = null;
    }
    cachedValue = next;
    listeners.forEach((listener) => listener());
};

export const clearNumbering = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // niets te wissen
    }
    cachedRaw = null;
    cachedValue = null;
    listeners.forEach((listener) => listener());
};

/**
 * Hoogt de laatste reeks cijfers op en houdt de breedte aan: 2026-007 wordt
 * 2026-008, 2026-099 wordt 2026-100. Werkt daarmee ook als je er zelf een
 * voorvoegsel voor zet of handmatig naar een ander nummer springt. Staat er
 * geen cijfer in, dan blijft het nummer zoals het is.
 */
export const nextNumber = (current: string): string => {
    const match = /^(.*?)(\d+)(\D*)$/.exec(current);
    if (!match) return current;
    const [, head, digits, tail] = match;
    return `${head}${String(Number(digits) + 1).padStart(digits.length, '0')}${tail}`;
};

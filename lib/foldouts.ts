/**
 * Welke secties de gebruiker heeft ingeklapt.
 *
 * Bewust een eigen voorkeur en niet afgeleid van "zijn er al gegevens
 * ingevuld": dat laatste slaat om zodra je het eerste teken typt, waardoor de
 * sectie onder je handen dichtklapt. Een sectie beweegt hier alleen als de
 * gebruiker er zelf op klikt, en die keuze blijft staan na herladen.
 */
export type FoldoutName = 'bedrijfsgegevens' | 'betaalgegevens';

export type FoldoutState = Record<FoldoutName, boolean>;

const STORAGE_KEY = 'facturen.secties';

/** Open bij een eerste bezoek, zodat niemand de velden hoeft te zoeken. */
export const DEFAULT_FOLDOUTS: FoldoutState = {
    bedrijfsgegevens: true,
    betaalgegevens: true,
};

const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedValue: FoldoutState = DEFAULT_FOLDOUTS;

const readRaw = (): string | null => {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
};

export const subscribeFoldouts = (onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
        listeners.delete(onStoreChange);
    };
};

export const readFoldouts = (): FoldoutState => {
    const raw = readRaw();
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    if (raw === null) {
        cachedValue = DEFAULT_FOLDOUTS;
        return cachedValue;
    }
    try {
        cachedValue = { ...DEFAULT_FOLDOUTS, ...(JSON.parse(raw) as Partial<FoldoutState>) };
    } catch {
        cachedValue = DEFAULT_FOLDOUTS;
    }
    return cachedValue;
};

export const readServerFoldouts = (): FoldoutState => DEFAULT_FOLDOUTS;

export const writeFoldout = (name: FoldoutName, open: boolean) => {
    const current = readFoldouts();
    if (current[name] === open) return;

    const next = { ...current, [name]: open };
    try {
        const raw = JSON.stringify(next);
        localStorage.setItem(STORAGE_KEY, raw);
        cachedRaw = raw;
    } catch {
        // Zonder opslag onthouden we het alleen voor deze sessie.
        cachedRaw = null;
    }
    cachedValue = next;
    listeners.forEach((listener) => listener());
};

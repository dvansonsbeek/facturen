import { Sender } from "@/types";

/**
 * De gegevens die bij jou horen in plaats van bij een document: je bedrijf en
 * je betaalgegevens. Ze staan in localStorage, dus op dit apparaat, in deze
 * browser. Er gaat niets naar een server.
 */
export interface CompanySettings {
    sender: Sender;
    bankAccount: string;
    bic: string;
    paymentConditions: string;
}

const STORAGE_KEY = 'facturen.bedrijfsgegevens';

export const DEFAULT_SETTINGS: CompanySettings = {
    sender: {
        name: "UW BEDRIJFSNAAM",
        address: "Adresregel 1",
        zip: "1234 AB",
        city: "Amsterdam",
        country: "Nederland",
        vatNumber: "",
        email: "info@bedrijf.nl",
    },
    bankAccount: "",
    bic: "",
    paymentConditions: "Binnen 14 dagen na factuurdatum.",
};

const listeners = new Set<() => void>();

/**
 * getSnapshot moet bij ongewijzigde opslag steeds dezelfde referentie geven,
 * anders blijft React opnieuw renderen. Daarom onthouden we de ruwe tekst en
 * parsen we alleen als die echt veranderd is.
 */
let cachedRaw: string | null = null;
let cachedValue: CompanySettings = DEFAULT_SETTINGS;

const readRaw = (): string | null => {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        // Privémodus of geblokkeerde site-data: dan werken we zonder opslag.
        return null;
    }
};

const parse = (raw: string): CompanySettings => {
    try {
        const stored = JSON.parse(raw) as Partial<CompanySettings>;
        return {
            ...DEFAULT_SETTINGS,
            ...stored,
            sender: { ...DEFAULT_SETTINGS.sender, ...(stored.sender ?? {}) },
        };
    } catch {
        return DEFAULT_SETTINGS;
    }
};

export const subscribeSettings = (onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    // Een ander tabblad dat opslaat, moet hier ook doorkomen.
    const onStorage = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === null) onStoreChange();
    };
    window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(onStoreChange);
        window.removeEventListener('storage', onStorage);
    };
};

export const readSettings = (): CompanySettings => {
    const raw = readRaw();
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    cachedValue = raw === null ? DEFAULT_SETTINGS : parse(raw);
    return cachedValue;
};

/** De server kent het apparaat niet; die rendert dus de standaardwaarden. */
export const readServerSettings = (): CompanySettings => DEFAULT_SETTINGS;

/** Waar of de laatste opslagpoging mislukte, bijvoorbeeld door een te groot logo. */
let lastWriteFailed = false;
export const didLastWriteFail = () => lastWriteFailed;

export const writeSettings = (patch: Partial<CompanySettings>) => {
    const next: CompanySettings = {
        ...readSettings(),
        ...patch,
        sender: { ...readSettings().sender, ...(patch.sender ?? {}) },
    };

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        lastWriteFailed = false;
    } catch {
        // Meestal een vol quotum: een geüpload logo is een data-URL en kan
        // zo een paar MB zijn. De app blijft werken, alleen onthoudt hij het
        // niet; daarom houden we de waarde wel in het geheugen bij.
        lastWriteFailed = true;
        cachedRaw = null;
        cachedValue = next;
        listeners.forEach((listener) => listener());
        return;
    }

    cachedRaw = JSON.stringify(next);
    cachedValue = next;
    listeners.forEach((listener) => listener());
};

export const clearSettings = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // niets te wissen
    }
    cachedRaw = null;
    cachedValue = DEFAULT_SETTINGS;
    lastWriteFailed = false;
    listeners.forEach((listener) => listener());
};

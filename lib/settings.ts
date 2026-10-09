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
    /**
     * De betaaltermijn als getal, zodat de zin op het document vertaald kan
     * worden. Vrije tekst kan dat niet: die stond in het Nederlands op een
     * Engelse factuur, want het is jouw tekst en de app vertaalt die niet.
     */
    paymentTermDays: number;
    /**
     * Eigen tekst die in plaats van die zin komt, leeg als je hem niet gebruikt.
     *
     * Blijft bestaan omdat een getal niet alles kan zeggen: "vooraf te voldoen",
     * "50% bij opdracht, 50% bij oplevering", "contant bij levering". Dit veld
     * schrappen zou die termijnen stilletjes wegnemen bij de eerstvolgende
     * wijziging. Wat hier staat wordt niet vertaald, en het veld zegt dat erbij.
     */
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
    // Dertig dagen: dat is ook waar de wet op terugvalt als er niets is
    // afgesproken. Wie korter wil, zet het getal lager.
    paymentTermDays: 30,
    paymentConditions: "",
};

/**
 * De oude vrije tekst omzetten naar een getal, zonder iets kwijt te raken.
 *
 * Tot nu toe stond de betaaltermijn als zin in de opslag, standaard "Binnen 14
 * dagen na factuurdatum." en bij veel mensen met een ander getal erin. Wat op
 * dat patroon past wordt het getal; al het andere blijft staan als eigen tekst,
 * want dat is een termijn die een getal niet kan uitdrukken.
 *
 * Hier en niet in de opslag: net als bij `schemeOf()` voor het btw-regime
 * gebeurt de migratie bij het lezen, zodat er niets herschreven wordt wat
 * iemand ooit heeft bewaard.
 */
const DAGEN_UIT_ZIN = /^\s*binnen\s+(\d{1,3})\s+dagen\s+na\s+factuurdatum\s*\.?\s*$/i;

export const uitOudeBetaaltermijn = (
    // Alleen de twee velden die hier gelezen worden, zodat dit ook werkt op een
    // ingelezen back-upbestand: dat heeft een losser type voor de rest.
    stored: { paymentTermDays?: number; paymentConditions?: string },
): Pick<CompanySettings, 'paymentTermDays' | 'paymentConditions'> => {
    // Al omgezet: dan telt wat er staat.
    if (typeof stored.paymentTermDays === 'number') {
        return {
            paymentTermDays: stored.paymentTermDays,
            paymentConditions: stored.paymentConditions ?? '',
        };
    }
    const tekst = stored.paymentConditions;
    if (typeof tekst !== 'string' || tekst.trim() === '') return {
        paymentTermDays: DEFAULT_SETTINGS.paymentTermDays,
        paymentConditions: '',
    };

    const match = DAGEN_UIT_ZIN.exec(tekst);
    return match
        ? { paymentTermDays: Number(match[1]), paymentConditions: '' }
        : { paymentTermDays: DEFAULT_SETTINGS.paymentTermDays, paymentConditions: tekst };
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
            // Na de spreiding, want dit overschrijft wat er uit de opslag komt.
            ...uitOudeBetaaltermijn(stored),
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

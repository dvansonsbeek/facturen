import { Client } from "@/types";
import { generateId } from "@/lib/utils";

/**
 * Het klantenboek: de klanten die je bewaart om ze niet elke keer opnieuw te
 * hoeven typen. Staat in localStorage, op dit apparaat.
 *
 * Let op het onderscheid: dit boek is van jou, maar de klant *op een document*
 * is een kopie die je eruit kiest. Een adres dat je voor één factuur aanpast
 * verandert de bewaarde klant dus niet; daar is Opslaan voor.
 */
export interface SavedClient extends Client {
    id: string;
}

const STORAGE_KEY = 'facturen.klanten';

export const NO_CLIENTS: SavedClient[] = [];

const listeners = new Set<() => void>();

let cachedRaw: string | null = null;
let cachedValue: SavedClient[] = NO_CLIENTS;

const readRaw = (): string | null => {
    try {
        return localStorage.getItem(STORAGE_KEY);
    } catch {
        return null;
    }
};

const byName = (a: SavedClient, b: SavedClient) =>
    a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' });

export const subscribeClients = (onStoreChange: () => void) => {
    listeners.add(onStoreChange);
    return () => {
        listeners.delete(onStoreChange);
    };
};

export const readClients = (): SavedClient[] => {
    const raw = readRaw();
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    if (raw === null) {
        cachedValue = NO_CLIENTS;
        return cachedValue;
    }
    try {
        const parsed = JSON.parse(raw);
        cachedValue = Array.isArray(parsed)
            ? (parsed as SavedClient[]).filter(c => c && typeof c.id === 'string').sort(byName)
            : NO_CLIENTS;
    } catch {
        cachedValue = NO_CLIENTS;
    }
    return cachedValue;
};

export const readServerClients = (): SavedClient[] => NO_CLIENTS;

const persist = (next: SavedClient[]) => {
    const sorted = [...next].sort(byName);
    try {
        const raw = JSON.stringify(sorted);
        localStorage.setItem(STORAGE_KEY, raw);
        cachedRaw = raw;
    } catch {
        cachedRaw = null;
    }
    cachedValue = sorted;
    listeners.forEach((listener) => listener());
    return sorted;
};

/**
 * Bewaart de klant onder zijn naam: bestaat die naam al, dan wordt die klant
 * bijgewerkt, anders komt er een nieuwe bij. Geeft de bewaarde klant terug.
 */
export const saveClient = (client: Client): SavedClient => {
    const existing = findClientByName(client.name);
    const saved: SavedClient = { ...client, id: existing?.id ?? generateId() };
    const rest = readClients().filter(c => c.id !== saved.id);
    persist([...rest, saved]);
    return saved;
};

export const deleteClient = (id: string) => {
    persist(readClients().filter(c => c.id !== id));
};

/** Voor import: vervangt het hele boek. */
export const replaceClients = (list: SavedClient[]) => {
    persist(list.filter(c => c && typeof c.name === 'string').map(c => ({ ...c, id: c.id ?? generateId() })));
};

export const clearClients = () => {
    try {
        localStorage.removeItem(STORAGE_KEY);
    } catch {
        // niets te wissen
    }
    cachedRaw = null;
    cachedValue = NO_CLIENTS;
    listeners.forEach((listener) => listener());
};

export const findClientByName = (name: string): SavedClient | undefined => {
    const needle = name.trim().toLowerCase();
    if (!needle) return undefined;
    return readClients().find(c => c.name.trim().toLowerCase() === needle);
};

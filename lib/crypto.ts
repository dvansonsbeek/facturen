/**
 * Versleuteling van het documentarchief met een wachtwoordzin.
 *
 * ## Wat dit beschermt, en wat niet
 *
 * Beschermd: wat er **op de schijf** staat. Zonder je wachtwoordzin is het
 * archief een berg ruis. Wie bij je browserprofiel kan — een andere gebruiker
 * van hetzelfde apparaat, een beheerder, iemand die de laptop meeneemt, een
 * back-up van de schijf — ziet geen klantnamen, adressen of bedragen meer.
 *
 * Niet beschermd: een **ontgrendelde sessie**. Zodra je de zin hebt ingevoerd
 * staat de sleutel in het geheugen van deze pagina en is het archief leesbaar.
 * Code die op dat moment in de pagina draait, kan dus mee. Daar helpt geen
 * versleuteling tegen; daar helpt de Content-Security-Policy tegen (lib/csp.ts),
 * die geïnjecteerde scripts tegenhoudt en bovendien verhindert dat er iets de
 * deur uit gaat. Een kwaadwillende browserextensie staat buiten dat beleid en
 * blijft een gat dat een webpagina niet kan dichten.
 *
 * Kortom: dit verplaatst het risico van "iedereen met toegang tot dit apparaat"
 * naar "iemand die meekijkt terwijl je ermee werkt". Dat is een echte winst, en
 * het is geen volledige beveiliging. Zeg het zo tegen de gebruiker.
 *
 * ## Keuzes
 *
 * AES-256-GCM, want dat is versleuteling mét integriteitscontrole: een gewijzigd
 * of beschadigd record mislukt bij het ontsleutelen in plaats van onzin op te
 * leveren. Elk record krijgt een eigen toevalsgetal (IV) van 12 bytes — twee
 * keer dezelfde IV onder dezelfde sleutel breekt GCM volledig, en 12 bytes is
 * de maat waarvoor GCM is ontworpen.
 *
 * De sleutel komt uit PBKDF2-HMAC-SHA-256. Niet omdat het de beste keuze is —
 * Argon2id is beter tegen kraken met grafische kaarten — maar omdat PBKDF2 het
 * enige langzame afleidingsalgoritme is dat de browser zelf aanbiedt. Argon2
 * zou een bibliotheek van ruim 100 kB WebAssembly kosten, en dit blijft een
 * app zonder server die in één keer binnen moet komen.
 *
 * Het aantal ronden en de zoutwaarde staan **in het bestand**, niet hier
 * hardgecodeerd. Zo blijft een archief van vorig jaar leesbaar als het aantal
 * ronden omhoog gaat; dat gebeurt, want apparaten worden sneller.
 *
 * De sleutel wordt nooit bewaard. Hij is `extractable: false`, dus zelfs deze
 * code kan hem niet uitlezen, en hij staat alleen in het geheugen van deze
 * pagina: na herladen voer je de zin opnieuw in. Hem opslaan zou het hele punt
 * wegnemen — dan kan iedereen met toegang tot het apparaat er weer bij.
 */

/** OWASP-richtlijn (2024) voor PBKDF2-HMAC-SHA-256. */
export const RONDEN = 600_000;

/** De vorm waarin een versleuteld blok op schijf staat. */
export interface Versleuteld {
    /** Altijd 1 voorlopig; een latere wijziging van de opzet kan hieraan hangen. */
    v: 1;
    iv: number[];
    data: number[];
}

/** Wat er nodig is om de sleutel opnieuw af te leiden, naast de wachtwoordzin. */
export interface SleutelKop {
    zout: number[];
    ronden: number;
}

const codeer = new TextEncoder();
const decodeer = new TextDecoder();

export const nieuweKop = (): SleutelKop => ({
    zout: [...crypto.getRandomValues(new Uint8Array(16))],
    ronden: RONDEN,
});

/**
 * Leidt de sleutel af uit de wachtwoordzin. Duurt met opzet merkbaar lang —
 * dat is precies wat het kraken van een gestolen archief duur maakt.
 */
export const leidSleutelAf = async (zin: string, kop: SleutelKop): Promise<CryptoKey> => {
    const basis = await crypto.subtle.importKey(
        'raw', codeer.encode(zin), 'PBKDF2', false, ['deriveKey'],
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: new Uint8Array(kop.zout),
            iterations: kop.ronden,
            hash: 'SHA-256',
        },
        basis,
        { name: 'AES-GCM', length: 256 },
        // Niet uitleesbaar: deze sleutel kan alleen gebruikt worden, niet
        // gekopieerd — ook niet door deze code.
        false,
        ['encrypt', 'decrypt'],
    );
};

export const versleutel = async (sleutel: CryptoKey, waarde: unknown): Promise<Versleuteld> => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        sleutel,
        codeer.encode(JSON.stringify(waarde)),
    );
    // Als gewone getallenlijsten, zodat structuredClone en JSON.stringify
    // (Export) er zonder omwegen mee omgaan.
    return { v: 1, iv: [...iv], data: [...new Uint8Array(data)] };
};

/**
 * Ontsleutelt een blok. Geeft null bij de verkeerde wachtwoordzin of bij
 * gewijzigde gegevens: GCM merkt dat verschil zelf, en we willen geen onzin
 * doorgeven alsof het een document was.
 */
export const ontsleutel = async <T>(sleutel: CryptoKey, blok: Versleuteld): Promise<T | null> => {
    try {
        const klaar = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(blok.iv) },
            sleutel,
            new Uint8Array(blok.data),
        );
        return JSON.parse(decodeer.decode(klaar)) as T;
    } catch {
        return null;
    }
};

export const isVersleuteld = (waarde: unknown): waarde is Versleuteld =>
    typeof waarde === 'object' && waarde !== null
    && (waarde as Versleuteld).v === 1
    && Array.isArray((waarde as Versleuteld).iv)
    && Array.isArray((waarde as Versleuteld).data);

import type { Discount } from "@/types";

export const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('nl-BE', {
        style: 'currency',
        currency: 'EUR',
    }).format(amount);
};

/**
 * Rondt af op hele centen, een halve cent van nul af.
 *
 * Bedragen op een factuur zijn centen, geen kommagetallen. Zonder afronden bij
 * elke stap worden de btw-regels wel afgerond getoond maar ongerond opgeteld,
 * en dan telt wat er op het document staat niet op tot het totaal eronder.
 */
export const roundToCents = (amount: number): number => {
    const cents = amount * 100;
    return (cents < 0 ? -Math.round(-cents) : Math.round(cents)) / 100;
};

/** Het regelbedrag exclusief btw, afgerond op centen. */
export const lineTotal = (item: { quantity: number; unitPrice: number }): number =>
    roundToCents(item.quantity * item.unitPrice);

export const calculateSubtotal = (items: { quantity: number; unitPrice: number }[]): number => {
    return roundToCents(items.reduce((acc, item) => acc + lineTotal(item), 0));
};

/**
 * De btw per tarief.
 *
 * De btw wordt per tarief over de hele grondslag berekend en pas daarna
 * afgerond, niet per regel: dat is hoe een btw-aangifte het ook doet, en het
 * scheelt afrondingsverschillen bij veel regels onder hetzelfde tarief.
 */
export const calculateVat = (items: { quantity: number; unitPrice: number; vatRate: number }[]): { [rate: number]: number } => {
    const baseByRate = items.reduce((acc, item) => {
        acc[item.vatRate] = (acc[item.vatRate] || 0) + lineTotal(item);
        return acc;
    }, {} as { [rate: number]: number });

    const vatByRate: { [rate: number]: number } = {};
    for (const [rate, base] of Object.entries(baseByRate)) {
        vatByRate[Number(rate)] = roundToCents((base * Number(rate)) / 100);
    }
    return vatByRate;
};

export const calculateTotal = (items: { quantity: number; unitPrice: number; vatRate: number }[]): number => {
    const subtotal = calculateSubtotal(items);
    const vatTotals = calculateVat(items);
    const vatSum = Object.values(vatTotals).reduce((a, b) => a + b, 0);
    return roundToCents(subtotal + vatSum);
};

export const generateId = () => Math.random().toString(36).substr(2, 9);

/**
 * Zet een ISO-datum (2026-10-04) om naar Nederlandse notatie (04-10-2026).
 *
 * Bewust met tekstbewerking en niet via Date of Intl: new Date('2026-10-04')
 * leest de datum als middernacht UTC, en in een tijdzone achter UTC levert
 * formatteren dan de dag ervoor op. Een factuur met de verkeerde datum is
 * precies wat je niet wilt. Wat niet op een ISO-datum lijkt, blijft ongemoeid.
 */
export const formatDate = (isoDate: string): string => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
    if (!match) return isoDate;
    const [, year, month, day] = match;
    return `${day}-${month}-${year}`;
};

/**
 * De datum van de levering of dienst, als die op het document hoort te staan.
 *
 * Art. 35a lid 1 Wet OB 1968 wil die datum op de factuur "voor zover die datum
 * vastgesteld en verschillend is van de uitreikingsdatum" — dus precies wanneer
 * hij afwijkt. Is hij gelijk aan de factuurdatum, dan voegt hij niets toe en
 * laten we hem weg.
 *
 * Staat hier en niet in de twee renderers, zodat het voorbeeld en de PDF niet
 * elk hun eigen versie van die regel krijgen.
 */
export const supplyDateOnDocument = (
    data: { date: string; deliveryDate?: string },
): string | null => {
    const geleverd = (data.deliveryDate ?? '').trim();
    return geleverd && geleverd !== data.date ? geleverd : null;
};

/**
 * De verwijzing naar de factuur die wordt teruggedraaid, of null.
 *
 * Een creditfactuur moet duidelijk en ondubbelzinnig naar het oorspronkelijke
 * stuk verwijzen, anders is bij een controle niet vast te stellen wát er
 * gecorrigeerd is. Nummer én datum dus.
 *
 * Staat hier zodat het voorbeeld, de PDF en de e-factuur dezelfde zin gebruiken.
 */
export const creditReference = (
    data: { creditOf?: { number: string; date: string } },
): string | null =>
    data.creditOf
        ? `Creditfactuur bij factuur ${data.creditOf.number} van ${formatDate(data.creditOf.date)}.`
        : null;

/** Voorbeeldnotatie van een Nederlandse IBAN: 18 tekens, in blokken van vier. */
export const IBAN_PLACEHOLDER = 'NLxx XXXX XXXX XXXX XX';

/**
 * Groepeert een IBAN in blokken van vier.
 *
 * In het invoerveld mag iemand typen wat hij wil, met of zonder spaties. Op het
 * document hoort het rekeningnummer leesbaar te staan, want daar schrijft de
 * ontvanger het van over.
 */
export const formatIban = (iban: string): string =>
    iban.replace(/\s+/g, '').toUpperCase().replace(/(.{4})/g, '$1 ').trim();

/**
 * De btw-opstelling van een document.
 *
 * Onder de kleineondernemersregeling mag er geen btw op de factuur staan: geen
 * tarieven, geen bedragen. Dat is iets anders dan het 0%-tarief, dat wel een
 * tarief is. Zowel het scherm als de PDF leiden hun opstelling hiervan af,
 * zodat beide dezelfde regel volgen.
 */
/**
 * De korting in euro's, hoe hij ook is ingevuld.
 *
 * Begrensd op het subtotaal: meer korting dan er te betalen valt bestaat niet.
 * Een document dat geld de andere kant op stuurt is een creditfactuur, en dat
 * is een eigen documentsoort met een eigen verwijzing naar het origineel.
 */
export const discountAmount = (subtotal: number, discount?: Discount): number => {
    if (!discount || subtotal <= 0) return 0;

    const ruw = discount.soort === 'procent'
        ? (subtotal * Math.min(Math.max(discount.waarde, 0), 100)) / 100
        : Math.max(discount.waarde, 0);

    return roundToCents(Math.min(ruw, subtotal));
};

/**
 * De grondslag per tarief ná korting, zó verdeeld dat de som exact klopt.
 *
 * Dit is het lastige stukje van een korting op het totaal. Staan er regels van
 * 21% en 9% op, dan moet de korting naar verhouding over allebei worden
 * verdeeld — anders klopt de btw niet. Maar elk deel apart afronden levert
 * centen verschil op, en dan telt wat er op het document staat niet meer op tot
 * het totaal eronder. Precies de fout waar roundToCents hierboven voor bestaat.
 *
 * Daarom krijgt het grootste tarief het restant: alle andere worden afgerond,
 * en wat er dan nog mist of over is gaat naar de grootste grondslag. Daar is de
 * verhoudingsgewijze afwijking het kleinst, en de som klopt op de cent.
 */
const grondslagNaKorting = (
    baseByRate: { [rate: number]: number },
    korting: number,
    subtotal: number,
): { [rate: number]: number } => {
    const tarieven = Object.keys(baseByRate).map(Number);
    if (korting <= 0 || subtotal <= 0) return { ...baseByRate };

    const doel = roundToCents(subtotal - korting);
    const factor = doel / subtotal;

    // Het tarief met de grootste grondslag vangt het afrondingsrestje op.
    const grootste = tarieven.reduce((a, b) => (baseByRate[b] > baseByRate[a] ? b : a));

    const uit: { [rate: number]: number } = {};
    let toegekend = 0;
    for (const tarief of tarieven) {
        if (tarief === grootste) continue;
        uit[tarief] = roundToCents(baseByRate[tarief] * factor);
        toegekend = roundToCents(toegekend + uit[tarief]);
    }
    uit[grootste] = roundToCents(doel - toegekend);

    return uit;
};

export const summariseDocument = (
    items: { quantity: number; unitPrice: number; vatRate: number }[],
    isVatExempt: boolean,
    discount?: Discount,
): {
    subtotal: number;
    /** De korting in euro's; 0 als er geen is. */
    discount: number;
    /**
     * De grondslag per tarief ná korting.
     *
     * Staat hier omdat de e-factuur hem nodig heeft: EN 16931 wil de korting per
     * btw-categorie opgesplitst, en de belastbare bedragen moeten daarmee
     * overeenkomen. Hem daar opnieuw uitrekenen zou betekenen dat twee plekken
     * dezelfde verdeling doen — precies hoe papier en XML uit elkaar lopen.
     */
    vatBases: { [rate: number]: number };
    vatTotals: { [rate: number]: number };
    total: number;
} => {
    const subtotal = calculateSubtotal(items);
    const korting = discountAmount(subtotal, discount);
    const naKorting = roundToCents(subtotal - korting);

    const baseByRate = items.reduce((acc, item) => {
        acc[item.vatRate] = roundToCents((acc[item.vatRate] || 0) + lineTotal(item));
        return acc;
    }, {} as { [rate: number]: number });

    const verlaagd = grondslagNaKorting(baseByRate, korting, subtotal);

    if (isVatExempt) {
        return {
            subtotal, discount: korting, vatBases: verlaagd, vatTotals: {}, total: naKorting,
        };
    }

    const vatTotals: { [rate: number]: number } = {};
    for (const [tarief, grondslag] of Object.entries(verlaagd)) {
        vatTotals[Number(tarief)] = roundToCents((grondslag * Number(tarief)) / 100);
    }

    const btw = Object.values(vatTotals).reduce((a, b) => roundToCents(a + b), 0);
    return {
        subtotal,
        discount: korting,
        vatBases: verlaagd,
        vatTotals,
        total: roundToCents(naKorting + btw),
    };
};

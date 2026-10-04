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
export const summariseDocument = (
    items: { quantity: number; unitPrice: number; vatRate: number }[],
    isVatExempt: boolean,
): { subtotal: number; vatTotals: { [rate: number]: number }; total: number } => {
    const subtotal = calculateSubtotal(items);
    return {
        subtotal,
        vatTotals: isVatExempt ? {} : calculateVat(items),
        total: isVatExempt ? subtotal : calculateTotal(items),
    };
};

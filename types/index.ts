export interface Client {
  name: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  vatNumber?: string;
  email?: string;
}

export interface LineItem {
  id: string;
  name?: string; // Optionele naam/titel
  description: string;
  quantity: number;
  /**
   * Waarin je telt: uur, stuk, dag, km, maand. Vrij in te vullen, want niemand
   * kent alle eenheden. Leeg laten mag: dan is het een vast bedrag.
   */
  unit?: string;
  unitPrice: number;
  vatRate: number; // e.g. 21, 9, 0
}

export interface Sender {
  name: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  vatNumber: string;
  kvkNumber?: string;
  email: string;
  logoUrl?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  date: string;
  sender: Sender;
  client: Client;
  items: LineItem[];
  isVatExempt: boolean;
  notes?: string;
  paymentConditions?: string;
  bankAccount?: string;
  bic?: string;
}

/**
 * Een factuur kent geen vervaldatum: de betaaltermijn staat in
 * paymentConditions. Twee losse velden konden elkaar tegenspreken, en wettelijk
 * (art. 35a Wet OB 1968) is alleen de factuurdatum verplicht.
 */
export interface Quotation extends Omit<Invoice, 'invoiceNumber'> {
  quotationNumber: string;
  validUntil: string;
}

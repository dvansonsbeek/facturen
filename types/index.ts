/**
 * De btw-behandeling van een document. Wat elk regime betekent, welke
 * vermelding erbij hoort en welke UBL-categorie het krijgt, staat in
 * lib/vat-schemes.ts; hier alleen de namen, zodat types de bladmodule blijft.
 */
export type VatScheme = 'normaal' | 'kor' | 'verlegd' | 'icp' | 'export' | 'nultarief';

export interface Client {
  name: string;
  address: string;
  zip: string;
  city: string;
  country: string;
  vatNumber?: string;
  email?: string;
  /**
   * Het KvK-nummer van de klant. Alleen nodig voor de e-factuur, waar het het
   * adres is waarop je klant over Peppol bereikbaar is. Optioneel: een
   * buitenlandse klant of een particulier heeft er geen, en zonder blijft het
   * bestand gewoon geldig om zelf aan te leveren.
   */
  kvkNumber?: string;
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
  /**
   * De btw-behandeling van dit document; zie lib/vat-schemes.ts. Bepaalt of er
   * btw gerekend wordt, welke vermelding op het document hoort en welke
   * UBL-categorie de e-factuur krijgt.
   */
  vatScheme?: VatScheme;
  /**
   * Alleen nog voor documenten van vóór `vatScheme`: waar betekende het KOR.
   *
   * Bewaarde documenten staan vast en worden nooit herschreven, dus dit veld
   * blijft bestaan zolang er records uit die tijd liggen. Lees het niet
   * rechtstreeks — `schemeOf()` doet dat, en dan heb je maar één bron.
   */
  isVatExempt?: boolean;
  notes?: string;
  paymentConditions?: string;
  bankAccount?: string;
  bic?: string;
  /**
   * De referentie waarmee de klant deze factuur in zijn eigen administratie
   * terugvindt: een inkoopordernummer, een kostenplaats, een projectcode.
   *
   * Alleen nodig voor de e-factuur (lib/ubl.ts), waar NLCIUS hem verplicht
   * stelt. Hij staat niet op de PDF en niet in het voorbeeld: op papier leest
   * een mens de factuur, en daar hoort dit soort verwerkingsinformatie niet.
   */
  buyerReference?: string;
  /**
   * Wanneer er geleverd is, als dat niet de factuurdatum is.
   *
   * Alleen van belang bij een intracommunautaire levering: BR-IC-11 wil die
   * datum (of een factuurperiode) in de e-factuur. Staat hij leeg, dan neemt
   * de e-factuur de factuurdatum. Het veld staat daarom ook alleen in het
   * formulier als dat regime gekozen is.
   */
  deliveryDate?: string;
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

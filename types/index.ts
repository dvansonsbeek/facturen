/**
 * De btw-behandeling van een document. Wat elk regime betekent, welke
 * vermelding erbij hoort en welke UBL-categorie het krijgt, staat in
 * lib/vat-schemes.ts; hier alleen de namen, zodat types de bladmodule blijft.
 *
 * `nultarief` is niet meer te kiezen, maar staat er nog: zie VAT_SCHEMES. Een
 * bewaard document met die waarde moet blijven renderen zoals het is uitgereikt.
 */
export type VatScheme =
  | 'normaal' | 'kor' | 'verlegd' | 'icp' | 'export' | 'dienst-buiten-eu' | 'nultarief';

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

/**
 * Een korting over het hele document.
 *
 * Twee vormen, omdat beide gewoon voorkomen: een vast bedrag ("€ 50 eraf") en
 * een percentage ("10% korting"). Het percentage rekent over het subtotaal
 * exclusief btw — over het bedrag mét btw rekenen zou de btw zelf verlagen, en
 * dat is niet wat een korting doet.
 */
export interface Discount {
  soort: 'bedrag' | 'procent';
  waarde: number;
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
   * De datum waarop de levering of de dienst heeft plaatsgevonden.
   *
   * Art. 35a lid 1 Wet OB 1968 wil die datum op de factuur zodra hij vaststaat
   * én afwijkt van de factuurdatum — wat normaal is als je achteraf factureert.
   * Daarom staat hij op het document, maar alleen als hij echt afwijkt: gelijk
   * aan de factuurdatum is het ruis.
   *
   * Bij een intracommunautaire levering eist de e-factuur hem ook (BR-IC-11);
   * leeg laten betekent daar dat de factuurdatum wordt genomen.
   */
  deliveryDate?: string;
  /**
   * Korting over het hele document.
   *
   * Op het totaal en niet per regel, omdat dat is wat er in de praktijk wordt
   * gevraagd: "€ 50 eraf omdat het uitliep" of "10% introductiekorting", niet
   * een andere prijs per post.
   *
   * Dat heeft wel een gevolg voor de btw. Staan er regels met verschillende
   * tarieven op, dan moet de korting naar verhouding over die tarieven worden
   * verdeeld — anders tellen de btw-regels op het document niet op tot het
   * totaal eronder. Zie `summariseDocument` in lib/utils.ts.
   */
  discount?: Discount;
  /**
   * De factuur die met dit document wordt teruggedraaid.
   *
   * Staat dit er, dan is het een **creditfactuur**. Een uitgereikte factuur
   * wijzig je niet — hij ligt bij je klant en je aangifte verwijst ernaar — dus
   * corrigeren doe je met een nieuw document dat de oude terugneemt. Dat is ook
   * de reden dat het archief niets laat bijwerken: dit is het nette alternatief.
   *
   * Nummer én datum, want de verwijzing naar de oorspronkelijke factuur moet
   * duidelijk en ondubbelzinnig zijn; een nummer alleen is dat niet als je
   * reeksen per jaar opnieuw beginnen.
   */
  creditOf?: { number: string; date: string };
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

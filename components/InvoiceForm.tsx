"use client";

import { useState, useSyncExternalStore } from "react";
import { Plus, Download, FileText, FileCode, Briefcase, Upload, Moon, Sun, Trash2, Save } from "lucide-react";
import { Invoice, Quotation, LineItem, Sender, Client, Taal, VatScheme } from "@/types";
import { chargesVat, schemeOf, VAT_SCHEMES, VAT_SCHEME_ORDER } from "@/lib/vat-schemes";
import { TAAL_NAMEN, TAAL_ORDER } from "@/lib/taal";
import { generateId } from "@/lib/utils";
import { subscribeTheme, readTheme, readServerTheme, writeTheme } from "@/lib/theme";
import {
    subscribeSettings, readSettings, readServerSettings, writeSettings, clearSettings,
    didLastWriteFail, uitOudeBetaaltermijn, type CompanySettings,
} from "@/lib/settings";
import { dataUrlBytes, downscaleImage } from "@/lib/image";
import { stampPageNumbers } from "@/lib/page-numbers";
import { buildUblInvoice, ontbrekendeVelden, ublFilename } from "@/lib/ubl";
import { inspecteerBackup, vervangingsVraag } from "@/lib/backup";
import {
    subscribeFoldouts, readFoldouts, readServerFoldouts, writeFoldout,
} from "@/lib/foldouts";
import {
    subscribeClients, readClients, readServerClients, saveClient, deleteClient,
    clearClients, findClientByName, exportClients, importClients, klantenVergrendeld,
    type SavedClient,
} from "@/lib/clients";
import {
    subscribeNumbering, readNumbering, readServerNumbering, writeNumbering,
    clearNumbering, nextNumber,
} from "@/lib/numbering";
import {
    subscribeDocuments, readDocuments, readServerDocuments, bewaarDocument,
    verwijderDocument, replaceDocuments, clearDocuments, exportDocuments, soortLabel,
    type BewaardDocument, type DocumentSoort,
} from "@/lib/documents";
import {
    subscribeKluis, readKluis, readServerKluis, exportKluis, importKluis,
    stelIn, ontgrendel, vergrendel, verwijderZin, vergeetKluis,
} from "@/lib/vault";
import ItemRow from "./ItemRow";
import CompanyDetails from "./form/CompanyDetails";
import PaymentDetails from "./form/PaymentDetails";
import ClientDetails from "./form/ClientDetails";
import DocumentArchive from "./form/DocumentArchive";
import SecurityPanel from "./form/SecurityPanel";
import InvoicePreview from "./InvoicePreview";
// InvoiceDocument wordt bewust niet hierboven geïmporteerd: dat bestand hangt
// aan @react-pdf/renderer, en een gewone import trekt die hele bibliotheek de
// eerste paginalading in. Hij wordt pas opgehaald bij Download PDF.

/**
 * Een document zonder de gegevens die in de instellingen staan. Daardoor kan
 * het niet meer gebeuren dat factuur en offerte elk een eigen, uiteenlopende
 * kopie van je bedrijfsgegevens bijhouden.
 */
type InvoiceDraft = Omit<Invoice, 'sender' | 'bankAccount' | 'bic' | 'paymentConditions' | 'paymentTermDays' | 'invoiceNumber'>;
type QuotationDraft = Omit<Quotation, 'sender' | 'quotationNumber'>;

const emptyClient = (): Client => ({ name: "", address: "", zip: "", city: "", country: "" });

/*
 * Hier stond OFFERTE_STANDAARDTEKST = 'Deze offerte is 30 dagen geldig.', dat
 * als notitie in elke nieuwe offerte werd gezet. Weggehaald, om drie redenen
 * die bij elkaar opgeteld zwaarder wegen dan het gemak ervan:
 *
 * - Het staat er al. Een offerte toont "Geldig tot: 08-11-2026" uit validUntil.
 *   Die zin zei hetzelfde nog eens, in andere woorden.
 * - En kon het tegenspreken. Het getal stond hard in de tekst, dus wie de datum
 *   op twee weken zette, had een offerte die bovenaan 14 november zei en
 *   onderaan "30 dagen geldig". Precies het geval waarvoor er geen los
 *   vervaldatumveld op een factuur zit.
 * - Het werd niet vertaald. Als notitie is het jouw tekst, dus hij bleef
 *   Nederlands op een Engelstalige offerte — dezelfde reden waarom de
 *   betaaltermijn een getal werd.
 *
 * Daarmee verviel ook de vergelijking die nodig was om te weten of een notitie
 * van jou was of van de app; notities zijn nu zonder uitzondering van jou.
 */

/**
 * Alleen de klantvelden overnemen uit het boek. Veld voor veld, zodat het
 * boek-id en eventuele rommel uit een met de hand bewerkt importbestand niet
 * op het document belanden.
 */
const toDocumentClient = (saved: SavedClient): Client => ({
    name: saved.name,
    address: saved.address,
    zip: saved.zip,
    city: saved.city,
    country: saved.country,
    vatNumber: saved.vatNumber,
    kvkNumber: saved.kvkNumber,
    email: saved.email,
});

/**
 * Een lege regel, net als een toegevoegde regel. Stond hier eerder voorbeeldtekst
 * als waarde, dan kon die ongemerkt op een echte factuur belanden; als placeholder
 * kan dat niet.
 */
const defaultItem = (): LineItem => ({
    id: generateId(),
    name: "",
    description: "",
    quantity: 1,
    unitPrice: 0,
    vatRate: 21,
});

/** Suggesties voor het eenheidsveld; de datalist staat één keer in het formulier. */
const UNIT_SUGGESTIONS = ['uur', 'stuk', 'dag', 'km', 'maand', 'woord'];

const getInitialDates = () => {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const validUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    // Jaartal uit dezelfde UTC-datum, zodat nummer en datum rond de jaarwisseling
    // niet uit elkaar lopen door een tijdzoneverschil.
    const year = date.slice(0, 4);
    return { date, validUntil, year };
};

export default function InvoiceForm() {
    const [isQuotation, setIsQuotation] = useState(false);
    // Alleen om te weten welk pictogram het knopje moet tonen. Het thema op
    // <html> zetten gebeurt in components/ThemeApplier.tsx, zodat ook pagina's
    // zonder dit formulier — de voorwaarden — het meekrijgen.
    const theme = useSyncExternalStore(subscribeTheme, readTheme, readServerTheme);

    const toggleTheme = () => {
        writeTheme(theme === 'light' ? 'dark' : 'light');
    };

    // Bedrijfs- en betaalgegevens horen bij jou, niet bij een document: die
    // staan in de instellingen-opslag en overleven dus een herlaadbeurt. De
    // server rendert de standaardwaarden, zodat hydratatie blijft kloppen.
    const settings = useSyncExternalStore(subscribeSettings, readSettings, readServerSettings);

    const [invoice, setInvoice] = useState<InvoiceDraft>(() => {
        const { date } = getInitialDates();
        return {
            id: generateId(),
            date,
            client: emptyClient(),
            items: [defaultItem()],
            // Expliciet en niet via het oude isVatExempt: dat veld is er alleen
            // nog om bewaarde documenten van vóór deze keuze te kunnen lezen.
            vatScheme: 'normaal',
            taal: 'nl',
            notes: "",
        };
    });

    const [quotation, setQuotation] = useState<QuotationDraft>(() => {
        const { date, validUntil } = getInitialDates();
        return {
            id: generateId(),
            date,
            validUntil,
            client: emptyClient(),
            items: [defaultItem()],
            vatScheme: 'normaal',
            taal: 'nl',
            notes: "",
        };
    });

    const draft = isQuotation ? quotation : invoice;

    const foldouts = useSyncExternalStore(subscribeFoldouts, readFoldouts, readServerFoldouts);
    const savedClients = useSyncExternalStore(subscribeClients, readClients, readServerClients);

    // Het documentnummer hoort niet bij één document maar bij je reeks, dus het
    // staat in de opslag en overleeft een herlaadbeurt.
    const numbering = useSyncExternalStore(subscribeNumbering, readNumbering, readServerNumbering);

    // Het archief komt uit IndexedDB en dus asynchroon binnen: de eerste
    // render geeft de lege lijst, net als de server, en de opslag meldt zich
    // zodra hij gelezen is.
    const documenten = useSyncExternalStore(subscribeDocuments, readDocuments, readServerDocuments);

    // Of er een wachtwoordzin staat en of die in deze sessie al is ingevoerd.
    // Geldt voor het archief én het klantenboek: één zin voor alles.
    const kluis = useSyncExternalStore(subscribeKluis, readKluis, readServerKluis);

    // Welke bewaarde klant je uit het boek hebt gekozen. Hoort bij dit document,
    // niet bij het boek, dus die bewaren we niet.
    const [selectedClientId, setSelectedClientId] = useState('');
    const [isEditingClient, setIsEditingClient] = useState(false);
    const [logoWaarschuwing, setLogoWaarschuwing] = useState<string | null>(null);
    /** Terugkoppeling na Bewaren of Dupliceren; null als er niets te melden is. */
    const [bewaarMelding, setBewaarMelding] = useState<string | null>(null);

    // Bij een bewaarde klant zijn de velden ingeklapt: je ziet hem al staan in
    // het voorbeeld. Ze gaan open voor een nieuwe klant, of via Bewerken.
    const clientFieldsVisible = !selectedClientId || isEditingClient;

    // Wat het voorbeeld en de PDF te zien krijgen: het document plus jouw
    // vaste gegevens. Betaalgegevens horen alleen op een factuur.
    const currentData: Invoice | Quotation = isQuotation
        ? { ...quotation, quotationNumber: numbering.offerte, sender: settings.sender }
        : {
            ...invoice,
            invoiceNumber: numbering.factuur,
            sender: settings.sender,
            bankAccount: settings.bankAccount,
            bic: settings.bic,
            paymentTermDays: settings.paymentTermDays,
            paymentConditions: settings.paymentConditions,
        };

    /**
     * Schrijft naar het document dat nu open staat.
     *
     * Factuur en offerte zijn twee aparte documenten met vrijwel dezelfde
     * velden. Zonder deze helper heeft elk veld een eigen tak per documenttype,
     * en dat was de reden dat dit bestand zo groot werd.
     */
    const updateDocument = (
        patch:
            | Partial<InvoiceDraft & QuotationDraft>
            | ((prev: InvoiceDraft | QuotationDraft) => Partial<InvoiceDraft & QuotationDraft>),
    ) => {
        const resolve = (prev: InvoiceDraft | QuotationDraft) =>
            typeof patch === 'function' ? patch(prev) : patch;

        if (isQuotation) setQuotation(prev => ({ ...prev, ...resolve(prev) }));
        else setInvoice(prev => ({ ...prev, ...resolve(prev) }));
    };

    /** Bedrijfsgegevens horen bij jou, dus die gaan naar de instellingen-opslag. */
    const updateSender = (patch: Partial<Sender>) =>
        writeSettings({ sender: { ...settings.sender, ...patch } });

    const updateSettings = (patch: Partial<CompanySettings>) => writeSettings(patch);

    const updateClient = (patch: Partial<Client>) =>
        updateDocument(prev => ({ client: { ...prev.client, ...patch } }));

    const updateItems = (map: (items: LineItem[]) => LineItem[]) =>
        updateDocument(prev => ({ items: map(prev.items) }));

    const documentNumber = isQuotation ? numbering.offerte : numbering.factuur;

    const setDocumentNumber = (value: string) =>
        writeNumbering(isQuotation ? { offerte: value } : { factuur: value });

    /**
     * Zet de reeks op het volgende nummer en maakt het document leeg voor de
     * volgende klus. Bewust een eigen knop en niet gekoppeld aan Download PDF:
     * downloaden is nog geen uitreiken, en wie twee keer downloadt om de opmaak
     * te controleren wil daar geen nummer aan kwijt zijn.
     */
    const handleNextDocument = () => {
        const volgende = nextNumber(documentNumber);
        // Ook de korting en de leverdatum tellen mee. Hiervoor keek dit alleen
        // naar de regels, en dan verdween een ingevulde korting zonder dat er
        // iets gevraagd werd — precies het veld waarvan je het niet merkt.
        const heeftWerk = draft.items.length > 1
            || draft.items.some(item => item.unitPrice > 0)
            || draft.discount !== undefined
            || draft.deliveryDate !== undefined;
        if (heeftWerk && !window.confirm(
            `De regels van dit document worden gewist en het nummer gaat naar ${volgende}. `
            + 'Een ingevulde korting en leverdatum vervallen ook. Doorgaan?',
        )) return;

        writeNumbering(isQuotation ? { offerte: volgende } : { factuur: volgende });
        updateDocument(() => ({
            items: [defaultItem()],
            notes: '',
            date: getInitialDates().date,
            // Een volgend document is een gewone factuur. Bleef dit staan, dan
            // crediteerde je ongemerkt opnieuw dezelfde factuur.
            creditOf: undefined,
            deliveryDate: undefined,
            // En begint zonder korting. Een korting is een afspraak over dít
            // werk, geen vaste instelling; bleef hij staan, dan bracht je
            // volgende maand ongemerkt te weinig in rekening.
            discount: undefined,
            // De taal blijft juist wél staan, en dat is net zo'n bewuste keuze.
            // Deze knop laat de klant staan, en de taal hoort bij die klant:
            // hem terugzetten op Nederlands zou de volgende factuur aan
            // dezelfde Duitse opdrachtgever stilletjes onleesbaar maken.
        }));
    };

    // Alleen een offerte heeft een einddatum; een factuur heeft er geen.
    const setValidUntil = (value: string) =>
        setQuotation(prev => ({ ...prev, validUntil: value }));

    const handleToggleType = (nextIsQuotation: boolean) => {
        if (nextIsQuotation === isQuotation) return;

        const source = draft;

        // Bedrijfs- en betaalgegevens hoeven hier niet mee: die staan in de
        // instellingen en gelden voor beide documenttypes.

        /*
         * Hier werd eerst uitgezocht of de notitie van jou was of van de app,
         * omdat een offerte met "Deze offerte is 30 dagen geldig" begon en die
         * zin anders op een fáctuur belandde — op papier dat je klant krijgt.
         * Die zin is weg (zie de opmerking bij de bovenkant van dit bestand), en
         * daarmee is er niets meer te onderscheiden: een notitie is zonder
         * uitzondering van jou en reist gewoon mee, net als de regels en de
         * klant. Ook een lege, want die leeghalen is ook een keuze.
         */
        const carriedOver = (prev: InvoiceDraft | QuotationDraft) => ({
            client: { ...prev.client, ...source.client },
            items: source.items.map(item => ({ ...item })),
            // Via schemeOf en niet rechtstreeks: anders valt een document met
            // een regime terug op "normaal" en staat er ineens btw op.
            vatScheme: schemeOf(source),
            // Om dezelfde reden als het regime: de taal hoort bij de klant aan
            // wie je schrijft, niet bij het soort document. Een offerte in het
            // Engels die als Nederlandse factuur terugkomt, is een fout die je
            // pas ziet als je klant hem niet begrijpt.
            taal: source.taal ?? 'nl',
            notes: source.notes,
            // Net als het regime hierboven: een korting hoort bij het document,
            // niet bij het soort. Bleef hij hier staan, dan verdween een
            // afgesproken korting zodra je even naar het andere tabblad keek.
            discount: source.discount,
            date: source.date,
        });

        if (nextIsQuotation) setQuotation(prev => ({ ...prev, ...carriedOver(prev) }));
        else setInvoice(prev => ({ ...prev, ...carriedOver(prev) }));

        setIsQuotation(nextIsQuotation);
    };

    /**
     * Een geaccepteerde offerte wordt een factuur.
     *
     * Wisselen van tabblad neemt klant en regels al mee, maar laat de
     * offertetekst staan ("Deze offerte is 30 dagen geldig") en legt geen
     * verband tussen de twee stukken. Deze knop doet dat wel: hij verwijst in
     * de opmerkingen naar het offertenummer, wat gebruikelijk is en het voor de
     * ontvanger en je eigen administratie narekenbaar maakt.
     */
    const handleConvertToInvoice = () => {
        const offerteNummer = numbering.offerte;
        const heeftFactuurWerk = invoice.items.length > 1 || invoice.items.some(i => i.unitPrice > 0);
        if (heeftFactuurWerk && !window.confirm(
            'De regels die nu op de factuur staan worden vervangen door die van deze offerte. Doorgaan?',
        )) return;

        setInvoice(prev => ({
            ...prev,
            client: { ...quotation.client },
            items: quotation.items.map(item => ({ ...item })),
            vatScheme: schemeOf(quotation),
            // De klant die de offerte accepteerde las hem in deze taal; de
            // factuur erna hoort dezelfde te zijn.
            taal: quotation.taal ?? 'nl',
            // Een omgezette offerte is een gewone factuur, ook als er net nog
            // een creditfactuur op dit tabblad stond.
            creditOf: undefined,
            // De korting is afgesproken in de offerte waar je klant ja op zei.
            // Zonder deze regel staat er op de factuur een hoger bedrag dan je
            // hebt aangeboden, en dat is geen schoonheidsfoutje.
            discount: quotation.discount,
            notes: `Conform offerte ${offerteNummer}.`,
            date: getInitialDates().date,
        }));
        setIsQuotation(false);
    };

    const addItem = () =>
        updateItems(items => [
            ...items,
            defaultItem(),
        ]);

    const updateItem = (id: string, updates: Partial<LineItem>) =>
        updateItems(items => items.map(item => (item.id === id ? { ...item, ...updates } : item)));

    const removeItem = (id: string) => {
        if (currentData.items.length > 1) {
            updateItems(items => items.filter(item => item.id !== id));
        }
    };

    // Het tarief per regel blijft staan: het regime bepaalt alleen of er btw
    // berekend en vermeld wordt, zodat de tarieven terugkomen als je terugzet.
    const vatScheme = schemeOf(currentData);
    // Afwezig is Nederlands, net als bij het regime: zo blijft een bewaard
    // document van vóór deze keuze renderen zoals het is uitgereikt.
    const documentTaal: Taal = currentData.taal ?? 'nl';
    // Ingevuld én niet Nederland. Leeg betekent binnenland (zie het veld bij
    // Klantgegevens), dus dan valt er niets te suggereren.
    const land = currentData.client.country?.trim() ?? '';
    const buitenlandseKlant = land !== '' && !/^(nederland|nl|the netherlands|netherlands)$/i.test(land);

    /**
     * Een logo wordt als data-URL in localStorage bewaard, en die opslag is
     * krap (ongeveer 5 MB). Een foto van een telefoon past daar niet in. We
     * verkleinen hem daarom eerst; lukt bewaren alsnog niet, dan zeggen we dat,
     * want anders lijkt het gelukt tot de volgende herlaadbeurt.
     */
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLogoWaarschuwing(null);
        try {
            const logoUrl = await downscaleImage(file, 480);
            updateSender({ logoUrl });
            if (didLastWriteFail()) {
                setLogoWaarschuwing(
                    'Dit logo is te groot om te onthouden. Het staat wel op je document, '
                    + 'maar is na het herladen van de pagina weg. Probeer een kleiner bestand.',
                );
            } else {
                /*
                 * Gemeten aan wat eruit kwam en niet aan wat erin ging: een
                 * foto van vier megabyte die tot zestig kilobyte verkleint,
                 * heeft geen gevolgen. Het gaat om wat er in de PDF belandt.
                 *
                 * De ondergrens is een halve megabyte omdat een factuur uit
                 * deze app verder niets weegt: kaal vier kilobyte, met een
                 * betaal-QR elf. Een logo van een halve megabyte is dan in zijn
                 * eentje de hele bijlage, en dat merk je pas als je hem mailt.
                 */
                const bytes = dataUrlBytes(logoUrl);
                if (bytes >= 512 * 1024) {
                    const mb = (bytes / (1024 * 1024)).toFixed(1);
                    setLogoWaarschuwing(
                        `Dit logo is ${mb} MB, en dat gaat zo in elke PDF mee. Een factuur `
                        + 'uit deze app is verder maar een paar kilobyte, dus je bijlage '
                        + 'wordt er vooral van dit logo groot. Een kleiner of eenvoudiger '
                        + 'bestand scheelt veel; op het document staat het hooguit een paar '
                        + 'centimeter breed.',
                    );
                }
            }
        } catch {
            setLogoWaarschuwing('Dit bestand kon niet als afbeelding worden gelezen.');
        }
    };

    /**
     * Haalt het logo van je documenten af.
     *
     * Ook de waarschuwing eraf: die ging over het bestand dat er nu niet meer
     * is, en zou anders blijven staan bij een logo dat weg is.
     */
    const handleLogoRemove = () => {
        setLogoWaarschuwing(null);
        updateSender({ logoUrl: '' });
    };

    const sanitizeFilename = (name: string) => name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

    /**
     * react-pdf is fors (ruim een megabyte). Zowel de bibliotheek als het
     * document dat eraan hangt worden daarom pas hier opgehaald. Alleen
     * import("@react-pdf/renderer") is niet genoeg: zolang InvoiceDocument
     * bovenaan wordt geïmporteerd, zit de bibliotheek alsnog in de eerste
     * paginalading.
     */
    const downloadPdf = async (
        data: Invoice | Quotation,
        alsOfferte: boolean,
        nummer: string,
    ) => {
        const [{ pdf }, { default: InvoiceDocument }] = await Promise.all([
            import("@react-pdf/renderer"),
            import("./InvoiceDocument"),
        ]);
        const gerenderd = await pdf(
            <InvoiceDocument data={data} isQuotation={alsOfferte} />
        ).toBlob();

        // Pas na het renderen weten we hoeveel pagina's het zijn geworden, dus
        // de nummering wordt er daarna op gestempeld. Zie lib/page-numbers.ts.
        const genummerd = await stampPageNumbers(await gerenderd.arrayBuffer());
        const blob = new Blob([genummerd as BlobPart], { type: 'application/pdf' });

        // De bestandsnaam zegt wat het is: een creditfactuur die "Factuur_..."
        // heet, raakt in een map met facturen zoek.
        const baseName = alsOfferte
            ? 'Offerte'
            : (data as Invoice).creditOf ? 'Creditfactuur' : 'Factuur';
        const filename = `${sanitizeFilename(baseName)}_${sanitizeFilename(nummer)}.pdf`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    /**
     * Eén plek waar het misgaan van een PDF iets zegt.
     *
     * Beide knoppen riepen downloadPdf zonder vangnet aan, en dat liep stil af:
     * mislukte de dynamische import, dan gebeurde er niets. Geen melding, geen
     * fout, alleen een knop die dood leek. Dat is precies hoe dit offline
     * uitpakte voordat de brok werd voorgeladen, en het kan ook nu nog door een
     * halve cache of een afgebroken verbinding.
     */
    const metPdfMelding = (taak: Promise<void>) => {
        taak.catch(() => setBewaarMelding(
            'De PDF kon niet gemaakt worden. Ben je offline en heb je deze app net '
            + 'voor het eerst geopend, maak dan één keer verbinding; daarna werkt het '
            + 'ook zonder.',
        ));
    };

    const handleDownloadPDF = () =>
        metPdfMelding(downloadPdf(currentData, isQuotation, documentNumber));

    /**
     * De e-factuur: dezelfde factuur als machineleesbaar UBL-bestand.
     *
     * Alleen voor een factuur, want een offerte is geen factuur en UBL kent er
     * een ander documenttype voor. Ontbreekt er iets dat NLCIUS verplicht
     * stelt, dan zeggen we dat in plaats van een bestand af te leveren dat bij
     * je klant wordt afgewezen.
     */
    const handleDownloadUbl = (data: Invoice) => {
        const ontbreekt = ontbrekendeVelden(data);
        if (ontbreekt.length > 0) {
            setBewaarMelding(
                `Voor een e-factuur mist er nog ${ontbreekt.join(', ')}. `
                + 'Een e-factuur wordt door de administratie van je klant ingelezen, en '
                + 'zonder deze gegevens wordt hij geweigerd.',
            );
            return;
        }

        const blob = new Blob([buildUblInvoice(data)], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = ublFilename(data);
        link.click();
        URL.revokeObjectURL(url);
        setBewaarMelding(null);
    };

    /**
     * Een bewaard document opnieuw downloaden levert hetzelfde stuk op, want
     * het is mét jouw gegevens van toen bewaard. Zonder die momentopname zou
     * een verhuizing elke oude factuur stilletjes herschrijven.
     */
    const handleDownloadSaved = (bewaard: BewaardDocument) =>
        metPdfMelding(downloadPdf(bewaard.document, bewaard.soort === 'offerte', bewaard.nummer));

    /**
     * Legt het document vast in het archief.
     *
     * Dit hoogt het nummer niet op. Bewaren en de reeks doorschuiven zijn twee
     * dingen: je kunt een factuur bewaren en er daarna nog naar kijken, en
     * Volgende factuur is het moment waarop je aan de volgende begint. Hetzelfde
     * onderscheid als tussen downloaden en uitreiken.
     */
    const handleSaveDocument = async () => {
        const soort: DocumentSoort = isQuotation
            ? 'offerte'
            : invoice.creditOf ? 'creditfactuur' : 'factuur';

        // Vergrendeld kan er niet bewaard worden: zonder sleutel zou dit record
        // leesbaar naast de versleutelde belanden. Zeg dat, in plaats van het op
        // de opslag te gooien.
        if (kluis.vergrendeld) {
            setBewaarMelding(
                'Je archief is vergrendeld. Voer bij Beveiliging en privacy je wachtwoordzin '
                + 'in; daarna kun je dit document bewaren.',
            );
            return;
        }

        const alBewaard = documenten.some(d => d.soort === soort && d.nummer === documentNumber);
        if (alBewaard && !window.confirm(
            `${soortLabel(soort)} ${documentNumber} staat al in je archief. `
            + 'Een tweede keer bewaren geeft twee documenten met hetzelfde nummer. Doorgaan?',
        )) return;

        const bewaard = await bewaarDocument(currentData, soort);
        setBewaarMelding(bewaard
            ? `${soortLabel(soort)} ${bewaard.nummer} is bewaard.`
            // Geen oorzaak noemen alsof hij vaststaat: bewaarDocument vangt élke
            // fout af, dus dit kan net zo goed een IndexedDB zijn die in een
            // privévenster niets teruggeeft als een volle schijf.
            : 'Bewaren is niet gelukt. Mogelijk geeft deze browser geen opslagruimte vrij.');
    };

    /**
     * Neemt klant en regels van een bewaard document over in een nieuw concept.
     *
     * Bewust zonder het nummer: twee facturen met hetzelfde nummer zijn een
     * echt probleem (art. 35a Wet OB 1968), dus een duplicaat begint bij het
     * nummer waar je reeks nu staat.
     */
    const handleDuplicateDocument = (bewaard: BewaardDocument) => {
        const naarOfferte = bewaard.soort === 'offerte';
        const overnemen = {
            client: { ...bewaard.document.client },
            items: bewaard.document.items.map(item => ({ ...item, id: generateId() })),
            vatScheme: schemeOf(bewaard.document),
            // Uit het bewaarde stuk: een duplicaat herhaalt het document dat je
            // uitreikte, en dat was in deze taal.
            taal: bewaard.document.taal ?? 'nl',
            // Een duplicaat van een creditfactuur crediteert dezelfde factuur;
            // zonder dit zou het een gewone factuur worden en zou het bedrag de
            // verkeerde kant op gaan.
            creditOf: (bewaard.document as Invoice).creditOf,
            // Uit het bewaarde stuk en niet uit het huidige concept: een
            // duplicaat hoort het document te herhalen dat je uitreikte.
            discount: bewaard.document.discount,
            notes: bewaard.document.notes ?? '',
            date: getInitialDates().date,
        };

        if (naarOfferte) setQuotation(prev => ({ ...prev, ...overnemen }));
        else setInvoice(prev => ({ ...prev, ...overnemen }));

        setIsQuotation(naarOfferte);
        setSelectedClientId('');
        setIsEditingClient(false);
        setBewaarMelding(
            `Overgenomen uit ${naarOfferte ? 'offerte' : 'factuur'} ${bewaard.nummer}. `
            + `Dit concept krijgt nummer ${naarOfferte ? numbering.offerte : numbering.factuur}.`,
        );
    };

    /**
     * Maakt een creditfactuur die een bewaarde factuur terugneemt.
     *
     * Dit is het nette alternatief voor wijzigen, en de reden dat het archief
     * niets laat bijwerken: een uitgereikte factuur ligt bij je klant en je
     * aangifte verwijst ernaar, dus corrigeren doe je met een nieuw stuk.
     *
     * De regels komen ongewijzigd mee en de bedragen blijven positief — het
     * document zegt zelf dat het crediteert, en dat er dan óók nog een min voor
     * zou staan draait het twee keer om.
     */
    const handleCreditDocument = (bewaard: BewaardDocument) => {
        const origineel = bewaard.document as Invoice;
        setInvoice(prev => ({
            ...prev,
            client: { ...origineel.client },
            items: origineel.items.map(item => ({ ...item, id: generateId() })),
            // Hetzelfde btw-regime als het origineel: je neemt precies terug
            // wat je in rekening hebt gebracht, inclusief de behandeling ervan.
            vatScheme: schemeOf(origineel),
            // Een creditfactuur hoort bij de factuur die hij terugneemt, dus
            // ook in dezelfde taal: je klant legt de twee naast elkaar.
            taal: origineel.taal ?? 'nl',
            creditOf: { number: bewaard.nummer, date: origineel.date },
            buyerReference: origineel.buyerReference,
            deliveryDate: undefined,
            notes: '',
            date: getInitialDates().date,
        }));
        setIsQuotation(false);
        setSelectedClientId('');
        setIsEditingClient(false);
        setBewaarMelding(
            `Creditfactuur opgesteld bij factuur ${bewaard.nummer}. Hij krijgt nummer `
            + `${numbering.factuur}; pas de regels aan als je maar een deel crediteert.`,
        );
    };

    const handleDeleteDocument = async (bewaard: BewaardDocument) => {
        if (!window.confirm(
            `${soortLabel(bewaard.soort)} ${bewaard.nummer} uit je archief `
            + 'verwijderen? Dit kan niet ongedaan worden gemaakt.',
        )) return;
        const gelukt = await verwijderDocument(bewaard.id);
        if (!gelukt) setBewaarMelding('Verwijderen is niet gelukt.');
    };

    /**
     * Alles wat in deze browser bewaard is, in één bestand. Het archief hoort
     * er bij: dat is de enige kopie, en een browser die zijn site-data opruimt
     * neemt hem mee. Dit bestand is dus ook je back-up.
     *
     * Het archief en het klantenboek gaan mee zoals ze op schijf staan. Zijn ze
     * versleuteld, dan is het bestand dat ook, met de kluis erbij zodat dezelfde
     * zin het weer opent. Een reservekopie die alles alsnog leesbaar wegschrijft
     * zou de versleuteling onderuit halen, en dat verwacht niemand die zijn
     * gegevens net beveiligd heeft.
     */
    const exportSettings = async () => {
        const payload = {
            ...settings,
            clients: exportClients(),
            numbering,
            documents: await exportDocuments(),
            kluis: await exportKluis(),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `facturen_instellingen_${sanitizeFilename(settings.sender.name || 'bedrijf')}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    /**
     * Importeren vervangt wat er in deze browser staat, dus eerst kijken en
     * vragen, dan pas schrijven.
     *
     * Dit las eerder alles klakkeloos in: één verkeerd JSON-bestand uit je
     * downloadmap wiste het archief voordat bleek dat er niets bruikbaars in
     * stond. En er werd niet eens om bevestiging gevraagd, terwijl Wissen — niet
     * destructiever — dat wel doet en er zelfs bij vertelt hoeveel er weggaat.
     */
    const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Het veld leegmaken, anders kun je hetzelfde bestand niet nog eens kiezen.
        e.target.value = '';

        const reader = new FileReader();
        reader.onload = async (event) => {
            const inspectie = inspecteerBackup(String(event.target?.result ?? ''));
            if (!inspectie.ok) {
                alert(
                    'Dit bestand kan niet geïmporteerd worden:\n\n'
                    + inspectie.problemen.map(p => `• ${p}`).join('\n')
                    + '\n\nEr is niets gewijzigd.',
                );
                return;
            }

            if (!window.confirm(vervangingsVraag(inspectie.inhoud, {
                documenten: documenten.length,
                klanten: savedClients.length,
            }))) return;

            const { bestand } = inspectie;
            if (bestand.sender || bestand.bankAccount || bestand.bic
                || bestand.paymentTermDays !== undefined || bestand.paymentConditions) {
                updateSettings({
                    ...(bestand.sender ? { sender: bestand.sender as Sender } : {}),
                    ...(bestand.bankAccount !== undefined ? { bankAccount: bestand.bankAccount } : {}),
                    ...(bestand.bic !== undefined ? { bic: bestand.bic } : {}),
                    // Door dezelfde omzetting als de opslag zelf, want een
                    // bestand uit een oudere versie draagt alleen de zin.
                    ...uitOudeBetaaltermijn(bestand),
                });
            }

            // De kluis eerst: daarna weten de opslagen of wat er binnenkomt
            // versleuteld is, en met welke kop.
            if (bestand.kluis) await importKluis(bestand.kluis);

            if (bestand.clients) {
                importClients(bestand.clients);
                setSelectedClientId('');
            }
            if (bestand.numbering) {
                writeNumbering({
                    factuur: bestand.numbering.factuur,
                    offerte: bestand.numbering.offerte,
                });
            }
            // Het archief komt alleen mee als het bestand er een heeft; een
            // ouder bestand mag je bewaarde documenten niet wissen.
            if (bestand.documents && !await replaceDocuments(bestand.documents)) {
                setBewaarMelding('Het archief uit dit bestand kon niet bewaard worden.');
                return;
            }

            setBewaarMelding(bestand.kluis
                ? 'Geïmporteerd. Dit bestand is versleuteld: voer bij Beveiliging en privacy '
                  + 'de wachtwoordzin in die erbij hoort om je klanten en documenten te zien.'
                : 'Geïmporteerd.');
        };
        reader.readAsText(file);
    };

    /** Een klant uit het boek kiezen vult de velden van dit document. */
    const selectSavedClient = (id: string) => {
        setSelectedClientId(id);
        setIsEditingClient(false);
        const chosen = savedClients.find(c => c.id === id);
        updateDocument({ client: chosen ? toDocumentClient(chosen) : emptyClient() });
    };

    // Opslaan werkt op naam: bestaat die al, dan werk je die klant bij.
    const matchingSavedClient = findClientByName(currentData.client.name);

    /**
     * Opslaan wordt geweigerd zolang het klantenboek vergrendeld is: een
     * leesbare klant naast een versleuteld blok wegschrijven zou de helft
     * alsnog open leggen. Zeg dat dan, in plaats van er niets mee te doen.
     */
    const handleSaveClient = () => {
        const saved = saveClient(currentData.client);
        if (!saved) {
            setBewaarMelding(
                'Je klantenboek is vergrendeld. Voer bij Beveiliging en privacy je '
                + 'wachtwoordzin in; daarna kun je deze klant opslaan.',
            );
            return;
        }
        setSelectedClientId(saved.id);
        setIsEditingClient(false);
    };

    const handleDeleteClient = () => {
        const chosen = savedClients.find(c => c.id === selectedClientId);
        if (!chosen) return;
        if (window.confirm(`"${chosen.name}" uit je klantenboek verwijderen?`)) {
            deleteClient(chosen.id);
            setSelectedClientId('');
            setIsEditingClient(false);
        }
    };

    const handleClearSettings = async () => {
        const aantal = documenten.length;
        const confirmed = window.confirm(
            'Je bedrijfsgegevens, betaalgegevens, klantenboek, de stand van je factuurnummers '
            + `en je wachtwoordzin worden uit deze browser verwijderd${aantal > 0
                ? `, samen met ${aantal} bewaard${aantal === 1 ? ' document' : 'e documenten'}`
                : ''}. `
            + 'Dit kan niet ongedaan worden gemaakt; gebruik Export als je een kopie wilt houden. '
            + 'Weet je het zeker?',
        );
        if (confirmed) {
            clearSettings();
            clearClients();
            clearNumbering();
            await clearDocuments();
            await vergeetKluis();
            setSelectedClientId('');
        }
    };

    return (
        <div className="container">
            <div className="main-grid">
                <div className="form-section card glass">
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '1rem', flex: 1 }}>
                            <button
                                className={`premium-btn ${!isQuotation ? '' : 'inactive'}`}
                                onClick={() => handleToggleType(false)}
                                style={{ flex: 1 }}
                            >
                                <FileText size={18} /> Factuur
                            </button>
                            <button
                                className={`premium-btn ${isQuotation ? '' : 'inactive'}`}
                                onClick={() => handleToggleType(true)}
                                style={{ flex: 1 }}
                            >
                                <Briefcase size={18} /> Offerte
                            </button>
                        </div>
                        <button
                            className="premium-btn"
                            onClick={toggleTheme}
                            aria-label={theme === 'light' ? 'Overschakelen naar donkere modus' : 'Overschakelen naar lichte modus'}
                            title={theme === 'light' ? 'Donkere modus' : 'Lichte modus'}
                            style={{
                                padding: '0.75rem',
                                background: 'var(--card-bg)',
                                border: '1px solid var(--border)',
                                color: 'var(--foreground) !important'
                            }}
                        >
                            {theme === 'light' ? <Moon size={20} color="var(--foreground)" /> : <Sun size={20} color="var(--foreground)" />}
                        </button>
                    </div>

                    {/* Alles wat bij jou hoort in plaats van bij een document staat
                        hier bij elkaar, met één set knoppen die voor het geheel geldt. */}
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                            <h3 style={{ margin: 0 }}>Mijn gegevens</h3>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button className="premium-btn compact" onClick={exportSettings} title="Mijn gegevens exporteren">
                                    <Download size={14} /> <span>Export</span>
                                </button>
                                <label className="premium-btn compact" style={{ cursor: 'pointer' }} title="Mijn gegevens importeren">
                                    <Upload size={14} /> <span>Import</span>
                                    <input type="file" accept=".json" onChange={importSettings} style={{ display: 'none' }} />
                                </label>
                                <button className="premium-btn compact" onClick={handleClearSettings} title="Opgeslagen gegevens uit deze browser verwijderen">
                                    <Trash2 size={14} /> <span>Wissen</span>
                                </button>
                            </div>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
                            Je bedrijfs- en betaalgegevens worden onthouden in deze browser, op dit apparaat.
                            Ze gaan niet naar een server. Gebruik Export en Import om ze mee te nemen.
                        </p>
                    </div>

                    <CompanyDetails
                        sender={currentData.sender}
                        onChange={updateSender}
                        onLogoChange={handleLogoUpload}
                        onLogoRemove={handleLogoRemove}
                        logoWarning={logoWaarschuwing}
                        open={foldouts.bedrijfsgegevens}
                        onToggle={(open) => writeFoldout('bedrijfsgegevens', open)}
                    />

                    {!isQuotation && (
                        <PaymentDetails
                            settings={settings}
                            onChange={updateSettings}
                            open={foldouts.betaalgegevens}
                            onToggle={(open) => writeFoldout('betaalgegevens', open)}
                        />
                    )}

                    <SecurityPanel
                        kluis={kluis}
                        aantalDocumenten={documenten.length}
                        open={foldouts.beveiliging}
                        onToggle={(open) => writeFoldout('beveiliging', open)}
                        onSetPassphrase={stelIn}
                        onUnlock={ontgrendel}
                        onLock={vergrendel}
                        onRemovePassphrase={verwijderZin}
                    />

                    <DocumentArchive
                        documenten={documenten}
                        opslagWerkt={kluis.opslagWerkt}
                        vergrendeld={kluis.vergrendeld}
                        open={foldouts.archief}
                        onToggle={(open) => writeFoldout('archief', open)}
                        onDuplicate={handleDuplicateDocument}
                        onDelete={handleDeleteDocument}
                        onDownload={handleDownloadSaved}
                        onDownloadUbl={(bewaard) => handleDownloadUbl(bewaard.document as Invoice)}
                        onCredit={handleCreditDocument}
                    />

                    <ClientDetails
                        client={currentData.client}
                        onChange={updateClient}
                        savedClients={savedClients}
                        selectedClientId={selectedClientId}
                        onSelect={selectSavedClient}
                        onSave={handleSaveClient}
                        onDelete={handleDeleteClient}
                        onEdit={() => setIsEditingClient(true)}
                        fieldsVisible={clientFieldsVisible}
                        nameIsKnown={!!matchingSavedClient}
                        locked={klantenVergrendeld()}
                    />

                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Algemene Informatie</h3>
                        <div style={{ display: 'grid', gap: '1rem' }}>
                            <div className="field-row">
                                <div className="label-group">
                                    <label htmlFor="documentnummer">{isQuotation ? 'Offertenummer' : 'Factuurnummer'}</label>
                                    <input
                                        id="documentnummer"
                                        className="invoice-number-input"
                                        value={documentNumber}
                                        onChange={(e) => setDocumentNumber(e.target.value)}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div className="label-group">
                                    <label htmlFor="datum">Datum</label>
                                    <input
                                        id="datum"
                                        type="date"
                                        value={currentData.date}
                                        onChange={(e) => updateDocument({ date: e.target.value })}
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                {isQuotation && (
                                    <div className="label-group">
                                        <label className="label-wrap" htmlFor="geldig-tot">Geldig tot</label>
                                        <input
                                            id="geldig-tot"
                                            type="date"
                                            value={quotation.validUntil}
                                            onChange={(e) => setValidUntil(e.target.value)}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                )}
                                {/* Art. 35a lid 1 Wet OB 1968 wil de datum van de
                                    levering of dienst op de factuur zodra die vaststaat
                                    en afwijkt van de factuurdatum — en dat is het geval
                                    zodra je achteraf factureert. Alleen bij een factuur:
                                    bij een offerte is er nog niets geleverd. */}
                                {!isQuotation && (
                                    <div className="label-group">
                                        <label className="label-wrap" htmlFor="leverdatum">
                                            Datum levering/dienst
                                        </label>
                                        <input
                                            id="leverdatum"
                                            type="date"
                                            value={invoice.deliveryDate || ''}
                                            onChange={(e) => updateDocument({ deliveryDate: e.target.value })}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                )}
                            </div>
                            {!isQuotation && (
                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
                                    Vul <strong>Datum levering/dienst</strong> alleen in als je werk op
                                    een andere datum is geleverd dan de factuurdatum, bijvoorbeeld als
                                    je achteraf factureert. Hij komt dan op de factuur te staan, want
                                    dat is dan verplicht.
                                </p>
                            )}
                            {/* Alleen voor de e-factuur, dus alleen bij een factuur. Hij
                                staat niet op de PDF: een mens leest daar de factuur, en
                                verwerkingsinformatie hoort daar niet op. */}
                            {!isQuotation && (
                                <div className="label-group">
                                    <label htmlFor="klantreferentie">
                                        Referentie van je klant (voor e-factuur)
                                    </label>
                                    <input
                                        id="klantreferentie"
                                        placeholder="INKOOP-2026-77"
                                        value={invoice.buyerReference || ''}
                                        onChange={(e) => updateDocument({ buyerReference: e.target.value })}
                                        style={{ width: '100%' }}
                                        aria-describedby="klantreferentie-uitleg"
                                    />
                                    {/* De opsomming stond in de placeholder en werd op een
                                        telefoon afgekapt na "Inkoopordernummer, kostenp".
                                        Een placeholder breekt niet af naar een tweede regel,
                                        dus een opsomming hoort eronder. */}
                                    <p id="klantreferentie-uitleg" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                                        Het kenmerk waarmee je klant deze factuur in zijn eigen
                                        administratie terugvindt: een inkoopordernummer,
                                        kostenplaats of projectcode. Vraag ernaar als je het niet
                                        hebt: zonder dit kenmerk wordt een e-factuur in de
                                        praktijk teruggestuurd.
                                    </p>
                                </div>
                            )}
                            {/* Eén keuze en geen losse vinkjes: deze regimes sluiten
                                elkaar uit, en 0% zonder reden erbij is op papier
                                onvolledig en in de e-factuur verkeerd. */}
                            <div style={{ padding: '1rem', background: 'rgba(37, 99, 235, 0.05)', borderRadius: 'var(--radius)', border: '1px solid rgba(37, 99, 235, 0.1)' }}>
                                <label htmlFor="btwRegime" style={{ color: 'var(--primary)' }}>
                                    Btw-behandeling
                                </label>
                                <select
                                    id="btwRegime"
                                    value={vatScheme}
                                    onChange={(e) => updateDocument({ vatScheme: e.target.value as VatScheme })}
                                    style={{ width: '100%' }}
                                >
                                    {VAT_SCHEME_ORDER.map((naam) => (
                                        <option key={naam} value={naam}>{VAT_SCHEMES[naam].label}</option>
                                    ))}
                                </select>
                                <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                                    {VAT_SCHEMES[vatScheme].hint}
                                </p>
                                {/* De voorwaarde apart en niet in de hint: de hint zegt
                                    wanneer je dit kiest, dit zegt wat je daarna zelf nog
                                    moet doen. Bij een intracommunautaire levering is dat
                                    een verplichting die deze app aanmaakt maar niet kan
                                    uitvoeren — zonder deze regel kom je daar pas bij een
                                    controle achter. */}
                                {VAT_SCHEMES[vatScheme].voorwaarde && (
                                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--secondary)' }}>
                                        {VAT_SCHEMES[vatScheme].voorwaarde}
                                    </p>
                                )}
                                {/* Zonder dat nummer kan je klant de btw niet aangeven,
                                    dus dan is de factuur niet af. */}
                                {VAT_SCHEMES[vatScheme].requiresClientVat
                                    && !currentData.client.vatNumber?.trim() && (
                                    <p role="status" style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--error)' }}>
                                        Vul het btw-nummer van je klant in bij Klantgegevens: bij deze
                                        behandeling hoort dat op de factuur te staan.
                                    </p>
                                )}
                                {/* De e-factuur van een intracommunautaire levering moet
                                    een leverdatum noemen (BR-IC-11). Het veld staat
                                    hierboven bij de andere datums; hier alleen de hint
                                    dat leeg laten de factuurdatum oplevert. */}
                                {!isQuotation && vatScheme === 'icp' && !invoice.deliveryDate && (
                                    <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                                        De e-factuur neemt de factuurdatum als leverdatum. Vul
                                        <strong> Datum levering/dienst</strong> in als dat niet klopt.
                                    </p>
                                )}
                            </div>

                            {/* De taal van het document staat naast de btw-behandeling,
                                want ze volgen allebei uit wie je klant is en waar hij
                                zit. Alleen het document gaat mee: dit formulier blijft
                                Nederlands, want jij bent dat. */}
                            <div className="label-group">
                                <label htmlFor="documenttaal">Taal van het document</label>
                                <select
                                    id="documenttaal"
                                    value={documentTaal}
                                    onChange={(e) => updateDocument({ taal: e.target.value as Taal })}
                                    style={{ width: '100%' }}
                                    aria-describedby="documenttaal-uitleg"
                                >
                                    {TAAL_ORDER.map((naam) => (
                                        <option key={naam} value={naam}>{TAAL_NAMEN[naam]}</option>
                                    ))}
                                </select>
                                <p id="documenttaal-uitleg" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                                    Dit vertaalt de vaste tekst op het document: de koppen, de
                                    kolommen, het betaalverzoek en de btw-vermelding. Wat je zelf
                                    intypt blijft staan zoals je het schreef, dus je omschrijvingen,
                                    je eenheden en je betalingsvoorwaarden zet je er zelf in het
                                    Engels bij. Dit scherm blijft Nederlands, en de e-factuur
                                    verandert niet: die draagt codes en geen woorden.
                                </p>
                                {/* Alleen aanbieden, niet opdringen: het land zegt niet
                                    welke taal je klant leest. Een Duitse GmbH heeft vaak
                                    een Engelstalige boekhouding, en andersom zit er in
                                    Nederland genoeg buitenlands personeel. */}
                                {documentTaal === 'nl' && buitenlandseKlant && (
                                    <p role="status" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--secondary)' }}>
                                        Je klant zit in {currentData.client.country}. Engels is
                                        hier misschien handiger.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3>Items</h3>
                            <button className="premium-btn" onClick={addItem} style={{ padding: '0.4rem 0.8rem', fontSize: '0.9rem' }}>
                                <Plus size={16} /> Item Toevoegen
                            </button>
                        </div>
                        <datalist id="eenheden">
                            {UNIT_SUGGESTIONS.map(unit => <option key={unit} value={unit} />)}
                        </datalist>
                        {currentData.items.map((item) => (
                            <ItemRow key={item.id} item={item} onUpdate={updateItem} onRemove={removeItem} isVatExempt={!chargesVat(vatScheme)} />
                        ))}
                    </div>

                    {/* Korting over het hele document, direct onder de regels: daar
                        gaat hij immers vanaf. Op het totaal en niet per regel, omdat
                        dat is wat er in de praktijk wordt gevraagd — "€ 50 eraf omdat
                        het uitliep", niet een andere prijs per post. */}
                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}>
                            <label htmlFor="korting">Korting</label>
                        </h3>
                        {/* Niet uitrekken: een korting is een getal van hooguit een
                            paar tekens, en met flex: 1 werd het veld bijna net zo
                            breed als het hele formulier — 482px voor "10". */}
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', maxWidth: '22rem' }}>
                            <input
                                id="korting"
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder="0"
                                value={currentData.discount?.waarde ?? ''}
                                onChange={(e) => updateDocument({
                                    discount: e.target.value === ''
                                        ? undefined
                                        : {
                                            soort: currentData.discount?.soort ?? 'bedrag',
                                            waarde: parseFloat(e.target.value) || 0,
                                        },
                                })}
                                style={{ flex: 1, minWidth: '4rem' }}
                            />
                            <select
                                id="kortingsoort"
                                aria-label="Korting in euro's of procenten"
                                value={currentData.discount?.soort ?? 'bedrag'}
                                onChange={(e) => updateDocument({
                                    discount: {
                                        soort: e.target.value as 'bedrag' | 'procent',
                                        waarde: currentData.discount?.waarde ?? 0,
                                    },
                                })}
                                /* 12rem en niet 9: op 9rem stond er "% van subtot" —
                                   de langste optie vraagt 144px, plus 20px voor het
                                   pijltje dat de browser bínnen het veld tekent en de
                                   binnenruimte. Niet ingekort tot "%", want "van
                                   subtotaal" is nu juist het punt: het percentage gaat
                                   over het bedrag exclusief btw. */
                                style={{ width: '13rem', flex: '0 0 auto' }}
                            >
                                <option value="bedrag">€ (bedrag)</option>
                                <option value="procent">% van subtotaal</option>
                            </select>
                        </div>
                        <p style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                            Gaat van het subtotaal af, vóór de btw. Staan er regels met
                            verschillende btw-tarieven op, dan wordt de korting naar
                            verhouding over die tarieven verdeeld.
                        </p>
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}>
                            <label htmlFor="opmerkingen">Opmerkingen</label>
                        </h3>
                        <textarea
                            id="opmerkingen"
                            placeholder="Extra tekst onderaan het document (optioneel)"
                            value={currentData.notes || ''}
                            onChange={(e) => updateDocument({ notes: e.target.value })}
                            style={{ width: '100%', minHeight: '80px', resize: 'vertical' }}
                        />
                    </div>

                    {bewaarMelding && (
                        /* Eigen klasse: er staan meer role="status"-meldingen op de
                           pagina (het logo, de beveiliging, de btw-behandeling), en
                           de tests moeten déze kunnen aanwijzen. */
                        <p className="form-melding" role="status" style={{ marginTop: '2rem', marginBottom: 0, fontSize: '0.85rem', color: 'var(--primary)' }}>
                            {bewaarMelding}
                        </p>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '3rem', flexWrap: 'wrap' }}>
                        <button className="premium-btn" onClick={handleDownloadPDF} style={{ flex: '2 1 240px', padding: '1rem' }}>
                            <Download size={20} /> Download PDF
                        </button>
                        {!isQuotation && (
                            <button
                                className="premium-btn"
                                onClick={() => handleDownloadUbl(currentData as Invoice)}
                                style={{ flex: '1 1 200px', padding: '1rem', background: 'var(--secondary)' }}
                                title="Dezelfde factuur als UBL-bestand (NLCIUS), dat de administratie van je klant kan inlezen"
                            >
                                <FileCode size={20} /> E-factuur (UBL)
                            </button>
                        )}
                        <button
                            className="premium-btn"
                            onClick={handleSaveDocument}
                            style={{ flex: '1 1 180px', padding: '1rem' }}
                            title="Dit document vastleggen in je archief; het is daarna niet meer te wijzigen"
                        >
                            <Save size={20} /> Bewaren
                        </button>
                        <button
                            className="premium-btn"
                            onClick={handleNextDocument}
                            style={{ flex: '1 1 180px', padding: '1rem', background: 'var(--secondary)' }}
                            title={`Zet de reeks op ${nextNumber(documentNumber)} en begin opnieuw`}
                        >
                            <Plus size={20} /> {isQuotation ? 'Volgende offerte' : 'Volgende factuur'}
                        </button>
                        {isQuotation && (
                            <button
                                className="premium-btn"
                                onClick={handleConvertToInvoice}
                                style={{ flex: '1 1 220px', padding: '1rem', background: 'var(--secondary)' }}
                                title="Maak van deze offerte een factuur, met een verwijzing naar het offertenummer"
                            >
                                <FileText size={20} /> Omzetten naar factuur
                            </button>
                        )}
                    </div>
                </div>

                <div className="preview-section card glass" style={{ position: 'sticky', top: '2rem', height: 'fit-content', padding: '1rem', overflow: 'auto' }}>
                    <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ color: 'var(--muted)', fontSize: 'clamp(1rem, 4vw, 1.25rem)' }}>Live Voorbeeld</h3>
                    </div>
                    <div className="preview-wrapper">
                        <div style={{ borderRadius: '4px', overflow: 'hidden', boxShadow: '0 0 20px rgba(0,0,0,0.1)' }}>
                            <InvoicePreview data={currentData} isQuotation={isQuotation} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

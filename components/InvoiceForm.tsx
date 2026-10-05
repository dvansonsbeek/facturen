"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Plus, Download, FileText, Briefcase, Upload, Moon, Sun, Trash2, Save } from "lucide-react";
import { Invoice, Quotation, LineItem, Sender, Client } from "@/types";
import { generateId } from "@/lib/utils";
import { subscribeTheme, readTheme, readServerTheme, writeTheme } from "@/lib/theme";
import {
    subscribeSettings, readSettings, readServerSettings, writeSettings, clearSettings,
    didLastWriteFail, type CompanySettings,
} from "@/lib/settings";
import { downscaleImage } from "@/lib/image";
import { stampPageNumbers } from "@/lib/page-numbers";
import {
    subscribeFoldouts, readFoldouts, readServerFoldouts, writeFoldout,
} from "@/lib/foldouts";
import {
    subscribeClients, readClients, readServerClients, saveClient, deleteClient,
    replaceClients, clearClients, findClientByName, type SavedClient,
} from "@/lib/clients";
import {
    subscribeNumbering, readNumbering, readServerNumbering, writeNumbering,
    clearNumbering, nextNumber,
} from "@/lib/numbering";
import {
    subscribeDocuments, readDocuments, readServerDocuments, bewaarDocument,
    verwijderDocument, replaceDocuments, clearDocuments, documentOpslagWerkt,
    type BewaardDocument,
} from "@/lib/documents";
import ItemRow from "./ItemRow";
import CompanyDetails from "./form/CompanyDetails";
import PaymentDetails from "./form/PaymentDetails";
import ClientDetails from "./form/ClientDetails";
import DocumentArchive from "./form/DocumentArchive";
import InvoicePreview from "./InvoicePreview";
// InvoiceDocument wordt bewust niet hierboven geïmporteerd: dat bestand hangt
// aan @react-pdf/renderer, en een gewone import trekt die hele bibliotheek de
// eerste paginalading in. Hij wordt pas opgehaald bij Download PDF.

/**
 * Een document zonder de gegevens die in de instellingen staan. Daardoor kan
 * het niet meer gebeuren dat factuur en offerte elk een eigen, uiteenlopende
 * kopie van je bedrijfsgegevens bijhouden.
 */
type InvoiceDraft = Omit<Invoice, 'sender' | 'bankAccount' | 'bic' | 'paymentConditions' | 'invoiceNumber'>;
type QuotationDraft = Omit<Quotation, 'sender' | 'quotationNumber'>;

const emptyClient = (): Client => ({ name: "", address: "", zip: "", city: "", country: "" });

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
    const theme = useSyncExternalStore(subscribeTheme, readTheme, readServerTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

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
            isVatExempt: false,
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
            isVatExempt: false,
            notes: "Deze offerte is 30 dagen geldig.",
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
        const heeftWerk = draft.items.length > 1 || draft.items.some(item => item.unitPrice > 0);
        if (heeftWerk && !window.confirm(
            `De regels van dit document worden gewist en het nummer gaat naar ${volgende}. Doorgaan?`,
        )) return;

        writeNumbering(isQuotation ? { offerte: volgende } : { factuur: volgende });
        updateDocument(() => ({
            items: [defaultItem()],
            notes: isQuotation ? 'Deze offerte is 30 dagen geldig.' : '',
            date: getInitialDates().date,
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
        // Let op: || en niet ??. Een lege notitie betekent "niet ingevuld" en
        // moet de standaardtekst van het andere document niet overschrijven.
        const carriedOver = (prev: InvoiceDraft | QuotationDraft) => ({
            client: { ...prev.client, ...source.client },
            items: source.items.map(item => ({ ...item })),
            isVatExempt: source.isVatExempt,
            notes: source.notes || prev.notes,
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
            isVatExempt: quotation.isVatExempt,
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

    // Het tarief per regel blijft staan: de vrijstelling bepaalt alleen of er
    // btw berekend en vermeld wordt, zodat de tarieven terugkomen bij uitzetten.
    const toggleVatExemption = (enabled: boolean) => updateDocument({ isVatExempt: enabled });

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
            }
        } catch {
            setLogoWaarschuwing('Dit bestand kon niet als afbeelding worden gelezen.');
        }
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

        const baseName = alsOfferte ? 'Offerte' : 'Factuur';
        const filename = `${sanitizeFilename(baseName)}_${sanitizeFilename(nummer)}.pdf`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleDownloadPDF = () => downloadPdf(currentData, isQuotation, documentNumber);

    /**
     * Een bewaard document opnieuw downloaden levert hetzelfde stuk op, want
     * het is mét jouw gegevens van toen bewaard. Zonder die momentopname zou
     * een verhuizing elke oude factuur stilletjes herschrijven.
     */
    const handleDownloadSaved = (bewaard: BewaardDocument) =>
        downloadPdf(bewaard.document, bewaard.soort === 'offerte', bewaard.nummer);

    /**
     * Legt het document vast in het archief.
     *
     * Dit hoogt het nummer niet op. Bewaren en de reeks doorschuiven zijn twee
     * dingen: je kunt een factuur bewaren en er daarna nog naar kijken, en
     * Volgende factuur is het moment waarop je aan de volgende begint. Hetzelfde
     * onderscheid als tussen downloaden en uitreiken.
     */
    const handleSaveDocument = async () => {
        const soort = isQuotation ? 'offerte' : 'factuur';
        const alBewaard = documenten.some(d => d.soort === soort && d.nummer === documentNumber);
        if (alBewaard && !window.confirm(
            `${soort === 'offerte' ? 'Offerte' : 'Factuur'} ${documentNumber} staat al in je archief. `
            + 'Een tweede keer bewaren geeft twee documenten met hetzelfde nummer. Doorgaan?',
        )) return;

        const bewaard = await bewaarDocument(currentData, soort);
        setBewaarMelding(bewaard
            ? `${soort === 'offerte' ? 'Offerte' : 'Factuur'} ${bewaard.nummer} is bewaard.`
            : 'Bewaren is niet gelukt: deze browser geeft geen opslagruimte vrij.');
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
            isVatExempt: bewaard.document.isVatExempt,
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

    const handleDeleteDocument = async (bewaard: BewaardDocument) => {
        if (!window.confirm(
            `${bewaard.soort === 'offerte' ? 'Offerte' : 'Factuur'} ${bewaard.nummer} uit je archief `
            + 'verwijderen? Dit kan niet ongedaan worden gemaakt.',
        )) return;
        const gelukt = await verwijderDocument(bewaard.id);
        if (!gelukt) setBewaarMelding('Verwijderen is niet gelukt.');
    };

    /**
     * Alles wat in deze browser bewaard is, in één bestand. Het archief hoort
     * er bij: dat is de enige kopie, en een browser die zijn site-data opruimt
     * neemt hem mee. Dit bestand is dus ook je back-up.
     */
    const exportSettings = () => {
        const payload = { ...settings, clients: savedClients, numbering, documents: documenten };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `facturen_instellingen_${sanitizeFilename(settings.sender.name || 'bedrijf')}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const importSettings = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const parsed = JSON.parse(event.target?.result as string);
                    if (!parsed || typeof parsed !== 'object') throw new Error('geen object');
                    // Oudere bestanden bevatten alleen de bedrijfsgegevens zelf,
                    // zonder betaalgegevens of klantenboek eromheen.
                    const { clients, numbering: reeks, documents, ...rest } =
                        'sender' in parsed ? parsed : { sender: parsed };
                    updateSettings(rest);
                    if (Array.isArray(clients)) {
                        replaceClients(clients);
                        setSelectedClientId('');
                    }
                    if (reeks && typeof reeks === 'object') {
                        writeNumbering({ factuur: reeks.factuur, offerte: reeks.offerte });
                    }
                    // Het archief komt alleen mee als het bestand er een heeft;
                    // een ouder bestand mag je bewaarde documenten niet wissen.
                    if (Array.isArray(documents)) {
                        replaceDocuments(documents).then((gelukt) => {
                            if (!gelukt) setBewaarMelding('Het archief uit dit bestand kon niet bewaard worden.');
                        });
                    }
                } catch {
                    alert("Ongeldig instellingenbestand.");
                }
            };
            reader.readAsText(file);
        }
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

    const handleSaveClient = () => {
        const saved = saveClient(currentData.client);
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
            'Je bedrijfsgegevens, betaalgegevens, klantenboek en de stand van je factuurnummers '
            + `worden uit deze browser verwijderd${aantal > 0
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

                    <DocumentArchive
                        documenten={documenten}
                        opslagWerkt={documentOpslagWerkt()}
                        open={foldouts.archief}
                        onToggle={(open) => writeFoldout('archief', open)}
                        onDuplicate={handleDuplicateDocument}
                        onDelete={handleDeleteDocument}
                        onDownload={handleDownloadSaved}
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
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: 'rgba(37, 99, 235, 0.05)', borderRadius: 'var(--radius)', border: '1px solid rgba(37, 99, 235, 0.1)' }}>
                                <input
                                    type="checkbox"
                                    id="vatExempt"
                                    checked={currentData.isVatExempt}
                                    onChange={(e) => toggleVatExemption(e.target.checked)}
                                    style={{ width: 'auto', cursor: 'pointer' }}
                                />
                                <label htmlFor="vatExempt" style={{ margin: 0, cursor: 'pointer', color: 'var(--primary)' }}>
                                    Kleineondernemersregeling (KOR) - vrijgesteld van btw
                                </label>
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
                            <ItemRow key={item.id} item={item} onUpdate={updateItem} onRemove={removeItem} isVatExempt={currentData.isVatExempt} />
                        ))}
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
                        <p role="status" style={{ marginTop: '2rem', marginBottom: 0, fontSize: '0.85rem', color: 'var(--primary)' }}>
                            {bewaarMelding}
                        </p>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '3rem', flexWrap: 'wrap' }}>
                        <button className="premium-btn" onClick={handleDownloadPDF} style={{ flex: '2 1 240px', padding: '1rem' }}>
                            <Download size={20} /> Download PDF
                        </button>
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

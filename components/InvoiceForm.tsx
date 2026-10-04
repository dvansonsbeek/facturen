"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Plus, Download, FileText, Briefcase, Upload, Moon, Sun, Trash2, Pencil } from "lucide-react";
import { Invoice, Quotation, LineItem, Sender, Client } from "@/types";
import { generateId, IBAN_PLACEHOLDER } from "@/lib/utils";
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
import ItemRow from "./ItemRow";
import InvoicePreview from "./InvoicePreview";
import InvoiceDocument from "./InvoiceDocument";

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

    // Welke bewaarde klant je uit het boek hebt gekozen. Hoort bij dit document,
    // niet bij het boek, dus die bewaren we niet.
    const [selectedClientId, setSelectedClientId] = useState('');
    const [isEditingClient, setIsEditingClient] = useState(false);
    const [logoWaarschuwing, setLogoWaarschuwing] = useState<string | null>(null);

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

    // react-pdf is fors; dynamisch laden houdt het uit de eerste bundel.
    const handleDownloadPDF = async () => {
        const { pdf } = await import("@react-pdf/renderer");
        const gerenderd = await pdf(
            <InvoiceDocument data={currentData} isQuotation={isQuotation} />
        ).toBlob();

        // Pas na het renderen weten we hoeveel pagina's het zijn geworden, dus
        // de nummering wordt er daarna op gestempeld. Zie lib/page-numbers.ts.
        const genummerd = await stampPageNumbers(await gerenderd.arrayBuffer());
        const blob = new Blob([genummerd as BlobPart], { type: 'application/pdf' });

        const baseName = isQuotation ? 'Offerte' : 'Factuur';
        const number = documentNumber;
        const filename = `${sanitizeFilename(baseName)}_${sanitizeFilename(number)}.pdf`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const exportSettings = () => {
        const payload = { ...settings, clients: savedClients, numbering };
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
                    const { clients, numbering: reeks, ...rest } =
                        'sender' in parsed ? parsed : { sender: parsed };
                    updateSettings(rest);
                    if (Array.isArray(clients)) {
                        replaceClients(clients);
                        setSelectedClientId('');
                    }
                    if (reeks && typeof reeks === 'object') {
                        writeNumbering({ factuur: reeks.factuur, offerte: reeks.offerte });
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

    const handleClearSettings = () => {
        const confirmed = window.confirm(
            'Je bedrijfsgegevens, betaalgegevens, klantenboek en de stand van je factuurnummers '
            + 'worden uit deze browser verwijderd. Weet je het zeker?',
        );
        if (confirmed) {
            clearSettings();
            clearClients();
            clearNumbering();
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
                                <button className="premium-btn" onClick={exportSettings} style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: 'var(--secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} title="Mijn gegevens exporteren">
                                    <Download size={14} /> <span>Export</span>
                                </button>
                                <label className="premium-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: 'var(--secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} title="Mijn gegevens importeren">
                                    <Upload size={14} /> <span>Import</span>
                                    <input type="file" accept=".json" onChange={importSettings} style={{ display: 'none' }} />
                                </label>
                                <button className="premium-btn" onClick={handleClearSettings} style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: 'var(--secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }} title="Opgeslagen gegevens uit deze browser verwijderen">
                                    <Trash2 size={14} /> <span>Wissen</span>
                                </button>
                            </div>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--muted)' }}>
                            Je bedrijfs- en betaalgegevens worden onthouden in deze browser, op dit apparaat.
                            Ze gaan niet naar een server. Gebruik Export en Import om ze mee te nemen.
                        </p>
                    </div>

                    <details
                        className="foldout"
                        open={foldouts.bedrijfsgegevens}
                        onToggle={(e) => writeFoldout('bedrijfsgegevens', e.currentTarget.open)}
                    >
                        <summary><h3>Mijn Bedrijfsgegevens</h3></summary>
                        <div className="foldout-body" style={{ display: 'grid', gap: '1.5rem' }}>
                            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', border: '2px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                                <div style={{ flex: 1 }}>
                                    <label htmlFor="bedrijf-logo" style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>Logo Uploaden</label>
                                    <input id="bedrijf-logo" type="file" accept="image/*" onChange={handleLogoUpload} style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem' }} />
                                    {logoWaarschuwing && (
                                        <p role="status" style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--error)' }}>
                                            {logoWaarschuwing}
                                        </p>
                                    )}
                                </div>
                                {currentData.sender.logoUrl && (
                                    <img src={currentData.sender.logoUrl} alt="Logo" style={{ height: '50px', maxWidth: '100px', objectFit: 'contain' }} />
                                )}
                            </div>
                            <div>
                                <label htmlFor="bedrijf-naam">Bedrijfsnaam</label>
                                <input
                                    id="bedrijf-naam"
                                    placeholder="Mijn Bedrijf BV"
                                    value={currentData.sender.name}
                                    onChange={(e) => updateSender({ name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="bedrijf-adres">Adresregel 1</label>
                                <input
                                    id="bedrijf-adres"
                                    placeholder="Straatnaam 1"
                                    value={currentData.sender.address}
                                    onChange={(e) => updateSender({ address: e.target.value })}
                                />
                            </div>
                            <div className="mobile-grid-1-tablet-2" style={{ display: 'grid', gap: '1.5rem' }}>
                                <div>
                                    <label htmlFor="bedrijf-postcode">Postcode</label>
                                    <input
                                        id="bedrijf-postcode"
                                        placeholder="1234 AB"
                                        value={currentData.sender.zip}
                                        onChange={(e) => updateSender({ zip: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="bedrijf-stad">Stad</label>
                                    <input
                                        id="bedrijf-stad"
                                        placeholder="Amsterdam"
                                        value={currentData.sender.city}
                                        onChange={(e) => updateSender({ city: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="bedrijf-land">Land</label>
                                <input
                                    id="bedrijf-land"
                                    placeholder="Nederland"
                                    value={currentData.sender.country}
                                    onChange={(e) => updateSender({ country: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="bedrijf-email">E-mail Adres</label>
                                <input
                                    id="bedrijf-email"
                                    placeholder="info@mijnbedrijf.nl"
                                    value={currentData.sender.email}
                                    onChange={(e) => updateSender({ email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="bedrijf-btw">BTW-nummer</label>
                                <input
                                    id="bedrijf-btw"
                                    placeholder="NL123456789B01"
                                    value={currentData.sender.vatNumber}
                                    onChange={(e) => updateSender({ vatNumber: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="bedrijf-kvk">KvK-nummer</label>
                                <input
                                    id="bedrijf-kvk"
                                    placeholder="12345678"
                                    value={currentData.sender.kvkNumber || ''}
                                    onChange={(e) => updateSender({ kvkNumber: e.target.value })}
                                />
                            </div>
                        </div>
                    </details>

                    {!isQuotation && (
                        <details
                            className="foldout"
                            open={foldouts.betaalgegevens}
                            onToggle={(e) => writeFoldout('betaalgegevens', e.currentTarget.open)}
                        >
                            <summary><h3>Mijn Betaalgegevens</h3></summary>
                            <div className="foldout-body" style={{ display: 'grid', gap: '1.5rem' }}>
                                <div>
                                    <label htmlFor="iban">IBAN Nummer</label>
                                    <input
                                        id="iban"
                                        placeholder={IBAN_PLACEHOLDER}
                                        value={settings.bankAccount}
                                        onChange={(e) => updateSettings({ bankAccount: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="bic">BIC Code (optioneel)</label>
                                    <input
                                        id="bic"
                                        placeholder="XXXXXXXX"
                                        value={settings.bic}
                                        onChange={(e) => updateSettings({ bic: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="betalingsvoorwaarden">Betalingsvoorwaarden</label>
                                    <input
                                        id="betalingsvoorwaarden"
                                        placeholder="Binnen 14 dagen na factuurdatum."
                                        value={settings.paymentConditions}
                                        onChange={(e) => updateSettings({ paymentConditions: e.target.value })}
                                    />
                                </div>
                            </div>
                        </details>
                    )}

                    <div style={{ marginBottom: '2rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}>Klantgegevens</h3>
                        <div style={{ display: 'grid', gap: '1.5rem' }}>
                            {/* Het klantenboek. Kiezen vult de velden hieronder; die
                                blijven vrij bewerkbaar voor dit ene document. Pas
                                Opslaan verandert wat er bewaard is. */}
                            <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'grid', gap: '0.75rem' }}>
                                <div>
                                    <label htmlFor="klantKiezen">Klant</label>
                                    <select
                                        id="klantKiezen"
                                        value={selectedClientId}
                                        onChange={(e) => selectSavedClient(e.target.value)}
                                        style={{ width: '100%' }}
                                    >
                                        <option value="">— Nieuwe klant —</option>
                                        {savedClients.map(client => (
                                            <option key={client.id} value={client.id}>{client.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {clientFieldsVisible ? (
                                        <button
                                            className="premium-btn"
                                            onClick={handleSaveClient}
                                            disabled={!currentData.client.name.trim()}
                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: 'var(--secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: currentData.client.name.trim() ? 1 : 0.5, cursor: currentData.client.name.trim() ? 'pointer' : 'not-allowed' }}
                                            title="Deze klant in je klantenboek bewaren"
                                        >
                                            <Plus size={14} /> <span>{matchingSavedClient ? 'Bijwerken' : 'Opslaan'}</span>
                                        </button>
                                    ) : (
                                        <button
                                            className="premium-btn"
                                            onClick={() => setIsEditingClient(true)}
                                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: 'var(--secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                                            title="De gegevens van deze klant aanpassen"
                                        >
                                            <Pencil size={14} /> <span>Bewerken</span>
                                        </button>
                                    )}
                                    <button
                                        className="premium-btn"
                                        onClick={handleDeleteClient}
                                        disabled={!selectedClientId}
                                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem', background: 'var(--secondary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', opacity: selectedClientId ? 1 : 0.5, cursor: selectedClientId ? 'pointer' : 'not-allowed' }}
                                        title="Deze klant uit je klantenboek verwijderen"
                                    >
                                        <Trash2 size={14} /> <span>Verwijderen</span>
                                    </button>
                                </div>
                            </div>
                            {clientFieldsVisible && (<>
                            <div>
                                <label htmlFor="klant-naam">Klantnaam / Bedrijfsnaam</label>
                                <input
                                    id="klant-naam"
                                    placeholder="Naam van de klant"
                                    value={currentData.client.name}
                                    onChange={(e) => updateClient({ name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="klant-adres">Adres</label>
                                <input
                                    id="klant-adres"
                                    placeholder="Straatnaam 123"
                                    value={currentData.client.address}
                                    onChange={(e) => updateClient({ address: e.target.value })}
                                />
                            </div>
                            <div className="mobile-grid-1-tablet-2" style={{ display: 'grid', gap: '1.5rem' }}>
                                <div>
                                    <label htmlFor="klant-postcode">Postcode</label>
                                    <input
                                        id="klant-postcode"
                                        placeholder="1234 AB"
                                        value={currentData.client.zip}
                                        onChange={(e) => updateClient({ zip: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label htmlFor="klant-stad">Stad</label>
                                    <input
                                        id="klant-stad"
                                        placeholder="Amsterdam"
                                        value={currentData.client.city}
                                        onChange={(e) => updateClient({ city: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="klant-land">Land (optioneel)</label>
                                <input
                                    id="klant-land"
                                    placeholder="Alleen invullen bij buitenlandse klanten"
                                    value={currentData.client.country}
                                    onChange={(e) => updateClient({ country: e.target.value })}
                                />
                            </div>
                            <div>
                                <label htmlFor="klant-btw">BTW-nummer Klant (optioneel)</label>
                                <input
                                    id="klant-btw"
                                    placeholder="NL123456789B01"
                                    value={currentData.client.vatNumber || ''}
                                    onChange={(e) => updateClient({ vatNumber: e.target.value })}
                                />
                            </div>
                            </>)}
                        </div>
                    </div>

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

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '3rem', flexWrap: 'wrap' }}>
                        <button className="premium-btn" onClick={handleDownloadPDF} style={{ flex: '2 1 240px', padding: '1rem' }}>
                            <Download size={20} /> Download PDF
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

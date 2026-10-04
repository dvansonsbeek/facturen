import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { Invoice, Quotation } from "@/types";
import { formatCurrency, formatDate, formatIban, lineTotal, summariseDocument, IBAN_PLACEHOLDER } from "@/lib/utils";

const COLORS = {
    primary: '#2563eb',
    text: '#000000',
    secondary: '#64748b',
    border: '#e2e8f0',
    muted: '#666666',
};

const styles = StyleSheet.create({
    page: {
        paddingTop: 48,
        // Extra ruimte onderaan: daar staat de vaste voettekst met de
        // betaalinstructies, die op elke pagina wordt herhaald.
        paddingBottom: 92,
        paddingHorizontal: 48,
        fontSize: 9.5,
        color: COLORS.text,
        fontFamily: 'Helvetica',
        lineHeight: 1.5,
    },

    header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 36 },
    headerLeft: { flex: 1 },
    headerRight: { flex: 1, textAlign: 'right' },
    logo: { height: 60, width: 120, marginBottom: 16, objectFit: 'contain' },
    title: {
        fontSize: 26,
        color: COLORS.primary,
        marginBottom: 10,
        lineHeight: 1.2,
        fontFamily: 'Helvetica-Bold',
    },
    senderName: { fontSize: 13, marginBottom: 6, fontFamily: 'Helvetica-Bold' },

    sectionHeading: {
        fontSize: 9,
        color: COLORS.secondary,
        marginBottom: 6,
        fontFamily: 'Helvetica-Bold',
    },
    clientBlock: { marginBottom: 36 },
    clientName: { fontSize: 11, fontFamily: 'Helvetica-Bold' },

    table: { marginBottom: 36 },
    tableHeader: {
        flexDirection: 'row',
        borderBottomWidth: 2,
        borderBottomColor: COLORS.border,
        paddingBottom: 8,
        fontFamily: 'Helvetica-Bold',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: COLORS.border,
        paddingVertical: 10,
    },
    colDescription: { flex: 1 },
    colQuantity: { width: 60, textAlign: 'center' },
    colPrice: { width: 80, textAlign: 'right' },
    colVat: { width: 50, textAlign: 'center' },
    colTotal: { width: 80, textAlign: 'right' },
    itemName: { fontFamily: 'Helvetica-Bold' },
    itemDescription: { fontSize: 8.5, color: COLORS.muted, marginTop: 2 },

    totals: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 36 },
    totalsBox: { width: 200 },
    totalsLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
    totalsVatLine: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 5,
        fontSize: 9,
        color: COLORS.secondary,
    },
    grandTotal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 2,
        borderTopColor: COLORS.primary,
        fontSize: 13,
        fontFamily: 'Helvetica-Bold',
    },

    exemption: {
        marginBottom: 24,
        fontSize: 9,
        color: COLORS.secondary,
        fontFamily: 'Helvetica-Oblique',
    },

    footer: {
        marginTop: 'auto',
        paddingTop: 24,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        fontSize: 8.5,
    },
    footerLine: { marginBottom: 5 },
    label: { fontFamily: 'Helvetica-Bold' },

    /** Paginanummering, rechtsonder op elke pagina. */
    /** Vaste voettekst, onderaan elke pagina. */
    pageFooter: {
        position: 'absolute',
        bottom: 36,
        left: 48,
        right: 48,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        fontSize: 8.5,
        color: COLORS.secondary,
    },
});

interface InvoiceDocumentProps {
    data: Invoice | Quotation;
    isQuotation?: boolean;
}

/**
 * De PDF-versie van het document.
 *
 * Deze deelt de btw-opstelling met het scherm via summariseDocument, zodat de
 * KOR-regel maar op een plek staat. De opmaak staat hier wel apart; de
 * end-to-end tests vergelijken de tekst van de PDF met die van het voorbeeld
 * zodat de twee niet uit elkaar kunnen lopen.
 */
export default function InvoiceDocument({ data, isQuotation }: InvoiceDocumentProps) {
    const isVatExempt = data.isVatExempt;
    const { subtotal, vatTotals, total } = summariseDocument(data.items, isVatExempt);
    const invoice = data as Invoice;
    const quotation = data as Quotation;
    const bankAccountDisplay = invoice.bankAccount ? formatIban(invoice.bankAccount) : IBAN_PLACEHOLDER;

    // De betaalinstructies staan in de vaste voettekst; dit blok loopt mee met
    // de inhoud en bevat alleen wat eenmalig onderaan het document hoort.
    const hasFlowFooter = !!data.notes || (!isQuotation && !!data.paymentConditions);

    return (
        <Document
            title={`${isQuotation ? 'Offerte' : 'Factuur'} ${isQuotation ? quotation.quotationNumber : invoice.invoiceNumber}`}
            author={data.sender.name}
        >
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <View style={styles.headerLeft}>
                        {/* react-pdf's Image is een PDF-primitief, geen <img>: alt bestaat hier niet. */}
                        {/* eslint-disable-next-line jsx-a11y/alt-text */}
                        {data.sender.logoUrl && <Image src={data.sender.logoUrl} style={styles.logo} />}
                        <Text style={styles.title}>{isQuotation ? 'OFFERTE' : 'FACTUUR'}</Text>
                        <Text style={styles.label}>
                            # {isQuotation ? quotation.quotationNumber : invoice.invoiceNumber}
                        </Text>
                        <Text>Datum: {formatDate(data.date)}</Text>
                        {isQuotation && (
                            <Text>Geldig tot: {formatDate(quotation.validUntil)}</Text>
                        )}
                    </View>

                    <View style={styles.headerRight}>
                        <Text style={styles.senderName}>{data.sender.name.toUpperCase()}</Text>
                        <Text>{data.sender.address}</Text>
                        <Text>{data.sender.zip} {data.sender.city}</Text>
                        <Text>{data.sender.country}</Text>
                        {!!data.sender.vatNumber && <Text>BTW: {data.sender.vatNumber}</Text>}
                        {!!data.sender.kvkNumber && <Text>KvK: {data.sender.kvkNumber}</Text>}
                        <Text>Email: {data.sender.email}</Text>
                    </View>
                </View>

                <View style={styles.clientBlock}>
                    <Text style={styles.sectionHeading}>
                        {isQuotation ? 'OFFERTE VOOR:' : 'FACTUREREN AAN:'}
                    </Text>
                    <Text style={styles.clientName}>{data.client.name}</Text>
                    {!!data.client.address && <Text>{data.client.address}</Text>}
                    {!!(data.client.zip || data.client.city) && (
                        <Text>{data.client.zip} {data.client.city}</Text>
                    )}
                    {!!data.client.country && <Text>{data.client.country}</Text>}
                    {!!data.client.vatNumber && <Text>BTW: {data.client.vatNumber}</Text>}
                </View>

                <View style={styles.table}>
                    <View style={styles.tableHeader} fixed>
                        <Text style={styles.colDescription}>Beschrijving</Text>
                        <Text style={styles.colQuantity}>Aantal</Text>
                        <Text style={styles.colPrice}>Prijs</Text>
                        {!isVatExempt && <Text style={styles.colVat}>BTW</Text>}
                        <Text style={styles.colTotal}>Totaal</Text>
                    </View>

                    {data.items.map((item) => (
                        <View key={item.id} style={styles.tableRow} wrap={false}>
                            <View style={styles.colDescription}>
                                <Text style={styles.itemName}>{item.name || 'Geen naam'}</Text>
                                {!!item.description && (
                                    <Text style={styles.itemDescription}>{item.description}</Text>
                                )}
                            </View>
                            <Text style={styles.colQuantity}>
                                {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                            </Text>
                            <Text style={styles.colPrice}>{formatCurrency(item.unitPrice)}</Text>
                            {!isVatExempt && <Text style={styles.colVat}>{item.vatRate}%</Text>}
                            <Text style={styles.colTotal}>{formatCurrency(lineTotal(item))}</Text>
                        </View>
                    ))}
                </View>

                <View style={styles.totals}>
                    <View style={styles.totalsBox}>
                        {!isVatExempt && (
                            <View style={styles.totalsLine}>
                                <Text>Subtotaal:</Text>
                                <Text>{formatCurrency(subtotal)}</Text>
                            </View>
                        )}
                        {Object.entries(vatTotals).map(([rate, amount]) => (
                            <View key={rate} style={styles.totalsVatLine}>
                                <Text>BTW ({rate}%):</Text>
                                <Text>{formatCurrency(amount)}</Text>
                            </View>
                        ))}
                        <View style={styles.grandTotal}>
                            <Text>Totaal:</Text>
                            <Text>{formatCurrency(total)}</Text>
                        </View>
                    </View>
                </View>

                {isVatExempt && (
                    <Text style={styles.exemption}>
                        Vrijgesteld van btw op grond van de kleineondernemersregeling (art. 25 Wet OB 1968).
                    </Text>
                )}

                {hasFlowFooter && (
                    <View style={styles.footer}>
                        {!!data.notes && (
                            <Text style={styles.footerLine}>
                                <Text style={styles.label}>Opmerkingen: </Text>
                                {data.notes}
                            </Text>
                        )}
                        {!isQuotation && !!data.paymentConditions && (
                            <Text style={styles.footerLine}>
                                <Text style={styles.label}>Betalingsvoorwaarden: </Text>
                                {data.paymentConditions}
                            </Text>
                        )}
                    </View>
                )}

                {/* fixed herhaalt dit blok onderaan elke pagina, zodat wie
                    betaalt het rekeningnummer bij de hand heeft ook als de
                    regels over meerdere pagina's lopen.

                    Paginanummering ("pagina 1 van 2") ontbreekt bewust: het
                    gebruikelijke <Text fixed render={...} /> wordt in
                    @react-pdf/renderer 4.9.0 niet aangeroepen, en het
                    alternatief (Page.layout) zet de hele PDF op een
                    experimentele pagineermotor die van deze factuur van twee
                    pagina's er vijf maakte, met een verkeerd paginatotaal.
                    Te duur voor een nummering; opnieuw proberen bij een
                    volgende versie van react-pdf. */}
                {!isQuotation && (
                    <View style={styles.pageFooter} fixed>
                        <Text>
                            Wij verzoeken u vriendelijk het totale factuurbedrag over te maken naar
                            rekeningnummer <Text style={styles.label}>{bankAccountDisplay}</Text>
                            {' '}ten name van <Text style={styles.label}>{data.sender.name}</Text>.
                            {' '}Vermeld hierbij a.u.b. het factuurnummer:{' '}
                            <Text style={styles.label}>{invoice.invoiceNumber}</Text>.
                            {' '}Hartelijk dank voor uw vertrouwen!
                        </Text>
                        {!!invoice.bic && <Text>BIC: {invoice.bic}</Text>}
                    </View>
                )}
            </Page>
        </Document>
    );
}

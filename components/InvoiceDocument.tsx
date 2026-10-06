import { Document, Page, View, Text, Image, StyleSheet, Svg, Path, Rect } from "@react-pdf/renderer";
import { Invoice, Quotation } from "@/types";
import { creditReference, formatCurrency, formatDate, formatIban, lineTotal, summariseDocument, supplyDateOnDocument, IBAN_PLACEHOLDER } from "@/lib/utils";
import { chargesVat, clientVatStatement, schemeOf, statementFor } from "@/lib/vat-schemes";
import { paymentQrMatrix } from "@/lib/payment-qr";
import { qrPath } from "./QrCode";

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

    /* De betaal-QR met zijn bijschrift ernaast. */
    qrBlok: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 20,
    },

    qrBijschrift: {
        flex: 1,
        fontSize: 8,
        color: COLORS.secondary,
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
 * Deze deelt de btw-opstelling met het scherm via summariseDocument en het
 * btw-regime via lib/vat-schemes.ts, zodat die regels maar op één plek staan.
 * De opmaak staat hier wel apart; de end-to-end tests vergelijken de tekst van
 * de PDF met die van het voorbeeld zodat de twee niet uit elkaar kunnen lopen.
 */
export default function InvoiceDocument({ data, isQuotation }: InvoiceDocumentProps) {
    const scheme = schemeOf(data);
    const isVatExempt = !chargesVat(scheme);
    const statement = statementFor(scheme);
    const clientVatLine = clientVatStatement(scheme, data.client.vatNumber);
    const supplyDate = supplyDateOnDocument(data);
    const creditRef = creditReference(data);
    const qr = isQuotation ? null : paymentQrMatrix(data as Invoice);
    // Zelfde stille marge als op het scherm; zonder die rand vinden veel
    // scanners de code niet terug.
    const qrZijde = (qr?.length ?? 0) + 8;
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
                        <Text style={styles.title}>
                            {isQuotation ? 'OFFERTE' : creditRef ? 'CREDITFACTUUR' : 'FACTUUR'}
                        </Text>
                        <Text style={styles.label}>
                            # {isQuotation ? quotation.quotationNumber : invoice.invoiceNumber}
                        </Text>
                        <Text>Datum: {formatDate(data.date)}</Text>
                        {/* Alleen als hij afwijkt: dan is hij verplicht (art. 35a lid 1
                            Wet OB 1968), en gelijk aan de factuurdatum is hij ruis. */}
                        {supplyDate && (
                            <Text>Datum levering/dienst: {formatDate(supplyDate)}</Text>
                        )}
                        {isQuotation && (
                            <Text>Geldig tot: {formatDate(quotation.validUntil)}</Text>
                        )}
                        {creditRef && <Text style={styles.label}>{creditRef}</Text>}
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
                            <Text>{creditRef ? 'Te crediteren:' : 'Totaal:'}</Text>
                            <Text>{formatCurrency(total)}</Text>
                        </View>
                    </View>
                </View>

                {statement && (
                    <Text style={styles.exemption}>
                        {statement}{clientVatLine ? ` ${clientVatLine}` : ''}
                    </Text>
                )}

                {/* In de lopende inhoud en niet in de vaste voettekst: die wordt
                    op elke pagina herhaald, en één betaalopdracht hoort één keer
                    op een document te staan. Zo schuift hij bovendien netjes mee
                    in plaats van over de regels heen te vallen. */}
                {qr && (
                    <View style={styles.qrBlok}>
                        <Svg width={58} height={58} viewBox={`0 0 ${qrZijde} ${qrZijde}`}>
                            <Rect x={0} y={0} width={qrZijde} height={qrZijde} fill="#ffffff" />
                            <Path d={qrPath(qr)} fill="#000000" />
                        </Svg>
                        <Text style={styles.qrBijschrift}>
                            Scan met je bankapp om de overschrijving ingevuld te krijgen. Werkt
                            niet bij elke bank; de gegevens onderaan kun je altijd overnemen.
                        </Text>
                    </View>
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

                    De paginanummering staat hier niet: die wordt achteraf op de
                    afgeronde PDF gestempeld, zie lib/page-numbers.ts. */}
                {!isQuotation && (
                    <View style={styles.pageFooter} fixed>
                        {/* Op een creditfactuur gaat het geld de andere kant op. */}
                        {creditRef ? (
                            <Text>
                                Dit bedrag wordt met u verrekend of aan u terugbetaald. Er hoeft naar
                                aanleiding van deze creditfactuur niets te worden overgemaakt.
                            </Text>
                        ) : (
                            <Text>
                                Wij verzoeken u vriendelijk het totale factuurbedrag over te maken naar
                                rekeningnummer <Text style={styles.label}>{bankAccountDisplay}</Text>
                                {' '}ten name van <Text style={styles.label}>{data.sender.name}</Text>.
                                {' '}Vermeld hierbij a.u.b. het factuurnummer:{' '}
                                <Text style={styles.label}>{invoice.invoiceNumber}</Text>.
                                {' '}Hartelijk dank voor uw vertrouwen!
                            </Text>
                        )}
                        {!creditRef && !!invoice.bic && <Text>BIC: {invoice.bic}</Text>}
                    </View>
                )}

            </Page>
        </Document>
    );
}

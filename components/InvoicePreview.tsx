"use client";

import { Invoice, Quotation } from "@/types";
import { creditReference, formatCurrency, formatDate, formatIban, lineTotal, summariseDocument, supplyDateOnDocument, IBAN_PLACEHOLDER } from "@/lib/utils";
import { chargesVat, clientVatStatement, schemeOf, statementFor } from "@/lib/vat-schemes";
import { paymentQrMatrix } from "@/lib/payment-qr";
import QrCode from "./QrCode";

interface InvoicePreviewProps {
    data: Invoice | Quotation;
    isQuotation?: boolean;
}

export default function InvoicePreview({ data, isQuotation }: InvoicePreviewProps) {
    // Alle regimes behalve het gewone laten de btw weg; alleen de vermelding
    // eronder verschilt. Zie lib/vat-schemes.ts.
    const scheme = schemeOf(data);
    const isVatExempt = !chargesVat(scheme);
    const statement = statementFor(scheme);
    const clientVatLine = clientVatStatement(scheme, data.client.vatNumber);
    const supplyDate = supplyDateOnDocument(data);
    const creditRef = creditReference(data);
    // Alleen op een factuur: een offerte vraagt nog niet om betaling, en een
    // creditfactuur juist niet (dat zit in paymentQrMatrix zelf).
    const qr = isQuotation ? null : paymentQrMatrix(data as Invoice);
    const { subtotal, discount, vatTotals, total } = summariseDocument(
        data.items, isVatExempt, data.discount,
    );
    const bankAccount = (data as Invoice).bankAccount;
    const bankAccountDisplay = bankAccount ? formatIban(bankAccount) : IBAN_PLACEHOLDER;

    return (
        <div
            className="invoice-preview"
            style={{
                padding: '3rem',
                minHeight: '1100px',
                width: '800px',
                maxWidth: '800px',
                margin: '0 auto',
                color: '#000',
                fontSize: '0.92rem',
                backgroundColor: '#ffffff',
                boxShadow: 'none',
                border: 'none'
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3rem' }}>
                <div style={{ flex: 1 }}>
                    {data.sender.logoUrl ? (
                        <img
                            src={data.sender.logoUrl}
                            alt="Logo"
                            style={{ height: '120px', width: '240px', marginBottom: '1.5rem', objectFit: 'contain' }}
                        />
                    ) : (
                        <div style={{ height: '120px', width: '240px', marginBottom: '1.5rem' }} />
                    )}
                    <h1 style={{ fontSize: '2.5rem', color: 'var(--primary)', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
                        {isQuotation ? 'OFFERTE' : creditRef ? 'CREDITFACTUUR' : 'FACTUUR'}
                    </h1>
                    <p style={{ fontWeight: 600 }}># {isQuotation ? (data as Quotation).quotationNumber : (data as Invoice).invoiceNumber}</p>
                    <p>Datum: {formatDate(data.date)}</p>
                    {/* Alleen als hij afwijkt: dan is hij verplicht (art. 35a lid 1
                        Wet OB 1968), en gelijk aan de factuurdatum is hij ruis. */}
                    {supplyDate && <p>Datum levering/dienst: {formatDate(supplyDate)}</p>}
                    {isQuotation && <p>Geldig tot: {formatDate((data as Quotation).validUntil)}</p>}
                    {/* De verwijzing hoort prominent: zonder het oorspronkelijke
                        nummer is niet na te gaan wát er gecorrigeerd wordt. */}
                    {creditRef && <p style={{ fontWeight: 600 }}>{creditRef}</p>}
                </div>
                <div style={{ textAlign: 'right', flex: 1 }}>
                    <h2 style={{ fontSize: '1.25rem', color: 'var(--foreground)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>{data.sender.name}</h2>
                    <p>{data.sender.address}</p>
                    <p>{data.sender.zip} {data.sender.city}</p>
                    <p>{data.sender.country}</p>
                    {data.sender.vatNumber && <p>BTW: {data.sender.vatNumber}</p>}
                    {data.sender.kvkNumber && <p>KvK: {data.sender.kvkNumber}</p>}
                    <p>Email: {data.sender.email}</p>
                </div>
            </div>

            <div style={{ marginBottom: '3rem' }}>
                <h3 style={{ textTransform: 'uppercase', fontSize: '0.9rem', color: 'var(--secondary)', marginBottom: '0.5rem' }}>
                    {isQuotation ? 'Offerte voor:' : 'Factureren aan:'}
                </h3>
                <p style={{ fontWeight: 600, fontSize: '1.1rem' }}>{data.client.name}</p>
                {data.client.address && <p>{data.client.address}</p>}
                {(data.client.zip || data.client.city) && <p>{data.client.zip} {data.client.city}</p>}
                {data.client.country && <p>{data.client.country}</p>}
                {data.client.vatNumber && <p>BTW: {data.client.vatNumber}</p>}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '3rem' }}>
                <thead>
                    <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                        <th style={{ padding: '0.75rem 0' }}>Beschrijving</th>
                        <th style={{ padding: '0.75rem 0', textAlign: 'center' }}>Aantal</th>
                        <th style={{ padding: '0.75rem 0', textAlign: 'right' }}>Prijs</th>
                        {!isVatExempt && <th style={{ padding: '0.75rem 0', textAlign: 'center' }}>BTW</th>}
                        <th style={{ padding: '0.75rem 0', textAlign: 'right' }}>Totaal</th>
                    </tr>
                </thead>
                <tbody>
                    {data.items.map((item) => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '1rem 0' }}>
                                <div style={{ fontWeight: 600 }}>{item.name || 'Geen naam'}</div>
                                {item.description && <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.25rem' }}>{item.description}</div>}
                            </td>
                            <td style={{ padding: '1rem 0', textAlign: 'center' }}>
                                {item.quantity}{item.unit ? ` ${item.unit}` : ''}
                            </td>
                            <td style={{ padding: '1rem 0', textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                            {!isVatExempt && <td style={{ padding: '1rem 0', textAlign: 'center' }}>{item.vatRate}%</td>}
                            <td style={{ padding: '1rem 0', textAlign: 'right' }}>{formatCurrency(lineTotal(item))}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '3rem' }}>
                <div style={{ width: '250px' }}>
                    {/* Het subtotaal staat er zodra het iets toevoegt. Zonder btw
                        én zonder korting is het hetzelfde getal als het totaal, en
                        dan is het ruis — vandaar dat het onder de KOR wegviel. Staat
                        er wél korting op, dan is het juist nodig: anders zie je niet
                        waar de korting vanaf gaat. */}
                    {(!isVatExempt || discount > 0) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Subtotaal:</span>
                            <span>{formatCurrency(subtotal)}</span>
                        </div>
                    )}
                    {discount > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                            <span>Korting:</span>
                            {/* Met een minteken, want dit gaat eraf. De bedragen zelf
                                blijven positief — net als op een creditfactuur zegt
                                het document al welke kant het op gaat. */}
                            <span>−{formatCurrency(discount)}</span>
                        </div>
                    )}
                    {Object.entries(vatTotals).map(([rate, amount]) => (
                        <div key={rate} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--secondary)' }}>
                            <span>BTW ({rate}%):</span>
                            <span>{formatCurrency(amount)}</span>
                        </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', paddingTop: '1rem', borderTop: '2px solid var(--primary)', fontWeight: 700, fontSize: '1.2rem' }}>
                        {/* Bij een creditfactuur is dit geen bedrag dat je nog
                            krijgt maar een bedrag dat je terugneemt. */}
                        <span>{creditRef ? 'Te crediteren:' : 'Totaal:'}</span>
                        <span>{formatCurrency(total)}</span>
                    </div>
                </div>
            </div>

            {statement && (
                <div style={{ marginBottom: '2rem', fontStyle: 'italic', fontSize: '0.9rem', color: 'var(--secondary)' }}>
                    {statement}
                    {/* Bij verlegging en een intracommunautaire levering moet het
                        btw-nummer van de afnemer erbij: daarmee geeft hij de btw aan. */}
                    {clientVatLine && <> {clientVatLine}</>}
                </div>
            )}

            {(data.notes || (!isQuotation && (data.paymentConditions || (data as Invoice).bankAccount))) && (
                <div style={{ marginTop: 'auto', paddingTop: '2rem', borderTop: '1px solid var(--border)', fontSize: '0.85rem' }}>
                    {data.notes && <p style={{ marginBottom: '0.5rem' }}><strong>Opmerkingen:</strong> {data.notes}</p>}
                    {!isQuotation && data.paymentConditions && (
                        <p style={{ marginBottom: '0.5rem' }}><strong>Betalingsvoorwaarden:</strong> {data.paymentConditions}</p>
                    )}
                    {!isQuotation && (
                        <div style={{ marginTop: '1rem', color: 'var(--secondary)' }}>
                            {/* Op een creditfactuur gaat het geld de andere kant op;
                                "maak dit bedrag over" zou daar het tegenovergestelde
                                vragen van wat er moet gebeuren. */}
                            {creditRef ? (
                                <p>
                                    Dit bedrag wordt met u verrekend of aan u terugbetaald. Er hoeft
                                    naar aanleiding van deze creditfactuur niets te worden overgemaakt.
                                </p>
                            ) : (
                                <p>
                                    Wij verzoeken u vriendelijk het totale factuurbedrag over te maken naar
                                    rekeningnummer <strong>{bankAccountDisplay}</strong> ten name van{' '}
                                    <strong>{data.sender.name}</strong>. Vermeld hierbij a.u.b. het
                                    factuurnummer: <strong>{(data as Invoice).invoiceNumber}</strong>.
                                    Hartelijk dank voor uw vertrouwen!
                                </p>
                            )}
                            {!creditRef && (data as Invoice).bic && <p>BIC: {(data as Invoice).bic}</p>}
                        </div>
                    )}
                    {qr && (
                        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '1rem' }}>
                            <QrCode matrix={qr} size={88} />
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--secondary)' }}>
                                Scan deze code met je bankapp om de overschrijving ingevuld te
                                krijgen. Werkt niet bij elke bank; de gegevens hierboven kun je
                                altijd overnemen.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

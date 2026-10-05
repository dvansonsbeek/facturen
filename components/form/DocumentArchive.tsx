"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Download, Eye, Lock, Trash2, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { BewaardDocument } from "@/lib/documents";
import InvoicePreview from "../InvoicePreview";

interface DocumentArchiveProps {
    documenten: readonly BewaardDocument[];
    /** Onwaar als de browser geen IndexedDB geeft; dan bewaart hij niets. */
    opslagWerkt: boolean;
    /** Waar als er een wachtwoordzin staat die in deze sessie nog niet is ingevoerd. */
    vergrendeld: boolean;
    open: boolean;
    onToggle: (open: boolean) => void;
    onDuplicate: (bewaard: BewaardDocument) => void;
    onDelete: (bewaard: BewaardDocument) => void;
    onDownload: (bewaard: BewaardDocument) => void;
}

/**
 * De facturen en offertes die je bewaard hebt.
 *
 * Een bewaard document staat vast en is niet meer te wijzigen, dus het opent in
 * een venster erboven en niet in het formulier. Dat is geen schermversiering:
 * zou het het live voorbeeld overnemen, dan typte je in het formulier zonder
 * dat het voorbeeld meebewoog. Wil je er echt iets aan veranderen, dan is dat
 * een nieuw document — vandaar Dupliceren.
 */
export default function DocumentArchive({
    documenten, opslagWerkt, vergrendeld, open, onToggle, onDuplicate, onDelete, onDownload,
}: DocumentArchiveProps) {
    const [bekeken, setBekeken] = useState<BewaardDocument | null>(null);
    const venster = useRef<HTMLDialogElement>(null);

    // showModal() geeft Escape en het vasthouden van de focus gratis; dat is
    // precies het gedrag dat je anders zelf moet nabouwen.
    useEffect(() => {
        const dialoog = venster.current;
        if (!dialoog) return;
        if (bekeken && !dialoog.open) dialoog.showModal();
        if (!bekeken && dialoog.open) dialoog.close();
    }, [bekeken]);

    return (<>
        <details className="foldout" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
            <summary>
                <h3>Bewaarde documenten{documenten.length > 0 ? ` (${documenten.length})` : ''}</h3>
            </summary>
            <div className="foldout-body">
                {!opslagWerkt && (
                    <p role="status" style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: 'var(--error)' }}>
                        Deze browser geeft geen opslagruimte vrij, bijvoorbeeld in privémodus.
                        Bewaren werkt daardoor niet. Download je document als PDF om het te bewaren.
                    </p>
                )}

                <p style={{ margin: '0 0 1rem', fontSize: '0.75rem', color: 'var(--muted)' }}>
                    Een bewaard document staat vast: het bevat je bedrijfs- en betaalgegevens zoals
                    ze waren op het moment van bewaren, en is daarna niet meer te wijzigen. Het
                    staat in deze browser, op dit apparaat, en gaat niet naar een server.
                </p>

                {vergrendeld ? (
                    /* Niet simpelweg een lege lijst: die ziet eruit alsof je archief
                       weg is, en dat is precies de verkeerde conclusie. */
                    <p className="archief-vergrendeld">
                        <Lock size={16} />
                        Je archief is versleuteld. Voer je wachtwoordzin in bij
                        <strong> Beveiliging en privacy</strong> om het te openen.
                    </p>
                ) : documenten.length === 0 ? (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Nog niets bewaard. Gebruik <strong>Bewaren</strong> onderaan het formulier om
                        een factuur of offerte vast te leggen.
                    </p>
                ) : (
                    <ul className="archief-lijst">
                        {documenten.map((bewaard) => (
                            <li key={bewaard.id} className="archief-regel">
                                <div className="archief-omschrijving">
                                    <strong>{bewaard.soort === 'offerte' ? 'Offerte' : 'Factuur'} {bewaard.nummer}</strong>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                                        {formatDate(bewaard.datum)} · {bewaard.klant || 'geen klantnaam'} · {formatCurrency(bewaard.totaal)}
                                    </span>
                                </div>
                                <div className="archief-knoppen">
                                    <button
                                        className="premium-btn compact"
                                        onClick={() => setBekeken(bewaard)}
                                        title="Dit document bekijken"
                                    >
                                        <Eye size={14} /> <span>Bekijken</span>
                                    </button>
                                    <button
                                        className="premium-btn compact"
                                        onClick={() => onDownload(bewaard)}
                                        title="Dit document opnieuw als PDF downloaden"
                                    >
                                        <Download size={14} /> <span>PDF</span>
                                    </button>
                                    <button
                                        className="premium-btn compact"
                                        onClick={() => onDuplicate(bewaard)}
                                        title="De regels en klant overnemen in een nieuw concept"
                                    >
                                        <Copy size={14} /> <span>Dupliceren</span>
                                    </button>
                                    <button
                                        className="premium-btn compact"
                                        onClick={() => onDelete(bewaard)}
                                        title="Dit document uit je archief verwijderen"
                                    >
                                        <Trash2 size={14} /> <span>Verwijderen</span>
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </details>

        {/* Buiten de <details>: een dichtgeklapte details zet zijn inhoud op
            display:none, en een modaal venster in zo'n tak komt niet in beeld.
            Altijd in de boom, zodat showModal() een element heeft om te openen. */}
        <dialog
                ref={venster}
                className="archief-venster"
                onClose={() => setBekeken(null)}
                onCancel={() => setBekeken(null)}
            >
                {bekeken && (
                    <>
                        <div className="archief-venster-balk">
                            <div>
                                <strong>{bekeken.soort === 'offerte' ? 'Offerte' : 'Factuur'} {bekeken.nummer}</strong>
                                <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--muted)' }}>
                                    Bewaard document — niet meer te wijzigen
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                <button className="premium-btn compact" onClick={() => onDownload(bekeken)}>
                                    <Download size={14} /> <span>PDF</span>
                                </button>
                                <button
                                    className="premium-btn compact"
                                    onClick={() => { onDuplicate(bekeken); setBekeken(null); }}
                                    title="De regels en klant overnemen in een nieuw concept"
                                >
                                    <Copy size={14} /> <span>Dupliceren</span>
                                </button>
                                <button className="premium-btn compact" onClick={() => setBekeken(null)} aria-label="Sluiten">
                                    <X size={14} /> <span>Sluiten</span>
                                </button>
                            </div>
                        </div>
                        <div className="archief-venster-blad">
                            <InvoicePreview data={bekeken.document} isQuotation={bekeken.soort === 'offerte'} />
                        </div>
                    </>
                )}
        </dialog>
    </>);
}

"use client";

import { useRef } from "react";
import { Trash2 } from "lucide-react";
import { Sender } from "@/types";

interface CompanyDetailsProps {
    sender: Sender;
    onChange: (patch: Partial<Sender>) => void;
    onLogoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    /** Haalt het logo weg. Alleen zichtbaar zolang er een logo staat. */
    onLogoRemove: () => void;
    /** Melding als het logo niet bewaard kon worden; null als er niets aan de hand is. */
    logoWarning: string | null;
    open: boolean;
    onToggle: (open: boolean) => void;
}

/** Je eigen bedrijfsgegevens. Horen bij jou, niet bij een document. */
export default function CompanyDetails({
    sender, onChange, onLogoChange, onLogoRemove, logoWarning, open, onToggle,
}: CompanyDetailsProps) {
    // Nodig om het bestandsveld mee leeg te maken bij Verwijderen; zie daar.
    const bestandsveld = useRef<HTMLInputElement>(null);

    return (
        <details className="foldout" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
            <summary><h3>Mijn Bedrijfsgegevens</h3></summary>
            <div className="foldout-body" style={{ display: 'grid', gap: '1.5rem' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem', border: '2px dashed var(--border)', borderRadius: 'var(--radius)' }}>
                    <div style={{ flex: 1 }}>
                        <label htmlFor="bedrijf-logo" style={{ fontSize: '0.75rem', marginBottom: '0.5rem' }}>Logo Uploaden</label>
                        <input ref={bestandsveld} id="bedrijf-logo" type="file" accept="image/*" onChange={onLogoChange} style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem' }} />
                        {logoWarning && (
                            <p role="status" style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: 'var(--error)' }}>
                                {logoWarning}
                            </p>
                        )}
                    </div>
                    {sender.logoUrl && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                            {/* Een gewone <img>: het logo is een data-URL uit de browser van de
                                gebruiker, en daar kan next/image niets mee. Bovendien staat
                                beeldoptimalisatie uit bij een statische export. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={sender.logoUrl} alt="Logo" style={{ height: '50px', maxWidth: '100px', objectFit: 'contain' }} />
                            {/* Het bestandsveld moet mee leeggemaakt worden. Blijft de gekozen
                                bestandsnaam erin staan, dan levert hetzelfde bestand opnieuw
                                kiezen geen change-gebeurtenis op — en krijg je het logo dat je
                                net weghaalde dus niet meer terug. */}
                            {/* Dezelfde opmaak als de andere verwijderknoppen in dit
                                formulier — het klantenboek en het archief gebruiken
                                allebei premium-btn compact. Deze stond op losse
                                inline-stijlen en pakte daardoor alleen de kale
                                button-reset mee: geen achtergrond, geen padding, geen
                                afronding. Hij zag eruit als tekst met een prullenbakje
                                ervoor in plaats van als een knop. */}
                            <button
                                type="button"
                                className="premium-btn compact"
                                title="Dit logo van je documenten halen"
                                onClick={() => {
                                    onLogoRemove();
                                    if (bestandsveld.current) bestandsveld.current.value = '';
                                }}
                            >
                                <Trash2 size={14} /> <span>Verwijderen</span>
                            </button>
                        </div>
                    )}
                </div>
                <div>
                    <label htmlFor="bedrijf-naam">Bedrijfsnaam</label>
                    <input
                        id="bedrijf-naam"
                        placeholder="Mijn Bedrijf BV"
                        value={sender.name}
                        onChange={(e) => onChange({ name: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="bedrijf-adres">Adresregel 1</label>
                    <input
                        id="bedrijf-adres"
                        placeholder="Straatnaam 1"
                        value={sender.address}
                        onChange={(e) => onChange({ address: e.target.value })}
                    />
                </div>
                <div className="mobile-grid-1-tablet-2" style={{ display: 'grid', gap: '1.5rem' }}>
                    <div>
                        <label htmlFor="bedrijf-postcode">Postcode</label>
                        <input
                            id="bedrijf-postcode"
                            placeholder="1234 AB"
                            value={sender.zip}
                            onChange={(e) => onChange({ zip: e.target.value })}
                        />
                    </div>
                    <div>
                        <label htmlFor="bedrijf-stad">Stad</label>
                        <input
                            id="bedrijf-stad"
                            placeholder="Amsterdam"
                            value={sender.city}
                            onChange={(e) => onChange({ city: e.target.value })}
                        />
                    </div>
                </div>
                <div>
                    <label htmlFor="bedrijf-land">Land</label>
                    <input
                        id="bedrijf-land"
                        placeholder="Nederland"
                        value={sender.country}
                        onChange={(e) => onChange({ country: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="bedrijf-email">E-mail Adres</label>
                    <input
                        id="bedrijf-email"
                        placeholder="info@mijnbedrijf.nl"
                        value={sender.email}
                        onChange={(e) => onChange({ email: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="bedrijf-btw">BTW-nummer</label>
                    <input
                        id="bedrijf-btw"
                        placeholder="NL123456789B01"
                        value={sender.vatNumber}
                        onChange={(e) => onChange({ vatNumber: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="bedrijf-kvk">KvK-nummer</label>
                    <input
                        id="bedrijf-kvk"
                        placeholder="12345678"
                        value={sender.kvkNumber || ''}
                        onChange={(e) => onChange({ kvkNumber: e.target.value })}
                    />
                </div>
            </div>
        </details>
    );
}

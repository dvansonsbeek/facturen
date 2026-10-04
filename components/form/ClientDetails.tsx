"use client";

import { Plus, Pencil, Trash2 } from "lucide-react";
import { Client } from "@/types";
import type { SavedClient } from "@/lib/clients";

interface ClientDetailsProps {
    client: Client;
    onChange: (patch: Partial<Client>) => void;
    savedClients: SavedClient[];
    selectedClientId: string;
    onSelect: (id: string) => void;
    onSave: () => void;
    onDelete: () => void;
    onEdit: () => void;
    /** Of de velden openstaan. Bij een bewaarde klant staan ze dicht. */
    fieldsVisible: boolean;
    /** Of de ingevulde naam al in het boek staat; bepaalt Opslaan of Bijwerken. */
    nameIsKnown: boolean;
}

/**
 * De klant van dit document, plus het klantenboek.
 *
 * Kiezen vult de velden; die blijven van dit ene document. Pas Opslaan schrijft
 * terug naar het boek. Bij een bewaarde klant staan de velden dicht, want het
 * voorbeeld laat al zien om wie het gaat.
 */
export default function ClientDetails({
    client, onChange, savedClients, selectedClientId, onSelect,
    onSave, onDelete, onEdit, fieldsVisible, nameIsKnown,
}: ClientDetailsProps) {
    return (
        <div style={{ marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Klantgegevens</h3>
            <div style={{ display: 'grid', gap: '1.5rem' }}>
                <div style={{ padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', display: 'grid', gap: '0.75rem' }}>
                    <div>
                        <label htmlFor="klantKiezen">Klant</label>
                        <select
                            id="klantKiezen"
                            value={selectedClientId}
                            onChange={(e) => onSelect(e.target.value)}
                            style={{ width: '100%' }}
                        >
                            <option value="">— Nieuwe klant —</option>
                            {savedClients.map(saved => (
                                <option key={saved.id} value={saved.id}>{saved.name}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {fieldsVisible ? (
                            <button
                                className="premium-btn compact"
                                onClick={onSave}
                                disabled={!client.name.trim()}
                                title="Deze klant in je klantenboek bewaren"
                            >
                                <Plus size={14} /> <span>{nameIsKnown ? 'Bijwerken' : 'Opslaan'}</span>
                            </button>
                        ) : (
                            <button
                                className="premium-btn compact"
                                onClick={onEdit}
                                title="De gegevens van deze klant aanpassen"
                            >
                                <Pencil size={14} /> <span>Bewerken</span>
                            </button>
                        )}
                        <button
                            className="premium-btn compact"
                            onClick={onDelete}
                            disabled={!selectedClientId}
                            title="Deze klant uit je klantenboek verwijderen"
                        >
                            <Trash2 size={14} /> <span>Verwijderen</span>
                        </button>
                    </div>
                </div>

                {fieldsVisible && (<>
                    <div>
                        <label htmlFor="klant-naam">Klantnaam / Bedrijfsnaam</label>
                        <input
                            id="klant-naam"
                            placeholder="Naam van de klant"
                            value={client.name}
                            onChange={(e) => onChange({ name: e.target.value })}
                        />
                    </div>
                    <div>
                        <label htmlFor="klant-adres">Adres</label>
                        <input
                            id="klant-adres"
                            placeholder="Straatnaam 123"
                            value={client.address}
                            onChange={(e) => onChange({ address: e.target.value })}
                        />
                    </div>
                    <div className="mobile-grid-1-tablet-2" style={{ display: 'grid', gap: '1.5rem' }}>
                        <div>
                            <label htmlFor="klant-postcode">Postcode</label>
                            <input
                                id="klant-postcode"
                                placeholder="1234 AB"
                                value={client.zip}
                                onChange={(e) => onChange({ zip: e.target.value })}
                            />
                        </div>
                        <div>
                            <label htmlFor="klant-stad">Stad</label>
                            <input
                                id="klant-stad"
                                placeholder="Amsterdam"
                                value={client.city}
                                onChange={(e) => onChange({ city: e.target.value })}
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="klant-land">Land (optioneel)</label>
                        <input
                            id="klant-land"
                            placeholder="Alleen invullen bij buitenlandse klanten"
                            value={client.country}
                            onChange={(e) => onChange({ country: e.target.value })}
                        />
                    </div>
                    <div>
                        <label htmlFor="klant-btw">BTW-nummer Klant (optioneel)</label>
                        <input
                            id="klant-btw"
                            placeholder="NL123456789B01"
                            value={client.vatNumber || ''}
                            onChange={(e) => onChange({ vatNumber: e.target.value })}
                        />
                    </div>
                </>)}
            </div>
        </div>
    );
}

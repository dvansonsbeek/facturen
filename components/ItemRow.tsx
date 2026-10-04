"use client";

import { useId } from "react";
import { Trash2 } from "lucide-react";
import { LineItem } from "@/types";

interface ItemRowProps {
  item: LineItem;
  onUpdate: (id: string, updates: Partial<LineItem>) => void;
  onRemove: (id: string) => void;
  isVatExempt?: boolean;
}

export default function ItemRow({ item, onUpdate, onRemove, isVatExempt }: ItemRowProps) {
  // Niet item.id gebruiken voor de veld-id's: die komt uit generateId() en is
  // dus willekeurig, waardoor server en client verschillende id's renderen en
  // de hydratatie klaagt. useId levert een id dat aan beide kanten gelijk is.
  const veld = useId();

  return (
    <div className="item-row animate-fade-in responsive-item-row" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div>
          <label className="row-label" htmlFor={`${veld}-naam`}>Item Naam</label>
          <input
            id={`${veld}-naam`}
            type="text"
            placeholder="Bijv. Webdesign"
            value={item.name || ''}
            onChange={(e) => onUpdate(item.id, { name: e.target.value })}
            style={{ width: '100%', fontWeight: 600 }}
          />
        </div>
        <div>
          <label className="row-label" htmlFor={`${veld}-omschrijving`}>Beschrijving</label>
          <textarea
            id={`${veld}-omschrijving`}
            placeholder="Omschrijving goederen/ diensten"
            value={item.description}
            onChange={(e) => onUpdate(item.id, { description: e.target.value })}
            style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', width: '100%' }} className="mobile-split">
        <div>
          <label className="row-label" htmlFor={`${veld}-aantal`}>Aantal</label>
          <input
            id={`${veld}-aantal`}
            type="number"
            placeholder="Aantal"
            value={item.quantity}
            min="1"
            onChange={(e) => onUpdate(item.id, { quantity: parseFloat(e.target.value) || 0 })}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label className="row-label" htmlFor={`${veld}-eenheid`}>Eenheid</label>
          {/* Vrij veld met suggesties: een vaste lijst zou dag, km of maand missen. */}
          <input
            id={`${veld}-eenheid`}
            type="text"
            list="eenheden"
            placeholder="uur, stuk…"
            value={item.unit || ''}
            onChange={(e) => onUpdate(item.id, { unit: e.target.value })}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label className="row-label" htmlFor={`${veld}-prijs`}>Prijs</label>
          <input
            id={`${veld}-prijs`}
            type="number"
            placeholder="Eenheidsprijs"
            value={item.unitPrice}
            step="0.01"
            onChange={(e) => onUpdate(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <div>
        <label className="row-label" htmlFor={`${veld}-btw`}>BTW</label>
        <select
          id={`${veld}-btw`}
          value={item.vatRate}
          onChange={(e) => onUpdate(item.id, { vatRate: parseInt(e.target.value) })}
          style={{ width: '100%', opacity: isVatExempt ? 0.6 : 1, cursor: isVatExempt ? 'not-allowed' : 'pointer' }}
          disabled={isVatExempt}
        >
          <option value={21}>21% BTW</option>
          <option value={9}>9% BTW</option>
          <option value={0}>0% BTW</option>
        </select>
      </div>

      <button
        onClick={() => onRemove(item.id)}
        aria-label={item.name ? `Regel "${item.name}" verwijderen` : 'Deze regel verwijderen'}
        title="Deze regel verwijderen"
        style={{
          background: 'none',
          color: 'var(--error)',
          padding: '0.5rem',
          alignSelf: 'flex-end'
        }}
      >
        <Trash2 size={20} />
      </button>
    </div>
  );
}

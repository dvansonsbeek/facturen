"use client";

import { Trash2 } from "lucide-react";
import { LineItem } from "@/types";

interface ItemRowProps {
  item: LineItem;
  onUpdate: (id: string, updates: Partial<LineItem>) => void;
  onRemove: (id: string) => void;
  isVatExempt?: boolean;
}

export default function ItemRow({ item, onUpdate, onRemove, isVatExempt }: ItemRowProps) {
  return (
    <div className="item-row animate-fade-in responsive-item-row" style={{ alignItems: 'flex-start', textAlign: 'left', marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <div>
          <span className="row-label">Item Naam</span>
          <input
            type="text"
            placeholder="Bijv. Webdesign"
            value={item.name || ''}
            onChange={(e) => onUpdate(item.id, { name: e.target.value })}
            style={{ width: '100%', fontWeight: 600 }}
          />
        </div>
        <div>
          <span className="row-label">Beschrijving</span>
          <textarea
            placeholder="Omschrijving goederen/ diensten"
            value={item.description}
            onChange={(e) => onUpdate(item.id, { description: e.target.value })}
            style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', width: '100%' }} className="mobile-split">
        <div>
          <span className="row-label">Aantal</span>
          <input
            type="number"
            placeholder="Aantal"
            value={item.quantity}
            min="1"
            onChange={(e) => onUpdate(item.id, { quantity: parseFloat(e.target.value) || 0 })}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <span className="row-label">Eenheid</span>
          {/* Vrij veld met suggesties: een vaste lijst zou dag, km of maand missen. */}
          <input
            type="text"
            list="eenheden"
            placeholder="uur, stuk…"
            value={item.unit || ''}
            onChange={(e) => onUpdate(item.id, { unit: e.target.value })}
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <span className="row-label">Prijs</span>
          <input
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
        <span className="row-label">BTW</span>
        <select
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

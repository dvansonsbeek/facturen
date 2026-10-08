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

  // Geen alignItems: 'flex-start' op de regel hieronder. Dat stond er wel, en
  // onder elkaar zorgde het ervoor dat de naam- en beschrijvingscel zich naar
  // hun inhoud voegden in plaats van naar de regel: de beschrijving was 234px
  // breed in een regel van 610px, ongeacht het venster. De standaard `stretch`
  // is wat je wil; alleen het prullenbakje moet links blijven staan, en dat
  // regelt .item-verwijderen in globals.css.
  return (
    <div className="item-row animate-fade-in responsive-item-row" style={{ textAlign: 'left', marginBottom: '1.5rem', padding: '1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>

      {/* De naam en de beschrijving stonden samen in één cel. De beschrijving was
          daardoor net zo smal als de naamkolom — rond de 185px — terwijl er drie
          lege kolommen naast lagen en het prullenbakje midden in dat gat hing.
          Nu is de beschrijving een eigen rasteritem dat de volle breedte pakt;
          zie .item-beschrijving in globals.css. */}
      <div className="item-naam">
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

      {/* Drie naast elkaar, maar alleen als ze passen. Vast op 1fr 1fr 1fr gaf
          op een telefoon van 390px kolommen van 82px, en daar staat
          "Eenheidsprijs" als "Eenheidspr" in. auto-fit met een ondergrens rekent
          zelf uit hoeveel er naast elkaar kunnen: twee bij 390px, drie zodra er
          ruimte voor is. In het raster (zie @container in globals.css) doet deze
          waarde niets, want daar staat .mobile-split op display: contents en
          zijn de drie velden zélf rasteritems. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))', gap: '1rem', width: '100%' }} className="mobile-split">
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
          {/* Vrij veld met suggesties: een vaste lijst zou dag, km of maand missen.
              De hint is kort met opzet: zes velden op één regel van zo'n 590px
              krijgen niet allemaal een voorbeeldlijst mee. "uur, stuk…" vroeg
              69px en kreeg er 59, dus op het scherm stond "uur, st" — een
              afgekapt rijtje voorbeelden helpt niemand. Het label EENHEID staat
              erboven en de datalist levert de rest zodra je erin klikt. */}
          <input
            id={`${veld}-eenheid`}
            type="text"
            list="eenheden"
            placeholder="uur"
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

      <div className="item-btw">
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
        className="item-verwijderen"
        onClick={() => onRemove(item.id)}
        aria-label={item.name ? `Regel "${item.name}" verwijderen` : 'Deze regel verwijderen'}
        title="Deze regel verwijderen"
        style={{
          background: 'none',
          color: 'var(--error)',
          padding: '0.5rem',
        }}
      >
        <Trash2 size={20} />
      </button>

      {/* Staat als laatste in de DOM zodat de bovenste raster­regel vol is voordat
          hij aan de beurt komt; met grid-column: 1 / -1 valt hij dan vanzelf op
          een eigen regel eronder. Onder elkaar (smal) zet CSS hem met `order`
          weer net achter de naam, want daar hoort hij te lezen. */}
      <div className="item-beschrijving">
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
  );
}

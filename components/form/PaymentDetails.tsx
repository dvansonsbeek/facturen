"use client";

import { IBAN_PLACEHOLDER } from "@/lib/utils";
import type { CompanySettings } from "@/lib/settings";

interface PaymentDetailsProps {
    settings: CompanySettings;
    onChange: (patch: Partial<CompanySettings>) => void;
    open: boolean;
    onToggle: (open: boolean) => void;
}

/**
 * Je betaalgegevens. Alleen bij een factuur: een offerte vraagt nog nergens om
 * geld, dus daar staat geen rekeningnummer op.
 */
export default function PaymentDetails({ settings, onChange, open, onToggle }: PaymentDetailsProps) {
    return (
        <details className="foldout" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
            <summary><h3>Mijn Betaalgegevens</h3></summary>
            <div className="foldout-body" style={{ display: 'grid', gap: '1.5rem' }}>
                <div>
                    <label htmlFor="iban">IBAN Nummer</label>
                    <input
                        id="iban"
                        placeholder={IBAN_PLACEHOLDER}
                        value={settings.bankAccount}
                        onChange={(e) => onChange({ bankAccount: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="bic">BIC Code (optioneel)</label>
                    <input
                        id="bic"
                        placeholder="XXXXXXXX"
                        value={settings.bic}
                        onChange={(e) => onChange({ bic: e.target.value })}
                    />
                </div>
                <div>
                    <label htmlFor="betalingsvoorwaarden">Betalingsvoorwaarden</label>
                    <input
                        id="betalingsvoorwaarden"
                        placeholder="Binnen 14 dagen na factuurdatum."
                        value={settings.paymentConditions}
                        onChange={(e) => onChange({ paymentConditions: e.target.value })}
                    />
                </div>
            </div>
        </details>
    );
}

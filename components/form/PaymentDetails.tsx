"use client";

import { IBAN_PLACEHOLDER } from "@/lib/utils";
import { keurIban } from "@/lib/iban";
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
    // Een leeg veld is geen fout: factureren zonder rekeningnummer mag, dan is
    // er alleen geen betaal-QR. Daarom null in plaats van een afkeuring.
    const oordeel = settings.bankAccount.trim() ? keurIban(settings.bankAccount) : null;

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
                        aria-invalid={oordeel !== null && !oordeel.ok}
                        aria-describedby="iban-uitleg"
                    />
                    <p id="iban-uitleg" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                        Staat je rekeningnummer er, dan komt er onderaan de factuur een
                        <strong> betaal-QR</strong>: je klant scant die met zijn bankapp en de
                        overschrijving staat ingevuld. Werkt niet bij elke bank, dus het
                        nummer blijft er ook gewoon leesbaar op staan.
                    </p>
                    {/* Een IBAN heeft een eigen controlegetal. Dat niet nakijken
                        betekent dat een tikfout zo in een betaalopdracht belandt —
                        en bij een gescande code kijkt niemand meer na wat erin
                        stond. Bij een afgekeurd nummer komt er geen QR. */}
                    {oordeel !== null && !oordeel.ok && (
                        <p role="status" style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--error)' }}>
                            Dit rekeningnummer deugt niet: {oordeel.reden}. Er komt geen
                            betaal-QR op de factuur zolang dat zo is — controleer het nummer
                            liever nu dan nadat je klant ergens anders heeft betaald.
                        </p>
                    )}
                    {oordeel?.ok && (
                        <p role="status" style={{ margin: '0.4rem 0 0', fontSize: '0.78rem', color: 'var(--secondary)' }}>
                            Het controlegetal klopt. Dat zegt dat er geen tikfout in zit, niet
                            dat het nummer van jou is — dat kan deze app niet nagaan.
                        </p>
                    )}
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
                {/* Een getal en geen zin, want de zin moest vertaalbaar worden.
                    Als vrije tekst bleef "Binnen 30 dagen na factuurdatum" in het
                    Nederlands staan op een Engelse factuur: het was jouw tekst, en
                    die vertaalt de app niet. Nu bouwt lib/taal.ts de zin op in de
                    taal van het document. */}
                <div>
                    <label htmlFor="betaaltermijn">Betaaltermijn (dagen)</label>
                    <input
                        id="betaaltermijn"
                        type="number"
                        min="1"
                        max="365"
                        value={settings.paymentTermDays}
                        onChange={(e) => onChange({
                            paymentTermDays: Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 0)),
                        })}
                        style={{ maxWidth: '8rem' }}
                        aria-describedby="betaaltermijn-uitleg"
                    />
                    <p id="betaaltermijn-uitleg" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                        Hieruit komt de zin op de factuur, in de taal van het document.
                        Spreek je niets af, dan gaat de wet uit van dertig dagen.
                    </p>
                </div>
                {/* De ontsnappingsklep, en met opzet niet weggelaten: een getal kan
                    niet alles zeggen. "Vooraf te voldoen", "50% bij opdracht, 50% bij
                    oplevering", "contant bij levering" — dat zijn echte termijnen, en
                    dit veld schrappen zou ze er stilletjes uit halen. */}
                <div>
                    <label className="label-wrap" htmlFor="betalingsvoorwaarden">
                        Eigen tekst in plaats daarvan (optioneel)
                    </label>
                    <input
                        id="betalingsvoorwaarden"
                        placeholder="Vooraf te voldoen"
                        value={settings.paymentConditions}
                        onChange={(e) => onChange({ paymentConditions: e.target.value })}
                        aria-describedby="betalingsvoorwaarden-uitleg"
                    />
                    <p id="betalingsvoorwaarden-uitleg" style={{ margin: '0.4rem 0 0', fontSize: '0.75rem', color: 'var(--muted)' }}>
                        Voor een afspraak die niet in een aantal dagen past. Wat je hier
                        invult komt in plaats van de zin hierboven en blijft staan zoals
                        je het schrijft, ook op een Engelstalig document.
                    </p>
                </div>
            </div>
        </details>
    );
}

"use client";

import { useState } from "react";
import { Lock, LockOpen, ShieldCheck } from "lucide-react";
import type { KluisStand } from "@/lib/vault";

interface SecurityPanelProps {
    kluis: KluisStand;
    /** Hoeveel documenten er in het archief staan; bepaalt de waarschuwing. */
    aantalDocumenten: number;
    open: boolean;
    onToggle: (open: boolean) => void;
    onSetPassphrase: (zin: string) => Promise<boolean>;
    onUnlock: (zin: string) => Promise<boolean>;
    onLock: () => void;
    onRemovePassphrase: () => Promise<boolean>;
}

/**
 * Uitleg over wat "in je eigen browser" betekent, plus de wachtwoordzin.
 *
 * De uitleg staat hier en niet alleen in de README, omdat de gebruiker de keuze
 * voor een wachtwoordzin alleen kan maken als hij weet waartegen die wel en
 * niet helpt. Bewust ook de grenzen: versleuteling beschermt wat er op schijf
 * staat, niet een sessie die al open is. Dat verzwijgen zou een vals gevoel
 * van veiligheid geven, en dat is erger dan geen versleuteling.
 */
export default function SecurityPanel({
    kluis, aantalDocumenten, open, onToggle,
    onSetPassphrase, onUnlock, onLock, onRemovePassphrase,
}: SecurityPanelProps) {
    const [zin, setZin] = useState('');
    const [herhaling, setHerhaling] = useState('');
    const [melding, setMelding] = useState<string | null>(null);
    const [bezig, setBezig] = useState(false);

    const instellen = async () => {
        if (zin.length < 12) {
            setMelding('Kies een zin van minstens 12 tekens. Een paar woorden achter elkaar is sterker en beter te onthouden dan één kort woord.');
            return;
        }
        if (zin !== herhaling) {
            setMelding('De twee zinnen zijn niet gelijk.');
            return;
        }
        if (!window.confirm(
            'Let op: zonder deze zin zijn je bewaarde documenten en je klantenboek niet meer '
            + 'te openen. Er is geen server en geen herstelcode, dus vergeten betekent kwijt — '
            + 'ook de reservekopie uit Export blijft dan onleesbaar. Schrijf hem ergens op. '
            + 'Doorgaan?',
        )) return;

        setBezig(true);
        const gelukt = await onSetPassphrase(zin);
        setBezig(false);
        setZin('');
        setHerhaling('');
        setMelding(gelukt
            ? 'Je archief en klantenboek zijn nu versleuteld. Na het herladen van de pagina '
              + 'vraagt hij de zin opnieuw.'
            : 'Instellen is niet gelukt.');
    };

    const ontgrendelen = async () => {
        setBezig(true);
        const gelukt = await onUnlock(zin);
        setBezig(false);
        setZin('');
        setMelding(gelukt ? null : 'Die zin klopt niet.');
    };

    const verwijderen = async () => {
        if (!window.confirm(
            'De versleuteling wordt eraf gehaald en je archief komt weer leesbaar in deze '
            + 'browser te staan. Doorgaan?',
        )) return;
        setBezig(true);
        const gelukt = await onRemovePassphrase();
        setBezig(false);
        setMelding(gelukt ? 'De versleuteling staat eraf.' : 'Verwijderen is niet gelukt.');
    };

    return (
        <details className="foldout" open={open} onToggle={(e) => onToggle(e.currentTarget.open)}>
            <summary>
                <h3>Beveiliging en privacy{kluis.ingesteld ? (kluis.vergrendeld ? ' — vergrendeld' : ' — versleuteld') : ''}</h3>
            </summary>
            <div className="foldout-body" style={{ display: 'grid', gap: '1.25rem' }}>
                <div className="uitleg-blok">
                    <h4><ShieldCheck size={16} /> Waar je gegevens staan</h4>
                    <p>
                        In de opslag van <strong>deze browser, op dit apparaat</strong>. Er is geen
                        server, geen account en geen database. Dat is niet alleen een belofte: de
                        pagina stuurt een beveiligingsbeleid mee dat de browser verbiedt om wat je
                        invult ergens heen te sturen. Zelfs als er ooit code in zou sluipen die dat
                        wilde, kan het niet. De lettertypes komen daarom ook uit deze app zelf en
                        niet bij Google vandaan.
                    </p>
                    {/* Een app die om vertrouwen vraagt, hoort zelf te melden dat
                        er geteld wordt — en niet pas als iemand het ontdekt. */}
                    <p>
                        Eén ding gaat er wél naar buiten: bij het openen van de pagina wordt een
                        bezoek geteld bij GoatCounter. Daarbij gaat mee welke pagina je opent, waar
                        je vandaan kwam en hoe groot je scherm is. <strong>Niets van wat je
                        invult</strong> — geen klantnaam, geen bedrag, geen factuurnummer. Er worden
                        geen cookies gezet en je wordt niet gevolgd tussen websites. Zet je browser
                        op <em>Do Not Track</em> of <em>Global Privacy Control</em>, dan wordt er
                        niets geteld.
                    </p>
                </div>

                <div className="uitleg-blok">
                    <h4>Waar het risico dan zit</h4>
                    <p>
                        Niet in het netwerk, maar in <strong>dit apparaat</strong>. Dat is een echte
                        ruil en geen detail:
                    </p>
                    <ul>
                        <li>
                            <strong>Wie bij deze browser kan, kan bij je gegevens.</strong> Een
                            huisgenoot of collega die hetzelfde profiel gebruikt, iemand die de
                            laptop meeneemt, een beheerder van een werkcomputer, of een back-up van
                            de schijf. Hier helpt een wachtwoordzin tegen.
                        </li>
                        <li>
                            <strong>Een browserextensie mag in elke pagina kijken.</strong> Extensies
                            staan buiten het beveiligingsbeleid van deze app. Een kwaadwillende of
                            gekaapte extensie kan meelezen zolang je ermee werkt. Hier helpt een
                            wachtwoordzin <em>niet</em> tegen.
                        </li>
                        <li>
                            <strong>Je browsergegevens wissen wist je archief.</strong> Er is geen
                            server die het terughaalt. Gebruik <strong>Export</strong>; dat bestand
                            is je enige reservekopie.
                        </li>
                        <li>
                            <strong>Twee apparaten zijn twee administraties.</strong> Ze weten niets
                            van elkaar, dus er kunnen dubbele factuurnummers ontstaan.
                        </li>
                    </ul>
                </div>

                <div className="uitleg-blok">
                    <h4>Wat een wachtwoordzin toevoegt</h4>
                    <p>
                        Je <strong>bewaarde documenten</strong> en je <strong>klantenboek</strong> gaan
                        dan versleuteld naar schijf (AES-256-GCM, sleutel afgeleid met PBKDF2). Wie bij
                        dit apparaat kan, ziet geen klantnamen, adressen of bedragen meer — alleen ruis.
                        Dat zijn de persoonsgegevens van anderen, en dus het deel dat er echt om vraagt.
                    </p>
                    <p>
                        <strong>Je eigen bedrijfsgegevens en je factuurnummers blijven leesbaar.</strong>
                        Die staan op elke factuur die je verstuurt en in het handelsregister, en een
                        factuurnummer is geen geheim; versleutelen levert daar niets op en zou je de app
                        niet meer laten gebruiken zonder de zin. Zo kun je nog gewoon een factuur maken
                        terwijl het vergrendeld is — je ziet dan alleen je bewaarde klanten en documenten
                        niet, en opslaan wordt geweigerd tot je ontgrendelt.
                    </p>
                    <p>
                        En de grens, duidelijk gezegd: dit beschermt wat er <em>stilstaat</em>, niet
                        een sessie die <em>open</em> staat. Zodra je de zin hebt ingevoerd is het
                        archief leesbaar tot je de pagina herlaadt of op Vergrendelen klikt. De
                        sleutel wordt nooit bewaard, dus na herladen vraagt hij hem opnieuw.
                    </p>
                    <p className="uitleg-let-op">
                        Er is geen herstelcode en niemand die je kan helpen. Vergeet je de zin, dan zijn
                        je archief en je klantenboek weg — ook het Export-bestand blijft dan onleesbaar.
                    </p>
                </div>

                {kluis.vergrendeld ? (
                    <div className="kluis-rij">
                        <label htmlFor="kluis-zin">Wachtwoordzin</label>
                        <input
                            id="kluis-zin"
                            type="password"
                            autoComplete="current-password"
                            placeholder="Je wachtwoordzin"
                            value={zin}
                            onChange={(e) => setZin(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') ontgrendelen(); }}
                        />
                        <button className="premium-btn compact" onClick={ontgrendelen} disabled={bezig || !zin}>
                            <LockOpen size={14} /> <span>{bezig ? 'Bezig…' : 'Ontgrendelen'}</span>
                        </button>
                    </div>
                ) : kluis.ingesteld ? (
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button className="premium-btn compact" onClick={onLock} disabled={bezig}>
                            <Lock size={14} /> <span>Vergrendelen</span>
                        </button>
                        <button className="premium-btn compact" onClick={verwijderen} disabled={bezig}>
                            <LockOpen size={14} /> <span>Versleuteling eraf halen</span>
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                        <div className="kluis-rij">
                            <label htmlFor="kluis-nieuw">Nieuwe wachtwoordzin</label>
                            <input
                                id="kluis-nieuw"
                                type="password"
                                autoComplete="new-password"
                                placeholder="Minstens 12 tekens"
                                value={zin}
                                onChange={(e) => setZin(e.target.value)}
                            />
                        </div>
                        <div className="kluis-rij">
                            <label htmlFor="kluis-herhaal">Nog een keer</label>
                            <input
                                id="kluis-herhaal"
                                type="password"
                                autoComplete="new-password"
                                placeholder="Dezelfde zin"
                                value={herhaling}
                                onChange={(e) => setHerhaling(e.target.value)}
                            />
                        </div>
                        <button
                            className="premium-btn compact"
                            onClick={instellen}
                            disabled={bezig || !zin}
                            style={{ justifySelf: 'start' }}
                            title={aantalDocumenten > 0
                                ? `De ${aantalDocumenten} documenten die je al bewaard hebt worden meteen versleuteld`
                                : 'Vanaf nu worden bewaarde documenten versleuteld'}
                        >
                            <Lock size={14} /> <span>{bezig ? 'Bezig…' : 'Archief versleutelen'}</span>
                        </button>
                    </div>
                )}

                {melding && (
                    <p role="status" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--primary)' }}>
                        {melding}
                    </p>
                )}

                {!kluis.opslagWerkt && (
                    <p role="status" style={{ margin: 0, fontSize: '0.8rem', color: 'var(--error)' }}>
                        Deze browser geeft geen opslagruimte vrij, bijvoorbeeld in privémodus.
                        Bewaren en versleutelen werken daardoor niet.
                    </p>
                )}
            </div>
        </details>
    );
}

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { Alert, Spinner } from '../ui/Feedback';
import { button, card, cx, input, label, select } from '../ui/styles';
import type { PaymentMethod, PlatformPlan, Pressing } from '../../types';

/** Extrait de PressingsPage.tsx — réutilisé aussi par PressingDetailPage.tsx (onglet Licence). */
export default function RenewLicenseModal({ pressing, onClose, onRenewed }: { pressing: Pressing; onClose: () => void; onRenewed: () => void }) {
    const [plans, setPlans] = useState<PlatformPlan[]>([]);
    const [planId, setPlanId] = useState<number | ''>('');
    const [method, setMethod] = useState<PaymentMethod>('espece');
    const [externalReference, setExternalReference] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        platformApi.get<PlatformPlan[]>('/plans').then((data) => {
            setPlans(data);
            if (data[0]) setPlanId(data[0].id);
        });
    }, []);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            await platformApi.post(`/pressings/${pressing.id}/renew`, {
                platform_plan_id: planId,
                method,
                external_reference: externalReference || null,
            });
            setSuccess(true);
            onRenewed();
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <section className={cx(card, 'w-full max-w-md space-y-4 p-6')}>
                <div className="flex items-center justify-between">
                    <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">Enregistrer un paiement — {pressing.name}</h2>
                    <button type="button" onClick={onClose} aria-label="Fermer" className="text-ink-500 hover:text-ink-700 dark:text-ink-400">
                        <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                </div>
                <p className="text-xs text-ink-600 dark:text-ink-350">
                    Confirme un règlement déjà perçu (espèces ou Mobile Money) et prolonge la licence du pressing en conséquence.
                </p>

                {error && <Alert tone="error">{error}</Alert>}
                {success && <Alert tone="success">Licence renouvelée avec succès.</Alert>}

                <label className="block">
                    <span className={label}>Plan</span>
                    <select value={planId} onChange={(e) => setPlanId(e.target.value ? Number(e.target.value) : '')} className={select}>
                        <option value="">Sélectionner un plan</option>
                        {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name} — {p.price !== null ? `${p.price.toLocaleString('fr-FR')} ${p.currency}` : '—'} / {p.duration_days ?? '—'}j
                            </option>
                        ))}
                    </select>
                </label>

                <label className="block">
                    <span className={label}>Moyen de paiement</span>
                    <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={select}>
                        <option value="espece">Espèces</option>
                        <option value="flooz">Flooz</option>
                        <option value="tmoney">T-Money</option>
                        <option value="carte">Carte</option>
                    </select>
                </label>

                <label className="block">
                    <span className={label}>Référence externe (optionnel)</span>
                    <input value={externalReference} onChange={(e) => setExternalReference(e.target.value)} className={cx(input, 'w-full')} />
                </label>

                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className={button('secondary', 'md')}>
                        Fermer
                    </button>
                    <button type="button" onClick={() => void submit()} disabled={busy || !planId} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : null}
                        Confirmer le paiement
                    </button>
                </div>
            </section>
        </div>
    );
}

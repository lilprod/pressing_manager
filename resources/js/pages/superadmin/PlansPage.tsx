import { useEffect, useState } from 'react';
import { CalendarClock, Layers, Pencil, Plus, X } from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cx, input, label } from '../../components/ui/styles';
import type { PlatformPlan } from '../../types';

/**
 * Phase 2 (harmonisation licence/facturation) : plans plateforme avec prix/durée —
 * fusionnés avec les anciens `license_plans` tenant (voir CLAUDE.md). Mirrors
 * l'ancien `LicensePlansPanel` de pages/LicensePage.tsx, côté plateforme cette fois.
 */
export default function PlansPage() {
    const [plans, setPlans] = useState<PlatformPlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<PlatformPlan | null>(null);
    const [error, setError] = useState<string | null>(null);

    function reload() {
        setLoading(true);
        platformApi.get<PlatformPlan[]>('/plans/manage').then(setPlans).finally(() => setLoading(false));
    }

    useEffect(reload, []);

    async function toggleActive(plan: PlatformPlan) {
        setError(null);
        try {
            await platformApi.patch(`/plans/${plan.id}`, { is_active: !plan.is_active });
            reload();
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        }
    }

    return (
        <div className="space-y-6">
            <header className="flex items-center gap-3.5">
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                    <Layers aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Plans</h1>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Prix et durée des abonnements proposés aux pressings.</p>
                </div>
            </header>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                <div className={cx(card, 'overflow-hidden')}>
                    {loading ? (
                        <LoadingState />
                    ) : plans.length === 0 ? (
                        <EmptyState icon={Layers} title="Aucun plan" />
                    ) : (
                        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                            {plans.map((plan) => (
                                <li key={plan.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            <p className="font-semibold text-ink-900 dark:text-ink-50">{plan.name}</p>
                                            {!plan.is_active && <Pill tone="rose">Inactif</Pill>}
                                        </div>
                                        <p className="flex items-center gap-1.5 text-sm text-ink-600 dark:text-ink-350">
                                            {plan.price !== null ? `${plan.price.toLocaleString('fr-FR')} ${plan.currency}` : 'Sans prix (plan hérité)'}
                                            {plan.duration_days !== null && (
                                                <>
                                                    <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                                                    {plan.duration_days} jours
                                                </>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <button type="button" onClick={() => setEditing(plan)} className={button('secondary', 'sm')}>
                                            <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                                            Modifier
                                        </button>
                                        <button type="button" onClick={() => void toggleActive(plan)} className={button('ghost', 'sm')}>
                                            {plan.is_active ? 'Désactiver' : 'Activer'}
                                        </button>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <PlanForm key={editing?.id ?? 'new'} editing={editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
            </div>
        </div>
    );
}

function PlanForm({ editing, onCancel, onSaved }: { editing: PlatformPlan | null; onCancel: () => void; onSaved: () => void }) {
    const [name, setName] = useState(editing?.name ?? '');
    const [price, setPrice] = useState(editing?.price != null ? String(editing.price) : '');
    const [durationDays, setDurationDays] = useState(editing?.duration_days != null ? String(editing.duration_days) : '');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            const payload = { name, price: Number(price), duration_days: Number(durationDays) };
            if (editing) {
                await platformApi.patch(`/plans/${editing.id}`, payload);
            } else {
                await platformApi.post('/plans', payload);
                setName('');
                setPrice('');
                setDurationDays('');
            }
            onSaved();
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name.trim() !== '' && price !== '' && durationDays !== '';

    return (
        <section className={cx(card, 'space-y-4 p-6')}>
            <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-bold text-ink-900 dark:text-ink-50">{editing ? 'Modifier le plan' : 'Nouveau plan'}</h2>
                {editing && (
                    <button type="button" onClick={onCancel} aria-label="Annuler" className="text-ink-500 hover:text-ink-700 dark:text-ink-400">
                        <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                )}
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            <label className="block">
                <span className={label}>Nom</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className={label}>Durée (jours)</span>
                    <input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(e.target.value)} className={input} />
                </label>
                <label className="block">
                    <span className={label}>Prix (XOF)</span>
                    <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
                </label>
            </div>
            <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md', 'w-full')}>
                {busy ? <Spinner className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                {editing ? 'Enregistrer' : 'Créer'}
            </button>
        </section>
    );
}

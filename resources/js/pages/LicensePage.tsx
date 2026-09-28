import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useLicense } from '../contexts/LicenseContext';
import { hasPermission } from '../lib/permissions';
import { api, ApiError } from '../lib/api';
import LicenseRenewalForm from '../components/LicenseRenewalForm';
import type { LicensePayment, LicensePlan } from '../types';
import { CalendarDays, CircleAlert, History, KeyRound, Layers, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { useFormat } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge, { Pill, statusTone } from '../components/ui/StatusBadge';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import { button, card, cardPadded, cx, input, label, sectionTitle } from '../components/ui/styles';

export default function LicensePage() {
    const { user } = useAuth();
    const { license, loading } = useLicense();
    const { t } = useI18n();
    const { money, date } = useFormat();
    const [history, setHistory] = useState<LicensePayment[]>([]);
    const canManage = hasPermission(user, 'licenses.manage');

    useEffect(() => {
        if (canManage) {
            api.get<LicensePayment[]>('/license/history').then(setHistory).catch(() => setHistory([]));
        }
    }, [canManage]);

    if (loading) {
        return <LoadingState />;
    }

    if (!license) {
        return (
            <div role="alert" className={card}>
                <EmptyState icon={CircleAlert} title={t('common.error')} />
            </div>
        );
    }

    const tone = statusTone('license', license.status);
    const ringColor =
        tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
    // Jauge : jours restants rapportés à une année (plafonnée), pour une lecture visuelle rapide.
    const ratio = Math.max(0, Math.min(1, license.days_remaining / 365));
    const circumference = 2 * Math.PI * 42;

    return (
        <div className="space-y-6">
            <PageHeader title={t('license.title')} subtitle={t('license.subtitle')} icon={KeyRound} />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                <div className="space-y-6">
                    <section aria-labelledby="license-status-heading" className={cardPadded}>
                        <div className="flex items-center justify-between gap-2">
                            <h2 id="license-status-heading" className={sectionTitle}>
                                {t('license.current')}
                            </h2>
                            <StatusBadge kind="license" status={license.status} size="md" />
                        </div>

                        <div className="mt-6 flex flex-wrap items-center gap-6">
                            <div className="relative h-32 w-32 shrink-0">
                                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                                    <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-ink-100 dark:stroke-ink-800" />
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="42"
                                        fill="none"
                                        strokeWidth="9"
                                        strokeLinecap="round"
                                        stroke="currentColor"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={circumference * (1 - ratio)}
                                        className={cx('transition-all duration-700', ringColor)}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="font-display text-3xl font-extrabold tabular-nums text-ink-900 dark:text-white">{license.days_remaining}</span>
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-600 dark:text-ink-350">{t('license.daysShort')}</span>
                                </div>
                            </div>

                            <dl className="min-w-[12rem] flex-1 space-y-3 text-sm">
                                <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-3 dark:border-ink-800">
                                    <dt className="inline-flex items-center gap-2 text-ink-600 dark:text-ink-350">
                                        <Layers aria-hidden="true" className="h-4 w-4" />
                                        {t('license.plan')}
                                    </dt>
                                    <dd className="font-semibold capitalize text-ink-900 dark:text-ink-50">{license.plan}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-3 dark:border-ink-800">
                                    <dt className="inline-flex items-center gap-2 text-ink-600 dark:text-ink-350">
                                        <CalendarDays aria-hidden="true" className="h-4 w-4" />
                                        {t('license.expiresAt')}
                                    </dt>
                                    <dd className="font-semibold text-ink-900 dark:text-ink-50">{date(license.expires_at)}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="inline-flex items-center gap-2 text-ink-600 dark:text-ink-350">
                                        <RefreshCw aria-hidden="true" className="h-4 w-4" />
                                        {t('license.daysRemaining')}
                                    </dt>
                                    <dd className="font-semibold tabular-nums text-ink-900 dark:text-ink-50">{license.days_remaining}</dd>
                                </div>
                            </dl>
                        </div>
                    </section>

                    {canManage && history.length > 0 && (
                        <section aria-labelledby="history-heading" className={cx(card, 'overflow-hidden')}>
                            <h2 id="history-heading" className={cx(sectionTitle, 'flex items-center gap-2 px-5 pb-3 pt-5')}>
                                <History aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                                {t('license.history')}
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-ink-50 text-xs uppercase tracking-wider text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">
                                        <tr>
                                            <th scope="col" className="px-5 py-2.5 font-semibold">
                                                {t('payment.amount')}
                                            </th>
                                            <th scope="col" className="px-5 py-2.5 font-semibold">
                                                {t('payment.method')}
                                            </th>
                                            <th scope="col" className="px-5 py-2.5 font-semibold">
                                                {t('license.expiresAt')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                        {history.map((payment) => (
                                            <tr key={payment.id} className="transition hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                                                <td className="whitespace-nowrap px-5 py-3 font-semibold tabular-nums text-ink-900 dark:text-ink-50">{money(payment.amount)}</td>
                                                <td className="px-5 py-3 text-ink-700 dark:text-ink-300">{t(PAYMENT_METHOD_KEYS[payment.method])}</td>
                                                <td className="whitespace-nowrap px-5 py-3 text-ink-700 dark:text-ink-300">{date(payment.new_expires_at)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </div>

                {canManage && (
                    <section aria-labelledby="renew-heading" className={cardPadded}>
                        <h2 id="renew-heading" className={cx(sectionTitle, 'mb-5 flex items-center gap-2')}>
                            <RefreshCw aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                            {t('license.renew')}
                        </h2>
                        <LicenseRenewalForm />
                    </section>
                )}
            </div>

            {canManage && <LicensePlansPanel />}
        </div>
    );
}

const PAYMENT_METHOD_KEYS: Record<LicensePayment['method'], string> = {
    espece: 'payment.cash',
    carte: 'payment.card',
    flooz: 'payment.flooz',
    tmoney: 'payment.tmoney',
};

function LicensePlansPanel() {
    const { t } = useI18n();
    const { money } = useFormat();
    const [plans, setPlans] = useState<LicensePlan[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState<LicensePlan | null>(null);
    const [error, setError] = useState<string | null>(null);

    function reload() {
        setLoading(true);
        api.get<LicensePlan[]>('/license-plans').then(setPlans).finally(() => setLoading(false));
    }

    useEffect(reload, []);

    async function toggleActive(planItem: LicensePlan) {
        setError(null);
        try {
            await api.patch(`/license-plans/${planItem.id}`, { is_active: !planItem.is_active });
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    async function remove(planItem: LicensePlan) {
        setError(null);
        try {
            await api.delete(`/license-plans/${planItem.id}`);
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    return (
        <section aria-labelledby="license-plans-heading" className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div className={cx(card, 'overflow-hidden')}>
                <h2 id="license-plans-heading" className={cx(sectionTitle, 'flex items-center gap-2 px-5 pb-3 pt-5')}>
                    <Layers aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                    {t('license.plansManagement')}
                </h2>

                {error && (
                    <div className="px-5 pb-3">
                        <Alert tone="error">{error}</Alert>
                    </div>
                )}

                {loading ? (
                    <LoadingState />
                ) : plans.length === 0 ? (
                    <EmptyState compact icon={Layers} title={t('license.noPlans')} />
                ) : (
                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                        {plans.map((planItem) => (
                            <li key={planItem.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <p className="font-semibold text-ink-900 dark:text-ink-50">{planItem.name}</p>
                                        {!planItem.is_active && <Pill tone="rose">{t('service.inactive')}</Pill>}
                                    </div>
                                    <p className="text-sm text-ink-600 dark:text-ink-350">
                                        {money(planItem.price)} · {t('license.days', { days: planItem.days })}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <button type="button" onClick={() => setEditing(planItem)} className={button('secondary', 'sm')}>
                                        <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                                        {t('common.edit')}
                                    </button>
                                    <button type="button" onClick={() => void toggleActive(planItem)} className={button('ghost', 'sm')}>
                                        {planItem.is_active ? t('service.deactivate') : t('service.activate')}
                                    </button>
                                    <button type="button" onClick={() => void remove(planItem)} className={button('dangerGhost', 'sm')}>
                                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                        {t('common.delete')}
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <CreateLicensePlanForm onCreated={reload} />

            {editing && (
                <EditLicensePlanModal
                    plan={editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => {
                        setEditing(null);
                        reload();
                    }}
                />
            )}
        </section>
    );
}

function CreateLicensePlanForm({ onCreated }: { onCreated: () => void }) {
    const { t } = useI18n();
    const [name, setName] = useState('');
    const [days, setDays] = useState('');
    const [price, setPrice] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/license-plans', { name, days: Number(days), price: Number(price) });
            setName('');
            setDays('');
            setPrice('');
            onCreated();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name.trim() !== '' && days !== '' && price !== '';

    return (
        <section aria-labelledby="license-plan-create-heading" className={cx(cardPadded, 'space-y-4')}>
            <h2 id="license-plan-create-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                <Plus aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('license.newPlan')}
            </h2>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="space-y-3">
                <label className="block">
                    <span className={label}>{t('license.planName')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className={label}>{t('license.planDays')}</span>
                        <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('license.planPrice')}</span>
                        <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
                    </label>
                </div>
                <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md', 'w-full')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                    {t('common.create')}
                </button>
            </div>
        </section>
    );
}

function EditLicensePlanModal({ plan, onClose, onSaved }: { plan: LicensePlan; onClose: () => void; onSaved: () => void }) {
    const { t } = useI18n();
    const [name, setName] = useState(plan.name);
    const [days, setDays] = useState(String(plan.days));
    const [price, setPrice] = useState(String(plan.price));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/license-plans/${plan.id}`, { name, days: Number(days), price: Number(price) });
            onSaved();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name.trim() !== '' && days !== '' && price !== '';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <section className={cx(cardPadded, 'w-full max-w-md space-y-4')}>
                <div className="flex items-center justify-between">
                    <h2 className={sectionTitle}>{t('license.editPlan')}</h2>
                    <button type="button" onClick={onClose} aria-label={t('common.close')} className={button('ghost', 'sm')}>
                        <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                </div>
                {error && <Alert tone="error">{error}</Alert>}

                <label className="block">
                    <span className={label}>{t('license.planName')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className={label}>{t('license.planDays')}</span>
                        <input type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('license.planPrice')}</span>
                        <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} className={input} />
                    </label>
                </div>

                <div className="flex justify-end gap-2">
                    <button type="button" onClick={onClose} className={button('secondary', 'md')}>
                        {t('common.cancel')}
                    </button>
                    <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : null}
                        {t('common.save')}
                    </button>
                </div>
            </section>
        </div>
    );
}

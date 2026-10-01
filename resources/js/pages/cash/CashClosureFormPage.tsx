import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { Alert, LoadingState, Spinner } from '../../components/ui/Feedback';
import { button, cardPadded, cx, input, label, textLink } from '../../components/ui/styles';
import type { CashReconciliationMethod, CashSummary } from '../../types';

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

const METHODS: CashReconciliationMethod[] = ['espece', 'mobile_money', 'carte'];

const CHECKLIST_STEPS = [
    'journal_verified',
    'cash_recounted',
    'mobile_money_statements_checked',
    'card_payments_verified',
    'anomalies_handled',
    'double_control_done',
] as const;

export default function CashClosureFormPage() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const { money } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const isGlobal = user?.agency_id === null;
    const agencyId = user?.agency_id ?? activeAgencyId;

    const [summary, setSummary] = useState<CashSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [businessDate, setBusinessDate] = useState(today());
    const [counts, setCounts] = useState<Record<CashReconciliationMethod, string>>({ espece: '', mobile_money: '', carte: '' });
    const [checklist, setChecklist] = useState<Set<string>>(new Set());
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!agencyId) {
            setLoading(false);
            return;
        }
        api
            .get<CashSummary>(`/cash/summary?agency_id=${agencyId}`)
            .then(setSummary)
            .finally(() => setLoading(false));
    }, [agencyId]);

    function toggleStep(step: string) {
        setChecklist((current) => {
            const next = new Set(current);
            if (next.has(step)) next.delete(step);
            else next.add(step);
            return next;
        });
    }

    function variance(method: CashReconciliationMethod): number | null {
        if (!summary || counts[method] === '') return null;
        return Number(counts[method]) - summary.by_method[method].theoretical;
    }

    const variances = METHODS.map(variance);
    const hasAnyVariance = variances.some((v) => v !== null && v !== 0);
    const checklistComplete = CHECKLIST_STEPS.every((step) => checklist.has(step));
    const allCounted = METHODS.every((m) => counts[m] !== '' && Number(counts[m]) >= 0);
    const canSubmit = allCounted && businessDate !== '' && summary !== null && checklistComplete && (!hasAnyVariance || notes.trim() !== '');

    async function handleSubmit() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/cash/closures', {
                business_date: businessDate,
                counts: {
                    espece: Number(counts.espece),
                    mobile_money: Number(counts.mobile_money),
                    carte: Number(counts.carte),
                },
                checklist: Array.from(checklist),
                notes: notes || null,
                ...(isGlobal ? { agency_id: activeAgencyId } : {}),
            });
            navigate('/cash');
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setError(t('cash.closureForm.alreadyClosed'));
            } else {
                setError(err instanceof ApiError ? err.message : t('common.error'));
            }
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="max-w-2xl space-y-4">
            <Link to="/cash" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                {t('cash.backToRegister')}
            </Link>

            {loading ? (
                <LoadingState />
            ) : (
                <section className={cx(cardPadded, 'space-y-5')}>
                    <div>
                        <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">{t('cash.closureForm.title')}</h1>
                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('cash.closureForm.subtitle')}</p>
                    </div>

                    {error && <Alert tone="error">{error}</Alert>}

                    <label className="block">
                        <span className={label}>{t('cash.closureForm.date')}</span>
                        <input
                            type="date"
                            value={businessDate}
                            max={today()}
                            onChange={(e) => setBusinessDate(e.target.value)}
                            className={cx(input, 'w-full')}
                        />
                    </label>

                    {summary && (
                        <div className="space-y-3">
                            <p className={label}>{t('cash.closureForm.reconciliation')}</p>
                            {METHODS.map((methodKey) => {
                                const v = variance(methodKey);
                                return (
                                    <div key={methodKey} className="space-y-2 rounded-xl border border-ink-200/80 p-4 dark:border-ink-800">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-ink-900 dark:text-ink-50">{t(`cash.method.${methodKey}`)}</span>
                                            <span className="text-xs text-ink-500 dark:text-ink-400">
                                                {t('cash.closureForm.theoretical')} : {money(summary.by_method[methodKey].theoretical)}
                                            </span>
                                        </div>
                                        <label className="block">
                                            <span className="sr-only">{t('cash.closureForm.counted')}</span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={counts[methodKey]}
                                                onChange={(e) => setCounts((c) => ({ ...c, [methodKey]: e.target.value }))}
                                                className={cx(input, 'w-full')}
                                                placeholder={t('cash.closureForm.counted')}
                                            />
                                        </label>
                                        {v !== null && (
                                            <p
                                                className={cx(
                                                    'text-sm font-semibold',
                                                    v === 0
                                                        ? 'text-emerald-700 dark:text-emerald-400'
                                                        : v > 0
                                                          ? 'text-sky-700 dark:text-sky-400'
                                                          : 'text-red-700 dark:text-red-400',
                                                )}
                                            >
                                                {v === 0 ? t('cash.closureForm.varianceOk') : `${v > 0 ? '+' : ''}${money(v)}`}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="space-y-2">
                        <span className={label}>{t('cash.closureForm.checklist')}</span>
                        <ul className="space-y-1.5">
                            {CHECKLIST_STEPS.map((step) => (
                                <li key={step}>
                                    <label className="flex items-center gap-2 text-sm text-ink-800 dark:text-ink-100">
                                        <input type="checkbox" checked={checklist.has(step)} onChange={() => toggleStep(step)} className="h-4 w-4 rounded" />
                                        {t(`cash.checklist.${step}`)}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <label className="block">
                        <span className={label}>
                            {t('cash.closureForm.notes')}
                            {hasAnyVariance && <span className="text-red-600 dark:text-red-400"> *</span>}
                        </span>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cx(input, 'w-full')} />
                        {hasAnyVariance && <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t('cash.closureForm.notesRequiredHint')}</p>}
                    </label>

                    <div className="flex justify-end gap-2 border-t border-ink-200/80 pt-5 dark:border-ink-800">
                        <Link to="/cash" className={button('ghost', 'md')}>
                            {t('common.cancel')}
                        </Link>
                        <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || busy} className={button('primary', 'md')}>
                            {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                            {t('cash.closureForm.submit')}
                        </button>
                    </div>
                </section>
            )}
        </div>
    );
}

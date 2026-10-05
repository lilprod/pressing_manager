import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Banknote, Check, Download, Scale, ShieldAlert, TrendingDown, TrendingUp, UsersRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { StatCard } from '../../components/ui/Metrics';
import { button, cardPadded, cx, input, label, sectionTitle, textLink } from '../../components/ui/styles';
import type {
    CashClosureOperator,
    CashClosurePrecheck,
    CashPaymentBreakdown,
    CashReconciliationMethod,
    CashSummary,
} from '../../types';

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
    const [breakdown, setBreakdown] = useState<CashPaymentBreakdown | null>(null);
    const [precheck, setPrecheck] = useState<CashClosurePrecheck | null>(null);
    const [operators, setOperators] = useState<CashClosureOperator[] | null>(null);
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
        setLoading(true);
        Promise.all([
            api.get<CashSummary>(`/cash/summary?agency_id=${agencyId}`),
            api.get<CashPaymentBreakdown>(`/cash/payment-breakdown?agency_id=${agencyId}`),
            api.get<CashClosurePrecheck>(`/cash/closures/precheck?agency_id=${agencyId}&business_date=${businessDate}`),
            api.get<{ operators: CashClosureOperator[] }>(`/cash/closures/operators?agency_id=${agencyId}&business_date=${businessDate}`),
        ])
            .then(([summaryRes, breakdownRes, precheckRes, operatorsRes]) => {
                setSummary(summaryRes);
                setBreakdown(breakdownRes);
                setPrecheck(precheckRes);
                setOperators(operatorsRes.operators);
            })
            .finally(() => setLoading(false));
    }, [agencyId, businessDate]);

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
    const allCounted = METHODS.every((m) => counts[m] !== '' && Number(counts[m]) >= 0);
    const finalVariance = allCounted ? variances.reduce<number>((sum, v) => sum + (v ?? 0), 0) : null;
    const checklistComplete = CHECKLIST_STEPS.every((step) => checklist.has(step));
    const canSubmit = allCounted && businessDate !== '' && summary !== null && checklistComplete && (!hasAnyVariance || notes.trim() !== '');

    const totalIn = summary && breakdown ? summary.cash_payments_total + summary.manual_in_total + breakdown.by_method.mobile_money.amount + breakdown.by_method.carte.amount : null;
    const totalOut = summary?.manual_out_total ?? null;

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

    async function downloadLastClosurePdf() {
        if (!precheck?.last_closure) return;
        const blob = await api.blob(`/cash/closures/${precheck.last_closure.id}/pdf`);
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }

    return (
        <div className="space-y-4">
            <Link to="/cash" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                {t('cash.backToRegister')}
            </Link>

            {loading ? (
                <LoadingState />
            ) : (
                <div className="space-y-6">
                    {summary && (
                        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 xl:grid-cols-4">
                            <StatCard label={t('cash.closureForm.stats.totalIn')} value={totalIn !== null ? money(totalIn) : '—'} icon={TrendingUp} tone="emerald" />
                            <StatCard label={t('cash.closureForm.stats.totalOut')} value={totalOut !== null ? money(totalOut) : '—'} icon={TrendingDown} tone="rose" />
                            <StatCard label={t('cash.summary.expected')} value={money(summary.expected_balance)} icon={Banknote} tone="brand" />
                            <StatCard
                                label={t('cash.closureForm.stats.finalVariance')}
                                value={finalVariance !== null ? money(finalVariance) : '—'}
                                icon={Scale}
                                tone={finalVariance === null ? 'neutral' : finalVariance === 0 ? 'emerald' : 'amber'}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_320px]">
                    <div className="space-y-6">
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

                            {summary && breakdown && (
                                <dl className="grid grid-cols-2 gap-4 rounded-xl border border-ink-200/80 p-4 text-sm sm:grid-cols-3 dark:border-ink-800">
                                    <div>
                                        <dt className="text-ink-500 dark:text-ink-400">{t('cash.summary.opening')}</dt>
                                        <dd className="font-semibold tabular-nums text-ink-900 dark:text-white">{money(summary.opening_balance)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-ink-500 dark:text-ink-400">{t('cash.summary.cashPayments')}</dt>
                                        <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{money(summary.cash_payments_total)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-ink-500 dark:text-ink-400">{t('cash.method.mobile_money')}</dt>
                                        <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{money(breakdown.by_method.mobile_money.amount)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-ink-500 dark:text-ink-400">{t('cash.method.carte')}</dt>
                                        <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{money(breakdown.by_method.carte.amount)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-ink-500 dark:text-ink-400">{t('cash.summary.manualIn')}</dt>
                                        <dd className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{money(summary.manual_in_total)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-ink-500 dark:text-ink-400">{t('cash.summary.manualOut')}</dt>
                                        <dd className="font-semibold tabular-nums text-red-700 dark:text-red-400">-{money(summary.manual_out_total)}</dd>
                                    </div>
                                </dl>
                            )}

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

                            {allCounted && (
                                <div
                                    className={cx(
                                        'flex items-center justify-between rounded-xl border px-4 py-3',
                                        finalVariance === 0
                                            ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-400/20 dark:bg-emerald-400/10'
                                            : 'border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-400/10',
                                    )}
                                >
                                    <span className="text-sm font-semibold text-ink-900 dark:text-white">{t('cash.closureForm.reconciliationResult.title')}</span>
                                    {finalVariance === 0 ? (
                                        <Pill tone="emerald">{t('cash.closureForm.varianceOk')}</Pill>
                                    ) : (
                                        <Pill tone="amber">
                                            {(finalVariance ?? 0) > 0 ? '+' : ''}
                                            {money(finalVariance ?? 0)}
                                        </Pill>
                                    )}
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
                    </div>

                    <aside className="space-y-4 lg:sticky lg:top-6">
                        <section className={cx(cardPadded, 'space-y-3')}>
                            <div className="flex items-center gap-2">
                                <UsersRound aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                                <h2 className={cx(sectionTitle, 'text-sm')}>{t('cash.closureForm.operators.title')}</h2>
                            </div>
                            {operators && operators.length > 0 ? (
                                <ul className="space-y-1.5">
                                    {operators.map((op, i) => (
                                        <li key={i} className="flex items-center justify-between gap-2 text-sm">
                                            <span className="truncate font-medium text-ink-800 dark:text-ink-100">{op.user?.name ?? '—'}</span>
                                            <Pill tone={op.status === 'verifie' ? 'emerald' : 'amber'}>
                                                {t(`cash.closureForm.operators.status.${op.status}`)}
                                            </Pill>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <EmptyState icon={UsersRound} title={t('cash.closureForm.operators.none')} compact />
                            )}
                        </section>

                        <section className={cx(cardPadded, 'space-y-3')}>
                            <div className="flex items-center gap-2">
                                <ShieldAlert aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                                <h2 className={cx(sectionTitle, 'text-sm')}>{t('cash.closureForm.anomalies.title')}</h2>
                            </div>
                            <ul className="space-y-2 text-sm">
                                <li className="flex items-center justify-between gap-2">
                                    <span className="text-ink-700 dark:text-ink-200">{t('cash.closureForm.anomalies.pendingMovements')}</span>
                                    <Pill tone={precheck && precheck.pending_movements_count > 0 ? 'rose' : 'emerald'}>
                                        {precheck?.pending_movements_count ?? 0}
                                    </Pill>
                                </li>
                                <li className="flex items-center justify-between gap-2">
                                    <span className="text-ink-700 dark:text-ink-200">{t('cash.closureForm.anomalies.alreadyClosed')}</span>
                                    <Pill tone={precheck?.already_closed ? 'rose' : 'emerald'}>
                                        {precheck?.already_closed ? t('common.yes') : t('common.no')}
                                    </Pill>
                                </li>
                            </ul>
                        </section>

                        <section className={cx(cardPadded, 'space-y-3')}>
                            <div className="flex items-center gap-2">
                                <Download aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                                <h2 className={cx(sectionTitle, 'text-sm')}>{t('cash.closureForm.report.title')}</h2>
                            </div>
                            {precheck?.last_closure ? (
                                <div className="space-y-2">
                                    <p className="text-xs text-ink-600 dark:text-ink-350">
                                        {t('cash.closureForm.report.lastClosure', { date: precheck.last_closure.business_date })}
                                    </p>
                                    <button type="button" onClick={() => void downloadLastClosurePdf()} className={button('secondary', 'sm')}>
                                        <Download aria-hidden="true" className="h-4 w-4" />
                                        {t('cash.closureDetail.downloadPdf')}
                                    </button>
                                </div>
                            ) : (
                                <p className="text-xs text-ink-500 dark:text-ink-400">{t('cash.closureForm.report.beforeClosure')}</p>
                            )}
                        </section>
                    </aside>
                    </div>
                </div>
            )}
        </div>
    );
}

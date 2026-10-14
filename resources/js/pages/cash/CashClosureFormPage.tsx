import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Banknote, Check, Download, Scale, ShieldAlert, TrendingDown, TrendingUp, UsersRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { ActionBar, actionBarGhostButton } from '../../components/ui/ActionBar';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { StatCard } from '../../components/ui/Metrics';
import { button, cardPadded, cx, input, label, sectionTitle } from '../../components/ui/styles';
import type {
    CashClosureOperator,
    CashClosurePrecheck,
    CashPaymentBreakdown,
    CashReconciliationMethod,
    CashSummary,
} from '../../types';

function SynthesisRow({ label: text, value, tone }: { label: string; value: string; tone?: 'in' | 'out' }) {
    return (
        <div className="flex items-center justify-between gap-3 py-2.5">
            <dt className="text-ink-700 dark:text-ink-200">{text}</dt>
            <dd
                className={cx(
                    'font-semibold tabular-nums',
                    tone === 'in' ? 'text-emerald-700 dark:text-emerald-400' : tone === 'out' ? 'text-red-700 dark:text-red-400' : 'text-ink-900 dark:text-white',
                )}
            >
                {value}
            </dd>
        </div>
    );
}

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
    const { money, dateTime } = useFormat();
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

    const countedSteps = CHECKLIST_STEPS.filter((step) => checklist.has(step)).length;
    const blockers = [
        !allCounted ? t('cash.closureForm.footer.missingCounts') : null,
        !checklistComplete ? t('cash.closureForm.footer.missingChecklist', { done: countedSteps, total: CHECKLIST_STEPS.length }) : null,
        hasAnyVariance && notes.trim() === '' ? t('cash.closureForm.footer.missingJustification') : null,
    ].filter(Boolean) as string[];

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">{t('cash.closureForm.heading')}</h1>
                        <Pill tone={canSubmit ? 'emerald' : 'amber'}>{canSubmit ? t('cash.closureForm.readyBadge') : t('cash.closureForm.toCompleteBadge')}</Pill>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('cash.closureForm.subtitle')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="date"
                        value={businessDate}
                        max={today()}
                        onChange={(e) => setBusinessDate(e.target.value)}
                        aria-label={t('cash.closureForm.date')}
                        className={cx(input, 'h-10 !w-44')}
                    />
                    <Link to="/cash" className={button('secondary', 'sm')}>
                        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                        {t('cash.closureForm.backToCenter')}
                    </Link>
                    <button type="button" onClick={() => void downloadLastClosurePdf()} disabled={!precheck?.last_closure} className={button('secondary', 'sm')}>
                        <Download aria-hidden="true" className="h-4 w-4" />
                        {t('cash.closureForm.reportPdf')}
                    </button>
                </div>
            </header>

            {error && <Alert tone="error">{error}</Alert>}

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
                                hint={finalVariance === null ? t('cash.closureForm.stats.awaitingCount') : undefined}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                        <div className="min-w-0 space-y-6">
                            {summary && breakdown && (
                                <section className={cx(cardPadded, 'space-y-3')}>
                                    <div>
                                        <h2 className={sectionTitle}>{t('cash.closureForm.synthesis.title')}</h2>
                                        <p className="text-sm text-ink-600 dark:text-ink-350">
                                            {summary.since ? t('cash.summary.since', { date: dateTime(summary.since) }) : t('cash.summary.sinceNever')}
                                        </p>
                                    </div>
                                    <dl className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
                                        <SynthesisRow label={t('cash.summary.opening')} value={money(summary.opening_balance)} />
                                        <SynthesisRow label={t('cash.summary.cashPayments')} value={`+${money(summary.cash_payments_total)}`} tone="in" />
                                        <SynthesisRow label={t('cash.method.mobile_money')} value={`+${money(breakdown.by_method.mobile_money.amount)}`} tone="in" />
                                        <SynthesisRow label={t('cash.method.carte')} value={`+${money(breakdown.by_method.carte.amount)}`} tone="in" />
                                        <SynthesisRow label={t('cash.situation.manualIn')} value={`+${money(summary.manual_in_total)}`} tone="in" />
                                        <SynthesisRow label={t('cash.situation.manualOut')} value={`-${money(summary.manual_out_total)}`} tone="out" />
                                    </dl>
                                    <div className="flex items-center justify-between gap-3 rounded-xl bg-brand-900 px-4 py-3 text-white">
                                        <span>
                                            <span className="block text-sm font-semibold">{t('cash.closureForm.synthesis.expected')}</span>
                                            <span className="block text-xs text-brand-100/70">{t('cash.situation.expectedHint')}</span>
                                        </span>
                                        <span className="font-display text-xl font-bold tabular-nums">{money(summary.expected_balance)}</span>
                                    </div>
                                </section>
                            )}

                            {summary && (
                                <section className={cx(cardPadded, 'space-y-4')}>
                                    <div>
                                        <h2 className={sectionTitle}>{t('cash.closureForm.reconciliation')}</h2>
                                        <p className="text-sm text-ink-600 dark:text-ink-350">{t('cash.closureForm.reconciliationHint')}</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                        {METHODS.map((methodKey) => {
                                            const v = variance(methodKey);
                                            return (
                                                <div key={methodKey} className="min-w-0 space-y-2 rounded-xl border border-ink-200/80 p-4 dark:border-ink-800">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-semibold text-ink-900 dark:text-ink-50">{t(`cash.method.${methodKey}`)}</span>
                                                        <Pill tone={v === null ? 'neutral' : v === 0 ? 'emerald' : 'amber'}>
                                                            {v === null ? t('cash.closureForm.toCount') : v === 0 ? t('cash.closureForm.compliant') : t('cash.closureForm.gap')}
                                                        </Pill>
                                                    </div>
                                                    <dl className="text-xs">
                                                        <div className="flex justify-between gap-2">
                                                            <dt className="text-ink-500 dark:text-ink-400">{t('cash.closureForm.theoretical')}</dt>
                                                            <dd className="font-semibold tabular-nums text-ink-900 dark:text-white">{money(summary.by_method[methodKey].theoretical)}</dd>
                                                        </div>
                                                    </dl>
                                                    <label className="block">
                                                        <span className="text-xs text-ink-500 dark:text-ink-400">{t('cash.closureForm.counted')}</span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            value={counts[methodKey]}
                                                            onChange={(e) => setCounts((c) => ({ ...c, [methodKey]: e.target.value }))}
                                                            className={cx(input, 'w-full')}
                                                        />
                                                    </label>
                                                    <p className="flex justify-between text-xs">
                                                        <span className="text-ink-500 dark:text-ink-400">{t('cash.closureForm.gapLabel')}</span>
                                                        <span
                                                            className={cx(
                                                                'font-semibold tabular-nums',
                                                                v === null ? 'text-ink-400' : v === 0 ? 'text-emerald-700 dark:text-emerald-400' : v > 0 ? 'text-sky-700 dark:text-sky-400' : 'text-red-700 dark:text-red-400',
                                                            )}
                                                        >
                                                            {v === null ? '—' : `${v > 0 ? '+' : ''}${money(v)}`}
                                                        </span>
                                                    </p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            <section className={cx(cardPadded, 'space-y-4')}>
                                <div>
                                    <h2 className={sectionTitle}>{t('cash.closureForm.reconciliationResult.title')}</h2>
                                    <p className="text-sm text-ink-600 dark:text-ink-350">{t('cash.closureForm.reconciliationResult.subtitle')}</p>
                                </div>
                                {!allCounted ? (
                                    <p className="rounded-xl border border-dashed border-ink-300 px-4 py-3 text-sm text-ink-500 dark:border-ink-700 dark:text-ink-400">
                                        {t('cash.closureForm.reconciliationResult.pending')}
                                    </p>
                                ) : finalVariance === 0 && !hasAnyVariance ? (
                                    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-400/20 dark:bg-emerald-400/10">
                                        <span className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                                            <Check aria-hidden="true" className="h-4 w-4" />
                                            {t('cash.closureForm.reconciliationResult.ok')}
                                        </span>
                                        <Pill tone="emerald">{t('cash.closureForm.reconciliationResult.zero')}</Pill>
                                    </div>
                                ) : (
                                    <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
                                        <p className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
                                            <ShieldAlert aria-hidden="true" className="h-4 w-4" />
                                            {t('cash.closureForm.reconciliationResult.gap', { amount: money(finalVariance ?? 0) })}
                                        </p>
                                        <ul className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                                            {METHODS.map((m, i) => (
                                                <li key={m} className="rounded-lg bg-white/70 px-3 py-2 dark:bg-ink-900/60">
                                                    <span className="block text-ink-500 dark:text-ink-400">{t(`cash.method.${m}`)}</span>
                                                    <span className="font-semibold tabular-nums text-ink-900 dark:text-white">
                                                        {(variances[i] ?? 0) > 0 ? '+' : ''}
                                                        {money(variances[i] ?? 0)}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                <label className="block">
                                    <span className={label}>
                                        {hasAnyVariance ? t('cash.closureForm.justification') : t('cash.closureForm.notes')}
                                        {hasAnyVariance && <span className="text-red-600 dark:text-red-400"> *</span>}
                                    </span>
                                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cx(input, 'w-full')} />
                                    {hasAnyVariance && <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t('cash.closureForm.notesRequiredHint')}</p>}
                                </label>
                            </section>
                        </div>

                        <aside className="space-y-4 lg:sticky lg:top-6">
                            <section className={cx(cardPadded, 'space-y-3')}>
                                <div>
                                    <h2 className={cx(sectionTitle, 'text-sm')}>{t('cash.closureForm.checklist')}</h2>
                                    <p className="text-xs text-ink-500 dark:text-ink-400">{t('cash.closureForm.checklistProgress', { done: countedSteps, total: CHECKLIST_STEPS.length })}</p>
                                </div>
                                <ul className="space-y-2">
                                    {CHECKLIST_STEPS.map((step) => (
                                        <li key={step}>
                                            <label
                                                className={cx(
                                                    'flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition',
                                                    checklist.has(step)
                                                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200'
                                                        : 'border-ink-200 text-ink-800 hover:bg-ink-50 dark:border-ink-700 dark:text-ink-100 dark:hover:bg-ink-800',
                                                )}
                                            >
                                                <input type="checkbox" checked={checklist.has(step)} onChange={() => toggleStep(step)} className="h-4 w-4 rounded accent-emerald-600" />
                                                {t(`cash.checklist.${step}`)}
                                            </label>
                                        </li>
                                    ))}
                                </ul>
                            </section>

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

                    <ActionBar
                        status={
                            canSubmit ? (
                                t('cash.closureForm.footer.ready')
                            ) : (
                                <span>
                                    <span className="block font-semibold text-white">{t('cash.closureForm.footer.notReady')}</span>
                                    <span className="block text-xs text-brand-100/80">{blockers.join(' · ')}</span>
                                </span>
                            )
                        }
                    >
                        <Link to="/cash" className={actionBarGhostButton}>
                            {t('common.cancel')}
                        </Link>
                        <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || busy} className={button('accent', 'md')}>
                            {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                            {t('cash.closureForm.submit')}
                        </button>
                    </ActionBar>
                </div>
            )}
        </div>
    );
}

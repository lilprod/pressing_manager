import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { Alert, LoadingState, Spinner } from '../../components/ui/Feedback';
import { button, cardPadded, cx, input, label, textLink } from '../../components/ui/styles';
import type { CashSummary } from '../../types';

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

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
    const [counted, setCounted] = useState('');
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

    async function handleSubmit() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/cash/closures', {
                business_date: businessDate,
                counted_balance: Number(counted),
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

    const variance = summary && counted !== '' ? Number(counted) - summary.expected_balance : null;
    const canSubmit = counted !== '' && Number(counted) >= 0 && businessDate !== '' && summary !== null;

    return (
        <div className="max-w-xl space-y-4">
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

                    {summary && (
                        <div className="space-y-2 rounded-xl border border-ink-200/80 bg-ink-50 p-4 text-sm dark:border-ink-800 dark:bg-ink-950/40">
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">
                                {t('cash.closureForm.breakdown')}
                            </p>
                            <div className="flex justify-between">
                                <span className="text-ink-600 dark:text-ink-350">{t('cash.summary.opening')}</span>
                                <span className="font-semibold tabular-nums text-ink-900 dark:text-white">{money(summary.opening_balance)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-ink-600 dark:text-ink-350">{t('cash.summary.cashPayments')}</span>
                                <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                    +{money(summary.cash_payments_total)}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-ink-600 dark:text-ink-350">{t('cash.summary.manualIn')}</span>
                                <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{money(summary.manual_in_total)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-ink-600 dark:text-ink-350">{t('cash.summary.manualOut')}</span>
                                <span className="font-semibold tabular-nums text-red-700 dark:text-red-400">-{money(summary.manual_out_total)}</span>
                            </div>
                            <div className="flex justify-between border-t border-ink-200/80 pt-2 dark:border-ink-800">
                                <span className="font-semibold text-ink-900 dark:text-white">{t('cash.summary.expected')}</span>
                                <span className="font-display font-bold tabular-nums text-ink-900 dark:text-white">{money(summary.expected_balance)}</span>
                            </div>
                        </div>
                    )}

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

                    <label className="block">
                        <span className={label}>{t('cash.closureForm.counted')}</span>
                        <input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} className={cx(input, 'w-full')} />
                    </label>

                    {variance !== null && (
                        <div
                            className={cx(
                                'rounded-xl px-4 py-3 text-sm font-semibold',
                                variance === 0
                                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300'
                                    : variance > 0
                                      ? 'bg-sky-50 text-sky-800 dark:bg-sky-400/10 dark:text-sky-300'
                                      : 'bg-red-50 text-red-800 dark:bg-red-400/10 dark:text-red-300',
                            )}
                        >
                            {variance === 0
                                ? t('cash.closureForm.varianceOk')
                                : variance > 0
                                  ? `${t('cash.closureForm.varianceOver')} : +${money(variance)}`
                                  : `${t('cash.closureForm.varianceShort')} : ${money(variance)}`}
                        </div>
                    )}

                    <label className="block">
                        <span className={label}>{t('cash.closureForm.notes')}</span>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cx(input, 'w-full')} />
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

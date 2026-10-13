import { useCallback, useEffect, useState } from 'react';
import { Pause, Play, Power, PowerOff } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { SectionCard } from '../../components/ui/Metrics';
import { button, cx, input, label } from '../../components/ui/styles';
import type { CashSession } from '../../types';

/* Sessions de caisse par caissier (audit Figma du 2026-10-13, « Bilan journalier » :
 * sessions ouvertes/en pause/clôturées par poste). Le caissier ouvre sa propre session
 * avec un fond de caisse ; les encaissements qu'il enregistre pendant qu'elle est
 * ouverte y sont rattachés côté serveur (payments.cash_session_id). La clôture compare
 * le compté au théorique (fond + espèces encaissées) et exige un commentaire en cas
 * d'écart — mêmes règles que la clôture d'agence. */
export default function CashSessionsCard({ agencyId, date }: { agencyId: number; date: string }) {
    const { t } = useI18n();
    const { money, time } = useFormat();
    const [sessions, setSessions] = useState<CashSession[]>([]);
    const [mine, setMine] = useState<CashSession | null>(null);
    const [register, setRegister] = useState('Caisse 01');
    const [openingFloat, setOpeningFloat] = useState('0');
    const [counted, setCounted] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        const query = new URLSearchParams({ agency_id: String(agencyId), date });
        void Promise.all([api.get<CashSession[]>(`/cash/sessions?${query}`), api.get<CashSession | null>('/cash/sessions/mine')])
            .then(([list, own]) => {
                setSessions(list);
                setMine(own);
            })
            .catch(() => setSessions([]));
    }, [agencyId, date]);

    useEffect(load, [load]);

    async function run(action: () => Promise<unknown>) {
        setBusy(true);
        setError(null);
        try {
            await action();
            setCounted('');
            setNotes('');
            load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const countedValue = counted === '' ? null : Number(counted);
    const varianceNow = mine && countedValue !== null && mine.expected_now !== null ? countedValue - mine.expected_now : null;

    return (
        <SectionCard id="cash-sessions" title={t('cashSession.title')} subtitle={t('cashSession.subtitle')}>
            {error && <Alert tone="error">{error}</Alert>}

            {mine ? (
                <div className="space-y-3 rounded-xl border border-ink-200/80 p-4 dark:border-ink-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-ink-900 dark:text-white">
                            {t('cashSession.mine', { register: mine.register_label })}
                            <span className="block text-xs font-normal text-ink-600 dark:text-ink-350">
                                {t('cashSession.openedAt', { time: time(mine.opened_at) })} · {t('cashSession.collected', { amount: money(mine.collected_total), count: mine.transactions_count })}
                            </span>
                        </p>
                        <Pill tone={mine.status === 'open' ? 'emerald' : 'amber'}>{t(`cashSession.status.${mine.status}`)}</Pill>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block">
                            <span className={label}>{t('cashSession.counted')}</span>
                            <input type="number" min={0} value={counted} onChange={(e) => setCounted(e.target.value)} className={input} />
                            {mine.expected_now !== null && (
                                <span className="mt-1 block text-xs text-ink-600 dark:text-ink-350">
                                    {t('cashSession.expected', { amount: money(mine.expected_now) })}
                                    {varianceNow !== null && (
                                        <span className={cx('ml-1 font-semibold', varianceNow === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
                                            · {t('cashSession.variance', { amount: money(varianceNow) })}
                                        </span>
                                    )}
                                </span>
                            )}
                        </label>
                        <label className="block">
                            <span className={label}>{t('cashSession.notes')}</span>
                            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
                        </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {mine.status === 'open' ? (
                            <button type="button" disabled={busy} onClick={() => void run(() => api.post(`/cash/sessions/${mine.id}/pause`, {}))} className={button('secondary', 'sm')}>
                                <Pause aria-hidden="true" className="h-4 w-4" />
                                {t('cashSession.pause')}
                            </button>
                        ) : (
                            <button type="button" disabled={busy} onClick={() => void run(() => api.post(`/cash/sessions/${mine.id}/resume`, {}))} className={button('secondary', 'sm')}>
                                <Play aria-hidden="true" className="h-4 w-4" />
                                {t('cashSession.resume')}
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={busy || countedValue === null || (varianceNow !== null && varianceNow !== 0 && !notes.trim())}
                            onClick={() => void run(() => api.post(`/cash/sessions/${mine.id}/close`, { counted_amount: countedValue, notes: notes || null }))}
                            className={button('accent', 'sm')}
                        >
                            {busy ? <Spinner className="h-4 w-4" /> : <PowerOff aria-hidden="true" className="h-4 w-4" />}
                            {t('cashSession.close')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                    <label className="block">
                        <span className={label}>{t('cashSession.register')}</span>
                        <input value={register} onChange={(e) => setRegister(e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('cashSession.openingFloat')}</span>
                        <input type="number" min={0} value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} className={input} />
                    </label>
                    <button
                        type="button"
                        disabled={busy || !register.trim()}
                        onClick={() => void run(() => api.post('/cash/sessions', { register_label: register, opening_float: Number(openingFloat) || 0, agency_id: agencyId }))}
                        className={button('primary', 'md')}
                    >
                        <Power aria-hidden="true" className="h-4 w-4" />
                        {t('cashSession.open')}
                    </button>
                </div>
            )}

            {sessions.length > 0 && (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                    {sessions.map((s) => (
                        <li key={s.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                            <span className="min-w-0 flex-1 basis-full sm:basis-auto">
                                <span className="font-semibold text-ink-900 dark:text-white">{s.register_label}</span>
                                <span className="text-ink-600 dark:text-ink-350"> · {s.cashier?.name ?? '—'}</span>
                                <span className="block text-xs text-ink-500 dark:text-ink-400">
                                    {time(s.opened_at)}
                                    {s.closed_at ? ` → ${time(s.closed_at)}` : ''} · {money(s.collected_total)}
                                </span>
                            </span>
                            {s.variance !== null && (
                                <span className={cx('text-xs font-semibold tabular-nums', s.variance === 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300')}>
                                    {money(s.variance)}
                                </span>
                            )}
                            <Pill tone={s.status === 'open' ? 'emerald' : s.status === 'paused' ? 'amber' : 'neutral'}>{t(`cashSession.status.${s.status}`)}</Pill>
                        </li>
                    ))}
                </ul>
            )}
        </SectionCard>
    );
}

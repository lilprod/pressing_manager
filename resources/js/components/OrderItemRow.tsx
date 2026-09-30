import { useState } from 'react';
import { ArrowRight, Check, ClipboardList, Printer, QrCode, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import { useFormat } from '../lib/format';
import { ALLOWED_TRANSITIONS } from '../lib/orderWorkflow';
import type { OrderItem, OrderItemStatus } from '../types';
import StatusBadge, { Pill } from './ui/StatusBadge';
import { Alert, Spinner } from './ui/Feedback';
import { button, card, cx, input, label } from './ui/styles';

interface Props {
    item: OrderItem;
    onUpdated: (item: OrderItem) => void;
    onPrintLabel: (item: OrderItem) => void;
}

/** Étapes du parcours nominal, utilisées pour la barre de progression (affichage seul). */
const PROGRESS_STEPS: OrderItemStatus[] = ['recu', 'trie', 'en_traitement', 'controle_qualite', 'pret', 'livre'];

export default function OrderItemRow({ item, onUpdated, onPrintLabel }: Props) {
    const { t } = useI18n();
    const { money } = useFormat();
    const [pendingStatus, setPendingStatus] = useState<OrderItemStatus | null>(null);
    const [qcNotes, setQcNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const transitions = ALLOWED_TRANSITIONS[item.status];
    const isQualityCheck = item.status === 'controle_qualite';

    async function applyTransition(status: OrderItemStatus, qualityCheckResult?: 'ok' | 'echec') {
        setBusy(true);
        setError(null);
        try {
            const updated = await api.patch<OrderItem>(`/order-items/${item.id}/status`, {
                status,
                ...(qualityCheckResult ? { quality_check_result: qualityCheckResult, quality_check_notes: qcNotes || null } : {}),
            });
            onUpdated(updated);
            setPendingStatus(null);
            setQcNotes('');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const stepIndex = PROGRESS_STEPS.indexOf(item.status === 'non_recupere' ? 'pret' : item.status);
    const isLost = item.status === 'perdu';

    return (
        <li className={cx(card, 'space-y-4 p-4 sm:p-5')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                    <p className="font-semibold text-ink-900 dark:text-ink-50">
                        {item.service?.name} <span className="text-ink-600 dark:text-ink-350">× {item.quantity}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-1 font-mono text-ink-700 dark:bg-ink-800 dark:text-ink-300">
                            <QrCode aria-hidden="true" className="h-3.5 w-3.5" />
                            {item.qr_code}
                        </span>
                        <span className="tabular-nums text-ink-600 dark:text-ink-350">{money(item.unit_price * item.quantity)}</span>
                    </div>
                    {item.description && <p className="text-sm text-ink-600 dark:text-ink-350">{item.description}</p>}
                    {((item.intake_conditions && item.intake_conditions.length > 0) || item.intake_notes) && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <ClipboardList aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
                            {item.intake_conditions?.map((condition) => (
                                <Pill key={condition.id} tone="amber">
                                    {condition.label}
                                </Pill>
                            ))}
                            {item.intake_notes && <span className="text-xs italic text-ink-600 dark:text-ink-350">{item.intake_notes}</span>}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <StatusBadge kind="order" status={item.status} />
                    <button
                        type="button"
                        onClick={() => onPrintLabel(item)}
                        aria-label={t('order.label')}
                        title={t('order.label')}
                        className={cx(button('secondary', 'sm'), 'no-print w-9 px-0')}
                    >
                        <Printer aria-hidden="true" className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {!isLost && stepIndex >= 0 && (
                <div aria-hidden="true" className="flex gap-1">
                    {PROGRESS_STEPS.map((step, index) => (
                        <span
                            key={step}
                            className={cx(
                                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                                index <= stepIndex ? 'bg-brand-500 dark:bg-brand-400' : 'bg-ink-100 dark:bg-ink-800',
                            )}
                        />
                    ))}
                </div>
            )}

            {error && <Alert tone="error">{error}</Alert>}

            {isQualityCheck ? (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 dark:border-amber-400/20 dark:bg-amber-400/5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                        <ShieldCheck aria-hidden="true" className="h-4 w-4" />
                        {t('qc.result')}
                    </p>
                    <div>
                        <label htmlFor={`qc-notes-${item.id}`} className={label}>
                            {t('qc.notes')}
                        </label>
                        <input id={`qc-notes-${item.id}`} type="text" value={qcNotes} onChange={(e) => setQcNotes(e.target.value)} className={input} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={busy} onClick={() => void applyTransition('pret', 'ok')} className={button('success')}>
                            <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
                            {t('qc.ok')}
                        </button>
                        <button type="button" disabled={busy} onClick={() => void applyTransition('en_traitement', 'echec')} className={button('danger')}>
                            <X aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
                            {t('qc.echec')}
                        </button>
                        {busy && <Spinner className="h-5 w-5 self-center text-ink-600 dark:text-ink-350" />}
                    </div>
                </div>
            ) : (
                transitions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                        {transitions.map((status) =>
                            status === 'perdu' ? (
                                <button
                                    key={status}
                                    type="button"
                                    disabled={busy}
                                    onClick={() => setPendingStatus('perdu')}
                                    className={button('dangerGhost', 'md', 'ml-auto')}
                                >
                                    <TriangleAlert aria-hidden="true" className="h-4 w-4" />
                                    {t(`status.${status}`)}
                                </button>
                            ) : (
                                <button key={status} type="button" disabled={busy} onClick={() => void applyTransition(status)} className={button('secondary')}>
                                    {t(`status.${status}`)}
                                    <ArrowRight aria-hidden="true" className="h-4 w-4" />
                                </button>
                            ),
                        )}
                        {busy && <Spinner className="h-5 w-5 text-ink-600 dark:text-ink-350" />}
                    </div>
                )
            )}

            {pendingStatus === 'perdu' && (
                <div
                    role="alertdialog"
                    aria-label={t('status.perdu')}
                    className="flex animate-fade-in flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm dark:border-red-400/20 dark:bg-red-400/10"
                >
                    <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-red-700 dark:text-red-300" />
                    <span className="flex-1 font-semibold text-red-800 dark:text-red-300">{t('order.confirmLost')}</span>
                    <button type="button" onClick={() => void applyTransition('perdu')} className={button('danger', 'sm')}>
                        {t('common.confirm')}
                    </button>
                    <button type="button" onClick={() => setPendingStatus(null)} className={button('ghost', 'sm')}>
                        {t('common.cancel')}
                    </button>
                </div>
            )}
        </li>
    );
}

import { useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import { ALLOWED_TRANSITIONS } from '../lib/orderWorkflow';
import type { OrderItem, OrderItemStatus } from '../types';

interface Props {
    item: OrderItem;
    onUpdated: (item: OrderItem) => void;
    onPrintLabel: (item: OrderItem) => void;
}

export default function OrderItemRow({ item, onUpdated, onPrintLabel }: Props) {
    const { t } = useI18n();
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

    return (
        <li className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <p className="font-medium">
                        {item.service?.name} × {item.quantity}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">{item.qr_code}</p>
                </div>
                <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium dark:bg-slate-700">{t(`status.${item.status}`)}</span>
                <button type="button" onClick={() => onPrintLabel(item)} className="text-sm text-indigo-600 dark:text-indigo-400">
                    {t('order.label')}
                </button>
            </div>

            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            {isQualityCheck ? (
                <div className="space-y-2">
                    <label htmlFor={`qc-notes-${item.id}`} className="block text-sm">
                        {t('qc.notes')}
                    </label>
                    <input
                        id={`qc-notes-${item.id}`}
                        type="text"
                        value={qcNotes}
                        onChange={(e) => setQcNotes(e.target.value)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void applyTransition('pret', 'ok')}
                            className="rounded-md bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
                        >
                            {t('qc.ok')}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void applyTransition('en_traitement', 'echec')}
                            className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
                        >
                            {t('qc.echec')}
                        </button>
                    </div>
                </div>
            ) : (
                transitions.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {transitions.map((status) => (
                            <button
                                key={status}
                                type="button"
                                disabled={busy}
                                onClick={() => (status === 'perdu' ? setPendingStatus('perdu') : void applyTransition(status))}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:border-indigo-500 disabled:opacity-50 dark:border-slate-600"
                            >
                                {t(`status.${status}`)}
                            </button>
                        ))}
                    </div>
                )
            )}

            {pendingStatus === 'perdu' && (
                <div role="alertdialog" aria-label={t('status.perdu')} className="flex items-center gap-2 text-sm">
                    <span>{t('status.perdu')} ?</span>
                    <button type="button" onClick={() => void applyTransition('perdu')} className="font-medium text-red-600 dark:text-red-400">
                        {t('common.save')}
                    </button>
                    <button type="button" onClick={() => setPendingStatus(null)} className="text-slate-600 dark:text-slate-400">
                        {t('common.cancel')}
                    </button>
                </div>
            )}
        </li>
    );
}

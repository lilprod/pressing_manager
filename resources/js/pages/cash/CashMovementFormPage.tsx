import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowDownCircle, ArrowUpCircle, Check, Paperclip, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cardPadded, cx, input, label, select, sectionTitle, textLink } from '../../components/ui/styles';
import type { CashEligibleValidators, CashMovementCategory, CashMovementType } from '../../types';

const CATEGORIES: CashMovementCategory[] = ['fourniture', 'salaire', 'depot_banque', 'retrait_banque', 'remboursement', 'autre'];

function CheckItem({ done, label: text }: { done: boolean; label: string }) {
    return (
        <li className="flex items-center gap-2 text-sm">
            <span
                className={cx(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                    done ? 'bg-emerald-600 text-white dark:bg-emerald-400 dark:text-ink-950' : 'bg-ink-200 dark:bg-ink-700',
                )}
            >
                {done && <Check aria-hidden="true" className="h-3 w-3" strokeWidth={3} />}
            </span>
            <span className={done ? 'text-ink-800 dark:text-ink-100' : 'text-ink-500 dark:text-ink-400'}>{text}</span>
        </li>
    );
}

export default function CashMovementFormPage() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const { user, activeAgencyId, agencies } = useAuth();
    const isGlobal = user?.agency_id === null;
    const fileInput = useRef<HTMLInputElement>(null);

    const [type, setType] = useState<CashMovementType>('sortie');
    const [category, setCategory] = useState<CashMovementCategory>('autre');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [counterparty, setCounterparty] = useState('');
    const [reference, setReference] = useState('');
    const [note, setNote] = useState('');
    const [proof, setProof] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [validators, setValidators] = useState<CashEligibleValidators | null>(null);

    const agencyId = user?.agency_id ?? activeAgencyId;
    const agencyCode = user?.agency?.code ?? agencies.find((a) => a.id === agencyId)?.code ?? null;

    useEffect(() => {
        if (!agencyId) {
            setValidators(null);
            return;
        }
        api
            .get<CashEligibleValidators>(`/cash/movements/eligible-validators?agency_id=${agencyId}`)
            .then(setValidators)
            .catch(() => setValidators(null));
    }, [agencyId]);

    async function handleSubmit() {
        setBusy(true);
        setError(null);
        if (isGlobal && !activeAgencyId) {
            setError(t('client.selectAgency'));
            setBusy(false);
            return;
        }
        try {
            const formData = new FormData();
            formData.append('type', type);
            formData.append('category', category);
            formData.append('amount', amount);
            formData.append('reason', reason);
            if (counterparty) formData.append('counterparty', counterparty);
            if (reference) formData.append('reference', reference);
            if (note) formData.append('note', note);
            if (proof) formData.append('proof', proof);
            if (isGlobal && activeAgencyId) formData.append('agency_id', String(activeAgencyId));

            await api.postForm('/cash/movements', formData);
            navigate('/cash');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const amountFilled = amount !== '' && Number(amount) > 0;
    const reasonFilled = reason.trim() !== '';
    const canSubmit = amountFilled && reasonFilled;
    const threshold = validators?.threshold ?? null;
    const isSensitive = threshold !== null && Number(amount || 0) >= threshold;

    return (
        <div className="space-y-4">
            <Link to="/cash" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                {t('cash.backToRegister')}
            </Link>

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_320px]">
                <section className={cx(cardPadded, 'space-y-5')}>
                    <div>
                        <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">{t('cash.movementForm.title')}</h1>
                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('cash.movementForm.subtitle')}</p>
                    </div>

                    {error && <Alert tone="error">{error}</Alert>}

                    <div className="space-y-2">
                        <span className={label}>{t('cash.movementForm.type')}</span>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setType('entree')}
                                className={cx(
                                    'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition',
                                    type === 'entree'
                                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300'
                                        : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200',
                                )}
                            >
                                <ArrowUpCircle aria-hidden="true" className="h-4 w-4" />
                                {t('cash.movement.entree')}
                            </button>
                            <button
                                type="button"
                                onClick={() => setType('sortie')}
                                className={cx(
                                    'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition',
                                    type === 'sortie'
                                        ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-400/40 dark:bg-red-400/10 dark:text-red-300'
                                        : 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200',
                                )}
                            >
                                <ArrowDownCircle aria-hidden="true" className="h-4 w-4" />
                                {t('cash.movement.sortie')}
                            </button>
                        </div>
                    </div>

                    <label className="block">
                        <span className={label}>{t('cash.movementForm.category')}</span>
                        <select value={category} onChange={(e) => setCategory(e.target.value as CashMovementCategory)} className={cx(select, 'w-full')}>
                            {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                    {t(`cash.movementCategory.${c}`)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="block">
                        <span className={label}>{t('cash.movementForm.amount')}</span>
                        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={cx(input, 'w-full')} />
                    </label>

                    <label className="block">
                        <span className={label}>{t('cash.movementForm.reason')}</span>
                        <input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={t('cash.movementForm.reasonPlaceholder')}
                            className={cx(input, 'w-full')}
                        />
                    </label>

                    <label className="block">
                        <span className={label}>{t('cash.movementForm.counterparty')}</span>
                        <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className={cx(input, 'w-full')} />
                    </label>

                    <label className="block">
                        <span className={label}>{t('cash.movementForm.reference')}</span>
                        <input value={reference} onChange={(e) => setReference(e.target.value)} className={cx(input, 'w-full')} />
                    </label>

                    <label className="block">
                        <span className={label}>{t('cash.movementForm.note')}</span>
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={cx(input, 'w-full')} />
                    </label>

                    <div className="space-y-2">
                        <span className={label}>{t('cash.movementForm.proof')}</span>
                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/png,image/jpeg,application/pdf"
                            onChange={(e) => setProof(e.target.files?.[0] ?? null)}
                            className="hidden"
                        />
                        <button type="button" onClick={() => fileInput.current?.click()} className={button('secondary', 'md')}>
                            <Paperclip aria-hidden="true" className="h-4 w-4" />
                            {proof ? proof.name : t('cash.movementForm.proofAttach')}
                        </button>
                    </div>

                    {isSensitive && <Alert tone="warning">{t('cash.movementForm.sensitiveWarning')}</Alert>}

                    <div className="flex justify-end gap-2 border-t border-ink-200/80 pt-5 dark:border-ink-800">
                        <Link to="/cash" className={button('ghost', 'md')}>
                            {t('common.cancel')}
                        </Link>
                        <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || busy} className={button('accent', 'md')}>
                            {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                            {t('common.save')}
                        </button>
                    </div>
                </section>

                <aside className="space-y-4 lg:sticky lg:top-6">
                    <section className={cx(cardPadded, 'space-y-3')}>
                        <div className="flex items-center gap-2">
                            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-400" />
                            <h2 className={cx(sectionTitle, 'text-sm')}>{t('cash.movementForm.doubleControl.title')}</h2>
                        </div>
                        <p className="text-xs text-ink-600 dark:text-ink-350">
                            {threshold !== null
                                ? t('cash.movementForm.doubleControl.rule', { threshold: threshold.toLocaleString('fr-FR') })
                                : t('cash.movementForm.doubleControl.loading')}
                        </p>
                        {validators && validators.validators.length > 0 ? (
                            <ul className="space-y-1.5">
                                {validators.validators.map((v) => (
                                    <li key={v.id} className="flex items-center justify-between text-sm">
                                        <span className="text-ink-800 dark:text-ink-100">{v.name}</span>
                                        <Pill tone="neutral">{t('cash.movementForm.doubleControl.eligible')}</Pill>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            validators && <p className="text-xs text-ink-500 dark:text-ink-400">{t('cash.movementForm.doubleControl.none')}</p>
                        )}
                    </section>

                    <section className={cx(cardPadded, 'space-y-2')}>
                        <h2 className={cx(sectionTitle, 'text-sm')}>{t('cash.movementForm.checklist.title')}</h2>
                        <ul className="space-y-1.5">
                            <CheckItem done={amountFilled} label={t('cash.movementForm.checklist.amount')} />
                            <CheckItem done={reasonFilled} label={t('cash.movementForm.checklist.reason')} />
                            <CheckItem done={proof !== null} label={t('cash.movementForm.checklist.proof')} />
                        </ul>
                    </section>

                    <section className={cx(cardPadded, 'space-y-2')}>
                        <h2 className={cx(sectionTitle, 'text-sm')}>{t('cash.movementForm.traceability.title')}</h2>
                        <p className="text-xs text-ink-600 dark:text-ink-350">{t('cash.movementForm.traceability.beforeCreate')}</p>
                    </section>

                    {agencyCode && (
                        <section className={cx(card, 'px-4 py-3')}>
                            <p className="text-xs text-ink-500 dark:text-ink-400">{t('cash.movementForm.agencyCode')}</p>
                            <p className="font-display text-sm font-bold text-ink-900 dark:text-white">{agencyCode}</p>
                        </section>
                    )}
                </aside>
            </div>
        </div>
    );
}

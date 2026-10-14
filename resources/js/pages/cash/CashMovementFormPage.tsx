import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDownLeft, ArrowLeft, ArrowUpRight, Banknote, Building2, CheckCircle2, Hash, Paperclip, Save, ShieldCheck, UploadCloud, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { ActionBar, actionBarGhostButton } from '../../components/ui/ActionBar';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cardPadded, cx, input, label, select, sectionTitle } from '../../components/ui/styles';
import type { CashSession, CashSummary, CashEligibleValidators, CashMovementCategory, CashMovementType } from '../../types';

const CATEGORIES: CashMovementCategory[] = ['fourniture', 'salaire', 'depot_banque', 'retrait_banque', 'remboursement', 'autre'];

type CheckTone = 'ok' | 'blocking' | 'advice';

/** Ligne de la carte « Validation avant enregistrement » : bloquant (rouge), conseil (ambre) ou validé (vert). */
function CheckItem({ tone, label: text }: { tone: CheckTone; label: string }) {
    const Icon = tone === 'ok' ? CheckCircle2 : tone === 'blocking' ? XCircle : AlertTriangle;
    return (
        <li
            className={cx(
                'flex items-start gap-2 rounded-lg px-3 py-2 text-sm',
                tone === 'ok' && 'bg-emerald-50 text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300',
                tone === 'blocking' && 'bg-red-50 text-red-800 dark:bg-red-400/10 dark:text-red-300',
                tone === 'advice' && 'bg-amber-50 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200',
            )}
        >
            <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{text}</span>
        </li>
    );
}

const MAX_PROOF_BYTES = 10 * 1024 * 1024;
const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export default function CashMovementFormPage() {
    const navigate = useNavigate();
    const { t } = useI18n();
    const { money, time } = useFormat();
    const { user, activeAgencyId, agencies } = useAuth();
    const isGlobal = user?.agency_id === null;
    const fileInput = useRef<HTMLInputElement>(null);

    const [type, setType] = useState<CashMovementType>('sortie');
    // Pas de catégorie présélectionnée : le choix est obligatoire, comme sur la maquette.
    const [category, setCategory] = useState<CashMovementCategory | ''>('');
    const [amount, setAmount] = useState('');
    const [reason, setReason] = useState('');
    const [counterparty, setCounterparty] = useState('');
    const [reference, setReference] = useState('');
    const [note, setNote] = useState('');
    const [proof, setProof] = useState<File | null>(null);
    const [rejectedProof, setRejectedProof] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    const [attempted, setAttempted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [validators, setValidators] = useState<CashEligibleValidators | null>(null);
    // « Caisse concernée » (capture Figma) : solde espèces théorique réel de l'agence et
    // session de caisse ouverte de l'opérateur, s'il en a une.
    const [summary, setSummary] = useState<CashSummary | null>(null);
    const [session, setSession] = useState<CashSession | null>(null);
    // Heure d'ouverture du brouillon : premier jalon réel de la traçabilité prévisionnelle.
    const [draftStartedAt] = useState(() => new Date().toISOString());

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
        api.get<CashSummary>(`/cash/summary?agency_id=${agencyId}`).then(setSummary).catch(() => setSummary(null));
        api.get<CashSession | null>('/cash/sessions/mine').then((s) => setSession(s && s.id ? s : null)).catch(() => setSession(null));
    }, [agencyId]);

    function pickProof(file: File | null) {
        if (!file) return;
        if (!PROOF_TYPES.includes(file.type) || file.size > MAX_PROOF_BYTES) {
            setProof(null);
            setRejectedProof(file.name);
            return;
        }
        setRejectedProof(null);
        setProof(file);
    }

    const amountFilled = amount !== '' && Number(amount) > 0;
    const reasonFilled = reason.trim() !== '';
    const categoryFilled = category !== '';
    const threshold = validators?.threshold ?? null;
    const isSensitive = threshold !== null && Number(amount || 0) >= threshold;
    const balanceOk = type === 'entree' || summary === null || !amountFilled || Number(amount) <= summary.expected_balance;
    const canSubmit = amountFilled && reasonFilled && categoryFilled;

    const checks: { tone: CheckTone; label: string }[] = [];
    if (!categoryFilled) checks.push({ tone: 'blocking', label: t('cash.movementForm.checklist.category') });
    if (!amountFilled) checks.push({ tone: 'blocking', label: t('cash.movementForm.checklist.amountMissing') });
    if (!reasonFilled) checks.push({ tone: 'blocking', label: t('cash.movementForm.checklist.reasonMissing') });
    checks.push(proof ? { tone: 'ok', label: t('cash.movementForm.checklist.proof') } : { tone: 'advice', label: t('cash.movementForm.checklist.proofAdvice') });
    if (type === 'sortie' && summary) {
        checks.push(balanceOk ? { tone: 'ok', label: t('cash.movementForm.checklist.balanceOk') } : { tone: 'advice', label: t('cash.movementForm.checklist.balanceLow') });
    }
    const blockingCount = checks.filter((c) => c.tone === 'blocking').length;

    // Traçabilité prévisionnelle : jalons dérivés de l'état réel du formulaire, sans rien
    // présumer de ce qui n'est pas encore arrivé (« à venir »).
    const trace = [
        { key: 'draft', title: t('cash.movementForm.trace.draft'), meta: `${user?.name ?? ''}${agencyCode ? ` · ${agencyCode}` : ''}`, at: time(draftStartedAt), done: true },
        ...(isSensitive
            ? [
                  { key: 'rule', title: t('cash.movementForm.trace.sensitive'), meta: t('cash.movementForm.trace.sensitiveRule', { threshold: money(threshold ?? 0) }), at: '', done: true },
                  { key: 'second', title: t('cash.movementForm.trace.second'), meta: t('cash.movementForm.trace.secondMeta'), at: t('cash.movementForm.trace.pending'), done: false },
              ]
            : [{ key: 'journal', title: t('cash.movementForm.trace.journal'), meta: t('cash.movementForm.trace.journalMeta'), at: t('cash.movementForm.trace.pending'), done: false }]),
    ];

    async function handleSubmit() {
        setAttempted(true);
        if (!canSubmit) return;
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

    const typeLabel = t(`cash.movementForm.nature.${type}`);

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">{t('cash.movementForm.title')}</h1>
                        <Pill tone="amber">{t('cash.movementForm.draft')}</Pill>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('cash.movementForm.subtitle')}</p>
                </div>
                <Link to="/cash" className={button('secondary', 'md')}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    {t('cash.movementForm.backToJournal')}
                </Link>
            </header>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_320px]">
                <div className="min-w-0 space-y-4">
                    <section className={cx(cardPadded, 'space-y-4')}>
                        <div>
                            <h2 className={sectionTitle}>{t('cash.movementForm.nature.title')}</h2>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('cash.movementForm.nature.subtitle')}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {(['entree', 'sortie'] as const).map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setType(value)}
                                    aria-pressed={type === value}
                                    className={cx(
                                        'flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition',
                                        type === value && value === 'entree' && 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/40 dark:bg-emerald-400/10 dark:text-emerald-300',
                                        type === value && value === 'sortie' && 'border-red-300 bg-red-50 text-red-800 dark:border-red-400/40 dark:bg-red-400/10 dark:text-red-300',
                                        type !== value && 'border-ink-200 bg-white text-ink-700 hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200',
                                    )}
                                >
                                    {value === 'entree' ? <ArrowDownLeft aria-hidden="true" className="h-4 w-4" /> : <ArrowUpRight aria-hidden="true" className="h-4 w-4" />}
                                    {t(`cash.movementForm.nature.${value}`)}
                                </button>
                            ))}
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>{t('cash.movementForm.category')} *</span>
                                <select
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value as CashMovementCategory | '')}
                                    aria-invalid={attempted && !categoryFilled}
                                    className={cx(select, 'w-full', attempted && !categoryFilled && 'border-red-400 dark:border-red-400')}
                                >
                                    <option value="">{t('cash.movementForm.categoryPlaceholder')}</option>
                                    {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {t(`cash.movementCategory.${c}`)}
                                        </option>
                                    ))}
                                </select>
                                {attempted && !categoryFilled && <span className="mt-1 block text-xs text-red-700 dark:text-red-300">{t('cash.movementForm.categoryRequired')}</span>}
                            </label>
                            <label className="block">
                                <span className={label}>{t('cash.movementForm.amount')} *</span>
                                <span className="relative block">
                                    <Banknote aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-400" />
                                    <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={cx(input, 'w-full pl-9')} />
                                </span>
                            </label>
                        </div>
                    </section>

                    <section className={cx(cardPadded, 'space-y-4')}>
                        <div>
                            <h2 className={sectionTitle}>{t('cash.movementForm.details.title')}</h2>
                            <p className="text-sm text-ink-600 dark:text-ink-350">
                                {type === 'sortie' ? t('cash.movementForm.details.subtitleOut') : t('cash.movementForm.details.subtitleIn')}
                            </p>
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>{t('cash.movementForm.paymentMode')}</span>
                                {/* Un mouvement de caisse est toujours en espèces (caisse physique). */}
                                <select value="espece" disabled className={cx(select, 'w-full')}>
                                    <option value="espece">{t('cash.method.espece')}</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className={label}>{t('cash.movementForm.counterparty')}</span>
                                <span className="relative block">
                                    <Building2 aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-400" />
                                    <input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} className={cx(input, 'w-full pl-9')} />
                                </span>
                            </label>
                            <label className="block">
                                <span className={label}>{t('cash.movementForm.reason')} *</span>
                                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('cash.movementForm.reasonPlaceholder')} className={cx(input, 'w-full')} />
                            </label>
                            <label className="block">
                                <span className={label}>{t('cash.movementForm.reference')}</span>
                                <span className="relative block">
                                    <Hash aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-400" />
                                    <input value={reference} onChange={(e) => setReference(e.target.value)} className={cx(input, 'w-full pl-9')} />
                                </span>
                            </label>
                        </div>
                        <label className="block">
                            <span className={label}>{t('cash.movementForm.comment')}</span>
                            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={cx(input, 'w-full')} />
                        </label>
                    </section>

                    <section className={cx(cardPadded, 'space-y-3')}>
                        <div>
                            <h2 className={sectionTitle}>{t('cash.movementForm.proof')}</h2>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('cash.movementForm.proofHint')}</p>
                        </div>
                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/png,image/jpeg,application/pdf"
                            onChange={(e) => {
                                pickProof(e.target.files?.[0] ?? null);
                                e.target.value = '';
                            }}
                            className="hidden"
                        />
                        <button
                            type="button"
                            onClick={() => fileInput.current?.click()}
                            onDragOver={(e) => {
                                e.preventDefault();
                                setDragging(true);
                            }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragging(false);
                                pickProof(e.dataTransfer.files?.[0] ?? null);
                            }}
                            className={cx(
                                'flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition',
                                dragging ? 'border-brand-500 bg-brand-50 dark:bg-brand-400/10' : 'border-ink-300 hover:border-ink-400 dark:border-ink-700',
                            )}
                        >
                            <UploadCloud aria-hidden="true" className="h-6 w-6 text-ink-500 dark:text-ink-400" />
                            <span className="text-sm font-semibold text-ink-800 dark:text-ink-100">{proof ? proof.name : t('cash.movementForm.proofDrop')}</span>
                            <span className="text-xs text-ink-500 dark:text-ink-400">{t('cash.movementForm.proofEncrypted')}</span>
                        </button>
                        {proof && (
                            <div className="flex items-center justify-between gap-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-300">
                                <span className="flex min-w-0 items-center gap-2">
                                    <Paperclip aria-hidden="true" className="h-4 w-4 shrink-0" />
                                    <span className="truncate">{proof.name}</span>
                                </span>
                                <button type="button" onClick={() => setProof(null)} className="font-semibold underline">
                                    {t('cash.movementForm.proofRemove')}
                                </button>
                            </div>
                        )}
                        {rejectedProof && (
                            <div className="flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-300">
                                <span className="flex min-w-0 items-start gap-2">
                                    <XCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span className="min-w-0">
                                        <span className="block font-semibold break-words">{t('cash.movementForm.proofRejected', { name: rejectedProof })}</span>
                                        <span className="block text-xs">{t('cash.movementForm.proofRejectedHint')}</span>
                                    </span>
                                </span>
                                <button type="button" onClick={() => setRejectedProof(null)} className="shrink-0 font-semibold underline">
                                    {t('cash.movementForm.proofRemove')}
                                </button>
                            </div>
                        )}
                    </section>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-6">
                    <section
                        className={cx(
                            cardPadded,
                            'space-y-3',
                            isSensitive && 'border-amber-300 bg-amber-50/60 dark:border-amber-400/40 dark:bg-amber-400/5',
                        )}
                    >
                        <div className="flex items-start gap-2">
                            <ShieldCheck aria-hidden="true" className={cx('mt-0.5 h-4 w-4', isSensitive ? 'text-amber-700 dark:text-amber-300' : 'text-ink-500 dark:text-ink-400')} />
                            <div>
                                <h2 className={cx(sectionTitle, 'text-sm')}>{t('cash.movementForm.doubleControl.title')}</h2>
                                {threshold !== null && (
                                    <p className="text-xs text-ink-600 dark:text-ink-350">
                                        {isSensitive ? t('cash.movementForm.doubleControl.triggered', { threshold: money(threshold) }) : t('cash.movementForm.doubleControl.notTriggered', { threshold: money(threshold) })}
                                    </p>
                                )}
                            </div>
                        </div>
                        <p className="text-xs text-ink-600 dark:text-ink-350">
                            {threshold !== null
                                ? t('cash.movementForm.doubleControl.rule', { threshold: threshold.toLocaleString('fr-FR') })
                                : t('cash.movementForm.doubleControl.loading')}
                        </p>
                        {user && (
                            <div className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm dark:bg-ink-900">
                                <span className="min-w-0">
                                    <span className="block truncate font-semibold text-ink-900 dark:text-ink-50">{user.name}</span>
                                    <span className="block text-xs text-ink-500 dark:text-ink-400">{t('cash.movementForm.doubleControl.initiator')}</span>
                                </span>
                                <Pill tone="emerald">{t('cash.movementForm.doubleControl.initiatorBadge')}</Pill>
                            </div>
                        )}
                        {validators && validators.validators.filter((v) => v.id !== user?.id).length > 0 ? (
                            <ul className="space-y-1.5">
                                {validators.validators
                                    .filter((v) => v.id !== user?.id)
                                    .map((v) => (
                                        <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
                                            <span className="truncate text-ink-800 dark:text-ink-100">{v.name}</span>
                                            <Pill tone={isSensitive ? 'amber' : 'neutral'}>
                                                {isSensitive ? t('cash.movementForm.doubleControl.canValidate') : t('cash.movementForm.doubleControl.eligible')}
                                            </Pill>
                                        </li>
                                    ))}
                            </ul>
                        ) : (
                            validators && <p className="text-xs text-ink-500 dark:text-ink-400">{t('cash.movementForm.doubleControl.none')}</p>
                        )}
                    </section>

                    <section className={cx(cardPadded, 'space-y-2')}>
                        <div>
                            <h2 className={cx(sectionTitle, 'text-sm')}>{t('cash.movementForm.checklist.title')}</h2>
                            <p className="text-xs text-ink-600 dark:text-ink-350">
                                {blockingCount > 0 ? t('cash.movementForm.checklist.blocking', { count: blockingCount }) : t('cash.movementForm.checklist.ready')}
                            </p>
                        </div>
                        <ul className="space-y-1.5">
                            {checks.map((c) => (
                                <CheckItem key={c.label} tone={c.tone} label={c.label} />
                            ))}
                        </ul>
                    </section>

                    <section className={cx(cardPadded, 'space-y-3')}>
                        <div>
                            <h2 className={cx(sectionTitle, 'text-sm')}>{t('cash.movementForm.traceability.title')}</h2>
                            <p className="text-xs text-ink-600 dark:text-ink-350">{t('cash.movementForm.traceability.subtitle')}</p>
                        </div>
                        <ol className="space-y-3">
                            {trace.map((step) => (
                                <li key={step.key} className="flex gap-3">
                                    <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', step.done ? 'bg-emerald-500' : 'bg-accent-500')} />
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-baseline justify-between gap-2">
                                            <span className="text-sm font-semibold text-ink-900 dark:text-ink-50">{step.title}</span>
                                            <span className="shrink-0 text-xs text-ink-500 dark:text-ink-400">{step.at}</span>
                                        </span>
                                        <span className="block text-xs text-ink-500 dark:text-ink-400">{step.meta}</span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </section>

                    {agencyCode && (
                        <section className={cx(card, 'space-y-1 px-4 py-3')}>
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-ink-500 dark:text-ink-400">{t('cash.movementForm.register')}</p>
                                <Pill tone={session?.status === 'open' ? 'emerald' : session ? 'amber' : 'neutral'}>
                                    {session ? t(`cashSession.status.${session.status}`) : t('cash.movementForm.noSession')}
                                </Pill>
                            </div>
                            <p className="font-display text-sm font-bold text-ink-900 dark:text-white">
                                {agencyCode}
                                {session ? ` · ${session.register_label}` : ''}
                            </p>
                            {summary && <p className="text-xs text-ink-600 dark:text-ink-350">{t('cash.movementForm.availableCash', { amount: money(summary.expected_balance) })}</p>}
                        </section>
                    )}
                </aside>
            </div>

            <ActionBar
                status={
                    amountFilled ? (
                        <span>
                            <span className="block font-semibold text-white">
                                {typeLabel} · {money(Number(amount))}
                            </span>
                            <span className="block text-xs text-brand-100/80">
                                {isSensitive ? t('cash.movementForm.footer.sensitive') : t('cash.movementForm.footer.direct')}
                            </span>
                        </span>
                    ) : undefined
                }
            >
                <Link to="/cash" className={actionBarGhostButton}>
                    {t('common.cancel')}
                </Link>
                <button type="button" onClick={() => void handleSubmit()} disabled={busy} className={button('accent', 'md')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                    {t('cash.movementForm.submit')}
                </button>
            </ActionBar>
        </div>
    );
}

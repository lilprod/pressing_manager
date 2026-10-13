import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowLeft,
    Banknote,
    CircleAlert,
    Clock3,
    Hash,
    Save,
    Wallet,
    Workflow,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { auditLogLabel, auditTypeLabel } from '../../lib/auditLog';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { SectionCard } from '../../components/ui/Metrics';
import { Pill } from '../../components/ui/StatusBadge';
import Toggle from '../../components/ui/Toggle';
import { button, cardPadded, cx, inputSm, label, sectionTitle, textLink } from '../../components/ui/styles';
import type { AgencySettings, AuditLog } from '../../types';

/* Écran « Paramètres opérationnels » (node 25:12525), par agence — mirrors la mise
 * en page de SecuritySettingsPage.tsx (champs suffixés + bascules). Réglages
 * réellement consommés par le backend (voir CLAUDE.md « Opérationnel »), pas un
 * simple formulaire cosmétique : numérotation (affichage seul), délais (plancher de
 * promised_at), blocage retrait si impayé, étapes atelier, montant minimum, seuil de
 * fidélité. Audit Figma du 2026-10-13 : codes dépôt de toutes les agences sur une même
 * carte (PUT /agency-settings/numbering), aperçu du workflow résultant, retrait
 * immédiat / frais de livraison / délai de repassage réellement appliqués, cumul
 * fidélité × promotions, mode hors ligne activable et intervalle de synchronisation
 * appliqué par sync.ts. Restent affichage seul : rétention locale (purger une file
 * non synchronisée ferait perdre des dépôts) et frais de collecte (aucune collecte à
 * domicile n'existe). */

type NumberingRow = {
    agency_id: number;
    agency_name: string;
    order_number_prefix: string | null;
    order_number_suffix: string | null;
    order_number_padding: number;
    next_number: number;
};

type FormState = Omit<AgencySettings, 'agency_id' | 'updated_at'>;

function toForm(s: AgencySettings): FormState {
    const { agency_id, updated_at, ...rest } = s;
    return rest;
}

export default function OperationalSettingsPage() {
    const { t } = useI18n();
    const { dateTime } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;

    const [saved, setSaved] = useState<AgencySettings | null>(null);
    const [form, setForm] = useState<FormState | null>(null);
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [numbering, setNumbering] = useState<NumberingRow[]>([]);
    const [savedNumbering, setSavedNumbering] = useState<NumberingRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    useEffect(() => {
        if (!agencyId) {
            setSaved(null);
            setForm(null);
            setLogs([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        Promise.all([
            api.get<AgencySettings>(`/agencies/${agencyId}/settings`),
            api.get<{ data: AuditLog[] }>(`/audit-logs?type=agency_setting&agency_id=${agencyId}&per_page=5`).catch(() => null),
            api.get<NumberingRow[]>('/agency-settings/numbering').catch(() => [] as NumberingRow[]),
        ])
            .then(([settings, auditPage, rows]) => {
                setSaved(settings);
                setForm(toForm(settings));
                setLogs(auditPage?.data ?? []);
                setNumbering(rows);
                setSavedNumbering(rows);
            })
            .finally(() => setLoading(false));
    }, [agencyId]);

    function set<K extends keyof FormState>(key: K, value: FormState[K]) {
        setForm((f) => (f ? { ...f, [key]: value } : f));
        setFeedback(null);
    }

    const changedFields = form && saved ? (Object.keys(toForm(saved)) as (keyof FormState)[]).filter((k) => toForm(saved)[k] !== form[k]).length : 0;
    const changedCodes = numbering.filter((row) => {
        const before = savedNumbering.find((r) => r.agency_id === row.agency_id);
        return before && (before.order_number_prefix !== row.order_number_prefix || before.order_number_suffix !== row.order_number_suffix);
    });
    const changesCount = changedFields + changedCodes.length;
    const dirty = changesCount > 0;

    function setCode(agency: number, key: 'order_number_prefix' | 'order_number_suffix', value: string) {
        setNumbering((rows) => rows.map((r) => (r.agency_id === agency ? { ...r, [key]: value || null } : r)));
        setFeedback(null);
    }

    function cancel() {
        if (saved) setForm(toForm(saved));
        setNumbering(savedNumbering);
    }

    async function submit() {
        if (!agencyId || !form) return;
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            const updated = await api.patch<AgencySettings>(`/agencies/${agencyId}/settings`, form);
            setSaved(updated);
            setForm(toForm(updated));
            if (changedCodes.length > 0) {
                const rows = await api.put<NumberingRow[]>('/agency-settings/numbering', {
                    agencies: changedCodes.map((r) => ({ agency_id: r.agency_id, order_number_prefix: r.order_number_prefix, order_number_suffix: r.order_number_suffix })),
                });
                setNumbering(rows);
                setSavedNumbering(rows);
            }
            setFeedback(t('settings.saved'));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    if (!agencyId) {
        return (
            <div className="space-y-6">
                <BackLink />
                <EmptyState icon={Hash} title={t('nav.allAgencies')} description={t('service.availabilityHint')} />
            </div>
        );
    }

    if (loading || !form) {
        return (
            <div className="space-y-6">
                <BackLink />
                <LoadingState />
            </div>
        );
    }

    const preview = `${form.order_number_prefix ?? ''}${String(864).padStart(form.order_number_padding, '0')}${form.order_number_suffix ?? ''}`;

    return (
        <div className="max-w-6xl space-y-6">
            <BackLink />

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">{t('operationalSettings.title')}</h1>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('operationalSettings.subtitle')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={cancel} disabled={!dirty || busy} className={button('ghost', 'md', 'h-10')}>
                        {t('common.cancel')}
                    </button>
                    <button type="button" onClick={() => void submit()} disabled={!dirty || busy} className={button('primary', 'md', 'h-10')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                        {t('common.save')}
                    </button>
                </div>
            </div>

            {dirty && (
                <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-400/20 dark:bg-amber-400/10">
                    <span className="inline-flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                        <CircleAlert aria-hidden="true" className="h-4 w-4" />
                        {t('operationalSettings.unsavedCount', { count: changesCount })}
                    </span>
                    {saved?.updated_at && (
                        <span className="text-amber-800 sm:ml-auto dark:text-amber-300">{t('operationalSettings.lastSaved', { date: dateTime(saved.updated_at) })}</span>
                    )}
                </div>
            )}

            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <SectionCard id="op-numbering" title={t('operationalSettings.numbering.title')} subtitle={t('operationalSettings.numbering.subtitle')}>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <TextField label={t('operationalSettings.numbering.prefix')} value={form.order_number_prefix ?? ''} onChange={(v) => set('order_number_prefix', v || null)} />
                            <TextField label={t('operationalSettings.numbering.suffix')} value={form.order_number_suffix ?? ''} onChange={(v) => set('order_number_suffix', v || null)} />
                            <NumberField
                                label={t('operationalSettings.numbering.padding')}
                                value={form.order_number_padding}
                                min={1}
                                max={10}
                                onChange={(v) => set('order_number_padding', v)}
                            />
                        </div>
                        <p className="text-sm text-ink-600 dark:text-ink-350">
                            {t('operationalSettings.numbering.preview', { preview })}
                        </p>
                        {numbering.length > 1 && (
                            <div className="space-y-2 border-t border-ink-100 pt-4 dark:border-ink-800">
                                <p className="text-xs font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">{t('operationalSettings.numbering.allAgencies')}</p>
                                <div className="max-h-[420px] overflow-auto">
                                    <div className="min-w-[560px] divide-y divide-ink-100 dark:divide-ink-800">
                                        {numbering.map((row) => (
                                            <div key={row.agency_id} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 py-2">
                                                <span className="truncate text-sm font-medium text-ink-900 dark:text-ink-50">{row.agency_name}</span>
                                                <input
                                                    aria-label={`${t('operationalSettings.numbering.prefix')} — ${row.agency_name}`}
                                                    value={row.order_number_prefix ?? ''}
                                                    onChange={(e) => setCode(row.agency_id, 'order_number_prefix', e.target.value)}
                                                    className={cx(inputSm, 'h-9')}
                                                />
                                                <input
                                                    aria-label={`${t('operationalSettings.numbering.suffix')} — ${row.agency_name}`}
                                                    value={row.order_number_suffix ?? ''}
                                                    onChange={(e) => setCode(row.agency_id, 'order_number_suffix', e.target.value)}
                                                    className={cx(inputSm, 'h-9')}
                                                />
                                                <span className="truncate">
                                                    <Pill tone="emerald">
                                                        {`${row.order_number_prefix ?? ''}${String(row.next_number).padStart(row.order_number_padding, '0')}${row.order_number_suffix ?? ''}`}
                                                    </Pill>
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </SectionCard>

                    <SectionCard id="op-delays" title={t('operationalSettings.delays.title')} subtitle={t('operationalSettings.delays.subtitle')}>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <SuffixInput
                                icon={Clock3}
                                label={t('operationalSettings.delays.standard')}
                                value={form.standard_delay_hours ?? 0}
                                min={0}
                                max={720}
                                suffix={t('securitySettings.hours')}
                                onChange={(v) => set('standard_delay_hours', v || null)}
                            />
                            <SuffixInput
                                icon={Clock3}
                                label={t('operationalSettings.delays.express')}
                                value={form.express_delay_hours ?? 0}
                                min={0}
                                max={720}
                                suffix={t('securitySettings.hours')}
                                onChange={(v) => set('express_delay_hours', v || null)}
                            />
                            <SuffixInput
                                icon={Clock3}
                                label={t('operationalSettings.delays.finishing')}
                                value={form.finishing_delay_hours ?? 0}
                                min={0}
                                max={720}
                                suffix={t('securitySettings.hours')}
                                onChange={(v) => set('finishing_delay_hours', v || null)}
                            />
                        </div>
                        <div className="divide-y divide-ink-100 dark:divide-ink-800">
                            <Toggle
                                className="py-3"
                                checked={form.allow_immediate_pickup}
                                onChange={(v) => set('allow_immediate_pickup', v)}
                                label={t('operationalSettings.delays.allowImmediatePickup')}
                                description={t('operationalSettings.delays.allowImmediatePickupHint')}
                            />
                            <Toggle
                                className="py-3"
                                checked={form.block_pickup_if_unpaid}
                                onChange={(v) => set('block_pickup_if_unpaid', v)}
                                label={t('operationalSettings.delays.blockPickupIfUnpaid')}
                                description={t('operationalSettings.delays.blockPickupIfUnpaidHint')}
                            />
                        </div>
                    </SectionCard>

                    <SectionCard id="op-workshop" title={t('operationalSettings.workshop.title')} subtitle={t('operationalSettings.workshop.subtitle')}>
                        <div className="divide-y divide-ink-100 dark:divide-ink-800">
                            <Toggle
                                className="py-3"
                                checked={form.washer_step_enabled}
                                onChange={(v) => set('washer_step_enabled', v)}
                                label={t('operationalSettings.workshop.washerStep')}
                            />
                            <Toggle
                                className="py-3"
                                checked={form.sorter_step_enabled}
                                onChange={(v) => set('sorter_step_enabled', v)}
                                label={t('operationalSettings.workshop.sorterStep')}
                            />
                        </div>
                        <div className="space-y-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-800/60">
                            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-600 dark:text-ink-300">
                                <Workflow aria-hidden="true" className="h-4 w-4 shrink-0" />
                                {t('operationalSettings.workshop.preview')}
                            </p>
                            <ol className="flex flex-wrap gap-2">
                                {[
                                    { key: 'waiting', on: true },
                                    { key: 'washer', on: form.washer_step_enabled, role: true },
                                    { key: 'processing', on: true },
                                    { key: 'treated', on: true },
                                    { key: 'sorter', on: form.sorter_step_enabled, role: true },
                                    { key: 'classified', on: true },
                                ]
                                    .filter((step) => step.on)
                                    .map((step, index) => (
                                        <li
                                            key={step.key}
                                            className={cx(
                                                'rounded-lg border px-3 py-2 text-xs font-semibold',
                                                step.role
                                                    ? 'border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-200'
                                                    : 'border-ink-200 bg-white text-ink-700 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200',
                                            )}
                                        >
                                            {index + 1}. {t(`operationalSettings.workshop.step.${step.key}`)}
                                        </li>
                                    ))}
                            </ol>
                            <p className="text-xs text-ink-500 dark:text-ink-400">{t('operationalSettings.workshop.previewHint')}</p>
                        </div>
                    </SectionCard>

                    <SectionCard id="op-pricing" title={t('operationalSettings.pricing.title')} subtitle={t('operationalSettings.pricing.subtitle')}>
                        <div className="grid gap-4 sm:grid-cols-3">
                            <SuffixInput
                                icon={Banknote}
                                label={t('operationalSettings.pricing.collectionFee')}
                                hint={t('operationalSettings.pricing.collectionFeeHint')}
                                value={form.collection_fee ?? 0}
                                min={0}
                                max={1_000_000}
                                suffix={t('common.currency')}
                                onChange={(v) => set('collection_fee', v || null)}
                            />
                            <SuffixInput
                                icon={Banknote}
                                label={t('operationalSettings.pricing.deliveryFee')}
                                hint={t('operationalSettings.pricing.deliveryFeeHint')}
                                value={form.delivery_fee ?? 0}
                                min={0}
                                max={1_000_000}
                                suffix={t('common.currency')}
                                onChange={(v) => set('delivery_fee', v || null)}
                            />
                            <SuffixInput
                                icon={Banknote}
                                label={t('operationalSettings.pricing.minimumOrderAmount')}
                                value={form.minimum_order_amount ?? 0}
                                min={0}
                                max={1_000_000}
                                suffix={t('common.currency')}
                                onChange={(v) => set('minimum_order_amount', v || null)}
                            />
                        </div>
                    </SectionCard>
                </div>

                <div className="space-y-6">
                    <SectionCard id="op-loyalty" title={t('operationalSettings.loyalty.title')} subtitle={t('operationalSettings.loyalty.subtitle')}>
                        <SuffixInput
                            icon={Wallet}
                            label={t('operationalSettings.loyalty.amountPerPoint')}
                            value={form.loyalty_amount_per_point ?? 0}
                            min={0}
                            max={1_000_000}
                            suffix={t('common.currency')}
                            onChange={(v) => set('loyalty_amount_per_point', v || null)}
                        />
                        <SuffixInput
                            icon={Wallet}
                            label={t('operationalSettings.loyalty.redemptionThreshold')}
                            hint={t('operationalSettings.loyalty.redemptionThresholdHint')}
                            value={form.loyalty_redemption_threshold ?? 0}
                            min={0}
                            max={1_000_000}
                            suffix={t('operationalSettings.loyalty.points')}
                            onChange={(v) => set('loyalty_redemption_threshold', v)}
                        />
                        <Toggle
                            checked={form.loyalty_accrue_on_promotions ?? true}
                            onChange={(v) => set('loyalty_accrue_on_promotions', v)}
                            label={t('operationalSettings.loyalty.accrueOnPromotions')}
                            description={t('operationalSettings.loyalty.accrueOnPromotionsHint')}
                        />
                    </SectionCard>

                    <SectionCard id="op-cashiers" title={t('operationalSettings.cashiers.title')} subtitle={t('operationalSettings.cashiers.subtitle')}>
                        <SuffixInput
                            icon={Wallet}
                            label={t('operationalSettings.cashiers.dailyTarget')}
                            hint={t('operationalSettings.cashiers.dailyTargetHint')}
                            value={form.cashier_daily_target ?? 0}
                            min={0}
                            max={100_000_000}
                            suffix={t('common.currency')}
                            onChange={(v) => set('cashier_daily_target', v || null)}
                        />
                    </SectionCard>

                    <SectionCard id="op-offline" title={t('operationalSettings.offline.title')} subtitle={t('operationalSettings.offline.subtitle')}>
                        <Toggle
                            checked={form.offline_enabled ?? true}
                            onChange={(v) => set('offline_enabled', v)}
                            label={t('operationalSettings.offline.enabled')}
                            description={t('operationalSettings.offline.enabledHint')}
                        />
                        <SuffixInput
                            label={t('operationalSettings.offline.syncInterval')}
                            value={form.offline_sync_interval_minutes ?? 0}
                            min={0}
                            max={1440}
                            suffix={t('securitySettings.minutes')}
                            onChange={(v) => set('offline_sync_interval_minutes', v || null)}
                        />
                        <SuffixInput
                            label={t('operationalSettings.offline.retention')}
                            value={form.offline_retention_days ?? 0}
                            min={0}
                            max={365}
                            suffix={t('securitySettings.days')}
                            onChange={(v) => set('offline_retention_days', v || null)}
                        />
                        <p className="text-xs text-ink-500 dark:text-ink-400">{t('operationalSettings.offline.notWiredHint')}</p>
                    </SectionCard>

                    <section aria-labelledby="op-recent-changes" className={cx(cardPadded, 'space-y-3')}>
                        <div className="flex items-center justify-between gap-2">
                            <h2 id="op-recent-changes" className={sectionTitle}>
                                {t('operationalSettings.recentChanges.title')}
                            </h2>
                            <Link to="/audit-logs" className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                                {t('settingsHub.recentChanges.viewAll')}
                            </Link>
                        </div>
                        {logs.length === 0 ? (
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('settingsHub.recentChanges.none')}</p>
                        ) : (
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {logs.map((log) => (
                                    <li key={log.id} className="space-y-0.5 py-2.5 text-sm">
                                        <div className="flex items-center justify-between gap-2">
                                            <Pill tone="neutral">{auditTypeLabel(log.auditable_type, t)}</Pill>
                                            <span className="text-xs text-ink-500 dark:text-ink-400">{dateTime(log.created_at)}</span>
                                        </div>
                                        <p className="font-medium text-ink-900 dark:text-white">
                                            {auditLogLabel(log, t, (n) => String(n ?? ''))}
                                        </p>
                                        <p className="text-xs text-ink-500 dark:text-ink-400">{log.user?.name ?? t('order.audit.systemActor')}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}

function BackLink() {
    const { t } = useI18n();
    return (
        <Link to="/settings" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('settingsHub.back')}
        </Link>
    );
}

function TextField({ label: fieldLabel, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <label className="block">
            <span className={label}>{fieldLabel}</span>
            <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={cx(inputSm, 'h-10')} />
        </label>
    );
}

function NumberField({
    label: fieldLabel,
    value,
    min,
    max,
    onChange,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    onChange: (value: number) => void;
}) {
    return (
        <label className="block">
            <span className={label}>{fieldLabel}</span>
            <input
                type="number"
                min={min}
                max={max}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className={cx(inputSm, 'h-10')}
            />
        </label>
    );
}

function SuffixInput({
    label: fieldLabel,
    hint,
    value,
    min,
    max,
    suffix,
    onChange,
    icon: Icon,
}: {
    label: string;
    hint?: string;
    value: number;
    min: number;
    max: number;
    suffix: string;
    onChange: (value: number) => void;
    icon?: typeof Clock3;
}) {
    return (
        <label className="block">
            <span className={label}>{fieldLabel}</span>
            {hint && <span className="mb-1.5 block text-xs text-ink-600 dark:text-ink-350">{hint}</span>}
            <span className="relative flex items-center">
                {Icon && <Icon aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-ink-500 dark:text-ink-350" />}
                <input
                    type="number"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className={cx(inputSm, 'h-10 pr-20', Icon && 'pl-9')}
                />
                <span className="pointer-events-none absolute right-3 text-sm text-ink-500 dark:text-ink-400">{suffix}</span>
            </span>
        </label>
    );
}

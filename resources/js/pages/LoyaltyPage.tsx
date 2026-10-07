import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowLeft,
    BadgePercent,
    Check,
    Coins,
    Download,
    Gift,
    Layers,
    Megaphone,
    Pencil,
    Plus,
    Star,
    Tag,
    Users,
    X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import { hasPermission } from '../lib/permissions';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import { ChipToggle, ProgressBar, SectionCard, StatCard } from '../components/ui/Metrics';
import { Pill } from '../components/ui/StatusBadge';
import { Timeline } from '../components/ui/Timeline';
import Pagination from '../components/ui/Pagination';
import Toggle from '../components/ui/Toggle';
import { button, cx, inputSm, label, select, textLink } from '../components/ui/styles';
import type {
    AgencySettings,
    LoyaltyMovement,
    LoyaltySegments,
    LoyaltyStats,
    LoyaltyTier,
    Paginated,
    Promotion,
    PromotionDiscountType,
} from '../types';

/* Écran « Promotions et fidélité » (Figma SPARK PRESSING, section 09, node 72:20021).
 * Audit de conformité mené le 2026-10-07 (voir CLAUDE.md) : volet fidélité renforcé
 * (KPI d'activité réels, règles du programme éditables, historique des mouvements,
 * groupes de fidélité) + volet promotions construit intégralement (modèle, backend,
 * câblage dans le flux de commande). Seuls restent omis le multiplicateur de points
 * appliqué à l'acquisition (point_multiplier existe en base, configuré, mais pas
 * encore lu par LoyaltyService — chantier séparé) et les avantages de palier
 * (benefit_description) en tant que mécanismes réellement appliqués ailleurs dans
 * l'app (texte informatif configuré par l'administrateur, pas un bénéfice simulé). */

export default function LoyaltyPage() {
    const { t } = useI18n();
    const { user, activeAgencyId } = useAuth();
    const { settings } = useSettings();
    const { money } = useFormat();
    const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
    const [agencySettings, setAgencySettings] = useState<AgencySettings | null>(null);
    const [stats, setStats] = useState<LoyaltyStats | null>(null);
    const [movements, setMovements] = useState<LoyaltyMovement[] | null>(null);
    const [segments, setSegments] = useState<LoyaltySegments | null>(null);
    const [activePromotionsCount, setActivePromotionsCount] = useState(0);
    const [promotionsReloadKey, setPromotionsReloadKey] = useState(0);
    const [loading, setLoading] = useState(true);

    function reloadTiers() {
        return api.get<LoyaltyTier[]>('/loyalty-tiers').then(setTiers);
    }

    useEffect(() => {
        Promise.all([
            reloadTiers(),
            api.get<LoyaltyStats>('/loyalty/stats').then(setStats),
            api.get<LoyaltyMovement[]>('/loyalty/movements').then(setMovements),
            api.get<LoyaltySegments>('/loyalty/segments').then(setSegments),
        ]).finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        api.get<Paginated<Promotion>>('/promotions?status=active&per_page=1').then((page) => setActivePromotionsCount(page.total));
    }, [promotionsReloadKey]);

    const agencyId = user?.agency_id ?? activeAgencyId;
    useEffect(() => {
        if (!agencyId) {
            setAgencySettings(null);
            return;
        }
        api.get<AgencySettings>(`/agencies/${agencyId}/settings`)
            .then(setAgencySettings)
            .catch(() => setAgencySettings(null));
    }, [agencyId]);

    const amountPerPoint = agencySettings?.loyalty_amount_per_point ?? settings?.loyalty_amount_per_point ?? 100;

    function exportCsv() {
        if (!stats || !movements) return;
        const rows: string[][] = [
            [t('loyalty.export.section.kpi')],
            [t('loyalty.kpi.activeMembers'), String(stats.members_active)],
            [t('loyalty.kpi.pointsIssued'), String(stats.points_issued)],
            [t('loyalty.kpi.pointsExpired'), String(stats.points_expired)],
            [t('loyalty.kpi.discountsGranted'), String(stats.discounts_granted)],
            [],
            [t('loyalty.export.section.tiers'), t('loyalty.minSpendAmount'), t('loyalty.discountPercent')],
            ...tiers.map((tr) => [tr.name, String(tr.min_spend_amount), String(Math.round(tr.discount_rate * 100))]),
            [],
            [t('loyalty.export.section.movements'), t('loyalty.export.points'), t('loyalty.export.date')],
            ...movements.map((m) => [m.client_name, String(m.points), m.created_at]),
        ];
        const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';')).join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `fidelite-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="space-y-6">
            {hasPermission(user, 'agencies.manage') && (
                <Link to="/settings" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    {t('settingsHub.back')}
                </Link>
            )}
            <PageHeader
                title={t('loyalty.title')}
                subtitle={t('loyalty.subtitle')}
                icon={Gift}
                actions={
                    <button type="button" onClick={exportCsv} disabled={!stats || !movements} className={button('secondary', 'md')}>
                        <Download aria-hidden="true" className="h-4 w-4" />
                        {t('loyalty.export.button')}
                    </button>
                }
            />

            {loading ? (
                <LoadingState />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-5">
                        <StatCard label={t('loyalty.kpi.activeMembers')} value={stats?.members_active ?? 0} icon={Users} tone="brand" />
                        <StatCard label={t('loyalty.kpi.pointsIssued')} value={(stats?.points_issued ?? 0).toLocaleString('fr-FR')} icon={Coins} tone="accent" />
                        <StatCard
                            label={t('loyalty.kpi.pointsExpired')}
                            value={(stats?.points_expired ?? 0).toLocaleString('fr-FR')}
                            icon={Layers}
                            tone="amber"
                            hint={t('loyalty.kpi.pointsExpiredHint')}
                        />
                        <StatCard label={t('loyalty.kpi.discountsGranted')} value={money(stats?.discounts_granted ?? 0)} icon={BadgePercent} tone="emerald" />
                        <StatCard
                            label={t('loyalty.kpi.activeCampaigns')}
                            value={activePromotionsCount}
                            icon={Megaphone}
                            tone="violet"
                        />
                    </div>

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                        <div className="space-y-6">
                            <RulesCard agencyId={agencyId} agencySettings={agencySettings} onSaved={setAgencySettings} />
                            <TiersPanel tiers={tiers} onChanged={reloadTiers} amountPerPoint={amountPerPoint} />
                        </div>
                        <PromotionCreateForm onCreated={() => setPromotionsReloadKey((k) => k + 1)} />
                    </div>

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                        <SectionCard id="loyalty-movements-heading" title={t('loyalty.movements.title')} subtitle={t('loyalty.movements.subtitle')}>
                            {movements && movements.length > 0 ? (
                                <Timeline
                                    entries={movements.map((m) => ({
                                        id: m.id,
                                        label: `${m.client_name} — ${m.points > 0 ? '+' : ''}${m.points} pts`,
                                        detail: t(`loyalty.movements.reason.${m.reason}`),
                                        at: m.created_at,
                                    }))}
                                    emptyLabel={t('loyalty.movements.empty')}
                                />
                            ) : (
                                <EmptyState compact icon={Coins} title={t('loyalty.movements.empty')} />
                            )}
                        </SectionCard>

                        <SectionCard id="loyalty-segments-heading" title={t('loyalty.segments.title')} subtitle={t('loyalty.segments.subtitle')}>
                            {segments ? (
                                <div className="space-y-4">
                                    <SegmentRow label={t('loyalty.segments.topTier')} count={segments.top_tier_members} max={stats?.members_active ?? 0} barClassName="bg-amber-500 dark:bg-amber-400" />
                                    <SegmentRow label={t('loyalty.segments.reactivation')} count={segments.reactivation_90d} max={stats?.members_active ?? 0} barClassName="bg-orange-500 dark:bg-orange-400" />
                                    <SegmentRow label={t('loyalty.segments.nearReward')} count={segments.near_reward} max={stats?.members_active ?? 0} barClassName="bg-sky-500 dark:bg-sky-400" />
                                    <SegmentRow label={t('loyalty.segments.newMembers')} count={segments.new_members_30d} max={stats?.members_active ?? 0} barClassName="bg-emerald-500 dark:bg-emerald-400" />
                                </div>
                            ) : (
                                <LoadingState />
                            )}
                        </SectionCard>
                    </div>

                    <PromotionsTable reloadKey={promotionsReloadKey} />
                </>
            )}
        </div>
    );
}

function SegmentRow({ label: segLabel, count, max, barClassName }: { label: string; count: number; max: number; barClassName: string }) {
    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                <span className="font-medium text-ink-800 dark:text-ink-100">{segLabel}</span>
                <span className="tabular-nums text-ink-500 dark:text-ink-400">{count}</span>
            </div>
            <ProgressBar value={count} max={Math.max(max, 1)} barClassName={barClassName} />
        </div>
    );
}

/* « Règles du programme » (Figma) : regroupe ici les 3 réglages de fidélité par
 * agence qui existent déjà côté backend (`agency_settings`) mais étaient jusqu'ici
 * répartis entre /settings/operational (taux de gain, seuil) et nulle part du tout
 * (expiration, mécanisme pourtant réellement fonctionnel — commande `loyalty:
 * expire-points`, voir CLAUDE.md). Même endpoint PATCH que /settings/operational :
 * éditer ici ou là reste cohérent, une seule source de vérité. */
function RulesCard({
    agencyId,
    agencySettings,
    onSaved,
}: {
    agencyId: number | null | undefined;
    agencySettings: AgencySettings | null;
    onSaved: (settings: AgencySettings) => void;
}) {
    const { t } = useI18n();
    const { money } = useFormat();
    const [amountPerPoint, setAmountPerPoint] = useState('');
    const [pointValue, setPointValue] = useState('');
    const [redemptionThreshold, setRedemptionThreshold] = useState('');
    const [expiryMonths, setExpiryMonths] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        if (!agencySettings) return;
        setAmountPerPoint(agencySettings.loyalty_amount_per_point !== null ? String(agencySettings.loyalty_amount_per_point) : '');
        setPointValue(agencySettings.loyalty_point_value_fcfa !== null ? String(agencySettings.loyalty_point_value_fcfa) : '');
        setRedemptionThreshold(agencySettings.loyalty_redemption_threshold !== null ? String(agencySettings.loyalty_redemption_threshold) : '');
        setExpiryMonths(agencySettings.loyalty_point_expiry_months !== null ? String(agencySettings.loyalty_point_expiry_months) : '');
    }, [agencySettings]);

    async function save() {
        if (!agencyId) return;
        setBusy(true);
        setError(null);
        setSaved(false);
        try {
            const updated = await api.patch<AgencySettings>(`/agencies/${agencyId}/settings`, {
                loyalty_amount_per_point: amountPerPoint ? Number(amountPerPoint) : null,
                loyalty_point_value_fcfa: pointValue ? Number(pointValue) : null,
                loyalty_redemption_threshold: redemptionThreshold ? Number(redemptionThreshold) : null,
                loyalty_point_expiry_months: expiryMonths ? Number(expiryMonths) : null,
            });
            onSaved(updated);
            setSaved(true);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const conversion =
        pointValue && redemptionThreshold
            ? t('loyalty.rules.conversionValue', {
                  points: redemptionThreshold,
                  amount: money(Number(redemptionThreshold) * Number(pointValue)),
              })
            : null;

    if (!agencyId) {
        return (
            <SectionCard id="loyalty-rules-heading" title={t('loyalty.rules.title')} subtitle={t('loyalty.rules.subtitle')}>
                <EmptyState compact icon={Coins} title={t('loyalty.rules.noAgency')} />
            </SectionCard>
        );
    }

    return (
        <SectionCard
            id="loyalty-rules-heading"
            title={t('loyalty.rules.title')}
            subtitle={t('loyalty.rules.subtitle')}
            headerExtra={<Pill tone="emerald">{t('loyalty.active')}</Pill>}
        >
            {error && <Alert tone="error">{error}</Alert>}
            {saved && !error && <Alert tone="success">{t('loyalty.rules.saved')}</Alert>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                    <span className={label}>{t('loyalty.rules.earnRate')}</span>
                    <input type="number" min={1} value={amountPerPoint} onChange={(e) => setAmountPerPoint(e.target.value)} className={inputSm} placeholder="100" />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.rules.pointValue')}</span>
                    <input type="number" min={1} value={pointValue} onChange={(e) => setPointValue(e.target.value)} className={inputSm} placeholder="5" />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.rules.redemptionThreshold')}</span>
                    <input type="number" min={0} value={redemptionThreshold} onChange={(e) => setRedemptionThreshold(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.rules.expiry')}</span>
                    <input type="number" min={1} max={120} value={expiryMonths} onChange={(e) => setExpiryMonths(e.target.value)} className={inputSm} placeholder={t('loyalty.rules.expiryNever')} />
                </label>
            </div>
            {conversion && <p className="text-xs text-ink-500 dark:text-ink-400">{conversion}</p>}
            <button type="button" onClick={() => void save()} disabled={busy} className={button('primary', 'sm')}>
                {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                {t('loyalty.rules.save')}
            </button>
        </SectionCard>
    );
}

function TiersPanel({ tiers, onChanged, amountPerPoint }: { tiers: LoyaltyTier[]; onChanged: () => void; amountPerPoint: number }) {
    const { t } = useI18n();
    const { money } = useFormat();
    const [editing, setEditing] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function toggleActive(tier: LoyaltyTier) {
        setError(null);
        try {
            await api.patch(`/loyalty-tiers/${tier.id}`, { is_active: !tier.is_active });
            onChanged();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    return (
        <SectionCard
            id="loyalty-tiers-heading"
            title={t('loyalty.tiers')}
            subtitle={t('loyalty.tiersHint')}
            headerExtra={
                !creating && (
                    <button type="button" onClick={() => setCreating(true)} className={button('ghost', 'sm')}>
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        {t('loyalty.newTier')}
                    </button>
                )
            }
        >
            {error && <Alert tone="error">{error}</Alert>}
            {creating && (
                <CreateTierForm
                    amountPerPoint={amountPerPoint}
                    onCreated={() => {
                        setCreating(false);
                        onChanged();
                    }}
                    onCancel={() => setCreating(false)}
                />
            )}
            {tiers.length === 0 ? (
                <EmptyState compact icon={Star} title={t('loyalty.noTiers')} />
            ) : (
                <ul className="-mx-2 divide-y divide-ink-100 dark:divide-ink-800">
                    {tiers.map((tier) =>
                        editing === tier.id ? (
                            <li key={tier.id} className="px-2 py-3">
                                <EditTierRow
                                    tier={tier}
                                    onCancel={() => setEditing(null)}
                                    onSaved={() => {
                                        setEditing(null);
                                        onChanged();
                                    }}
                                />
                            </li>
                        ) : (
                            <li key={tier.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-3 sm:flex-nowrap">
                                <span
                                    aria-hidden="true"
                                    className={cx(
                                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold',
                                        tier.is_active ? 'bg-accent-100 text-accent-800 dark:bg-accent-400/15 dark:text-accent-300' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
                                    )}
                                >
                                    {tier.name.charAt(0).toUpperCase()}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{tier.name}</p>
                                    <p className="text-xs text-ink-600 dark:text-ink-350">
                                        {t('loyalty.fromAmount', { amount: money(tier.min_spend_amount) })}
                                        {tier.benefit_description ? ` · ${tier.benefit_description}` : ''}
                                    </p>
                                </div>
                                <span className="shrink-0 font-display text-sm font-bold tabular-nums text-ink-900 dark:text-white">
                                    {t('loyalty.discountValue', { rate: Math.round(tier.discount_rate * 100) })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => void toggleActive(tier)}
                                    aria-pressed={tier.is_active}
                                    title={tier.is_active ? t('loyalty.deactivate') : t('loyalty.activate')}
                                    className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
                                >
                                    <Pill tone={tier.is_active ? 'emerald' : 'neutral'}>{tier.is_active ? t('loyalty.active') : t('loyalty.inactive')}</Pill>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditing(tier.id)}
                                    className={button('ghost', 'sm', 'h-8 px-2')}
                                    aria-label={t('loyalty.editTier', { name: tier.name })}
                                >
                                    <Pencil aria-hidden="true" className="h-4 w-4" />
                                </button>
                            </li>
                        ),
                    )}
                </ul>
            )}
        </SectionCard>
    );
}

function EditTierRow({ tier, onCancel, onSaved }: { tier: LoyaltyTier; onCancel: () => void; onSaved: () => void }) {
    const { t } = useI18n();
    const [name, setName] = useState(tier.name);
    const [minSpendAmount, setMinSpendAmount] = useState(String(tier.min_spend_amount));
    const [discount, setDiscount] = useState(String(Math.round(tier.discount_rate * 1000) / 10));
    const [pointMultiplier, setPointMultiplier] = useState(String(tier.point_multiplier));
    const [benefitDescription, setBenefitDescription] = useState(tier.benefit_description ?? '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/loyalty-tiers/${tier.id}`, {
                name,
                min_spend_amount: Number(minSpendAmount),
                discount_rate: Number(discount) / 100,
                point_multiplier: Number(pointMultiplier),
                benefit_description: benefitDescription.trim() || null,
            });
            onSaved();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                    <span className={label}>{t('loyalty.tierName')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.minSpendAmount')}</span>
                    <input type="number" min={0} value={minSpendAmount} onChange={(e) => setMinSpendAmount(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.discountPercent')}</span>
                    <input type="number" min={0} max={100} step="0.5" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.pointMultiplier')}</span>
                    <input type="number" min={1} max={9.99} step="0.05" value={pointMultiplier} onChange={(e) => setPointMultiplier(e.target.value)} className={inputSm} />
                </label>
                <label className="block sm:col-span-2">
                    <span className={label}>{t('loyalty.benefitDescription')}</span>
                    <input value={benefitDescription} onChange={(e) => setBenefitDescription(e.target.value)} className={inputSm} placeholder={t('loyalty.benefitDescriptionPlaceholder')} />
                </label>
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className={button('ghost', 'sm')}>
                    <X aria-hidden="true" className="h-4 w-4" />
                    {t('common.cancel')}
                </button>
                <button type="button" onClick={() => void save()} disabled={busy || name.trim() === '' || minSpendAmount === '' || discount === ''} className={button('primary', 'sm')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                    {t('common.save')}
                </button>
            </div>
        </div>
    );
}

function CreateTierForm({ onCreated, onCancel, amountPerPoint }: { onCreated: () => void; onCancel: () => void; amountPerPoint: number }) {
    const { t } = useI18n();
    const { money } = useFormat();
    const [name, setName] = useState('');
    const [minSpendAmount, setMinSpendAmount] = useState('');
    const [discountPercent, setDiscountPercent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function createTier() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/loyalty-tiers', {
                name,
                min_spend_amount: Number(minSpendAmount),
                discount_rate: Number(discountPercent) / 100,
            });
            setName('');
            setMinSpendAmount('');
            setDiscountPercent('');
            onCreated();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name.trim() !== '' && minSpendAmount !== '' && discountPercent !== '';

    return (
        <div className="mb-4 space-y-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
            {error && <Alert tone="error">{error}</Alert>}
            <p className="text-xs text-ink-500 dark:text-ink-400">{t('loyalty.hint', { amount: money(amountPerPoint) })}</p>
            <label className="block">
                <span className={label}>{t('loyalty.tierName')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputSm} />
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className={label}>{t('loyalty.minSpendAmount')}</span>
                    <input type="number" min={0} value={minSpendAmount} onChange={(e) => setMinSpendAmount(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.discountPercent')}</span>
                    <input type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} className={inputSm} />
                </label>
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className={button('ghost', 'sm')}>
                    {t('common.cancel')}
                </button>
                <button type="button" onClick={() => void createTier()} disabled={!canSubmit || busy} className={button('primary', 'sm')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                    {t('common.create')}
                </button>
            </div>
        </div>
    );
}

/* « Créer une promotion » (Figma) : brouillon par défaut (is_active=false),
 * « Valider et publier » l'active immédiatement si sa période a déjà commencé. */
function PromotionCreateForm({ onCreated }: { onCreated: () => void }) {
    const { t } = useI18n();
    const { agencies } = useAuth();
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [discountType, setDiscountType] = useState<PromotionDiscountType>('percentage');
    const [discountValue, setDiscountValue] = useState('');
    const [startsAt, setStartsAt] = useState(() => new Date().toISOString().slice(0, 10));
    const [endsAt, setEndsAt] = useState('');
    const [quotaTotal, setQuotaTotal] = useState('');
    const [quotaPerClient, setQuotaPerClient] = useState('');
    const [minimumOrderAmount, setMinimumOrderAmount] = useState('');
    const [agencyIds, setAgencyIds] = useState<number[]>([]);
    const [combinable, setCombinable] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<'draft' | 'publish' | null>(null);

    function toggleAgency(id: number) {
        setAgencyIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
    }

    async function submit(publish: boolean) {
        setBusy(publish ? 'publish' : 'draft');
        setError(null);
        try {
            await api.post('/promotions', {
                name,
                code: code.toUpperCase(),
                discount_type: discountType,
                discount_value: Number(discountValue),
                starts_at: startsAt,
                ends_at: endsAt,
                quota_total: quotaTotal ? Number(quotaTotal) : null,
                quota_per_client: quotaPerClient ? Number(quotaPerClient) : null,
                minimum_order_amount: minimumOrderAmount ? Number(minimumOrderAmount) : null,
                combinable_with_loyalty: combinable,
                agency_ids: agencyIds,
                is_active: publish,
            });
            setName('');
            setCode('');
            setDiscountValue('');
            setEndsAt('');
            setQuotaTotal('');
            setQuotaPerClient('');
            setMinimumOrderAmount('');
            setAgencyIds([]);
            setCombinable(false);
            onCreated();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(null);
        }
    }

    const canSubmit = name.trim() !== '' && code.trim() !== '' && discountValue !== '' && startsAt !== '' && endsAt !== '';

    return (
        <SectionCard id="promotion-create-heading" title={t('promotion.create.title')} subtitle={t('promotion.create.subtitle')} headerExtra={<Pill tone="neutral">{t('promotion.status.draft')}</Pill>}>
            {error && <Alert tone="error">{error}</Alert>}
            <label className="block">
                <span className={label}>{t('promotion.create.name')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputSm} />
            </label>
            <label className="block">
                <span className={label}>{t('promotion.create.code')}</span>
                <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className={cx(inputSm, 'font-mono')} maxLength={30} />
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className={label}>{t('promotion.create.type')}</span>
                    <select value={discountType} onChange={(e) => setDiscountType(e.target.value as PromotionDiscountType)} className={select}>
                        <option value="percentage">{t('promotion.type.percentage')}</option>
                        <option value="fixed">{t('promotion.type.fixed')}</option>
                    </select>
                </label>
                <label className="block">
                    <span className={label}>{t('promotion.create.discount')}</span>
                    <input type="number" min={1} value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('promotion.create.startsAt')}</span>
                    <input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('promotion.create.endsAt')}</span>
                    <input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('promotion.create.quotaTotal')}</span>
                    <input type="number" min={1} value={quotaTotal} onChange={(e) => setQuotaTotal(e.target.value)} className={inputSm} placeholder={t('promotion.create.unlimited')} />
                </label>
                <label className="block">
                    <span className={label}>{t('promotion.create.quotaPerClient')}</span>
                    <input type="number" min={1} value={quotaPerClient} onChange={(e) => setQuotaPerClient(e.target.value)} className={inputSm} placeholder={t('promotion.create.unlimited')} />
                </label>
            </div>
            {agencies.length > 0 && (
                <div>
                    <span className={label}>{t('promotion.create.agencies')}</span>
                    <div className="flex flex-wrap gap-2">
                        {agencies.map((a) => (
                            <ChipToggle key={a.id} active={agencyIds.includes(a.id)} onClick={() => toggleAgency(a.id)}>
                                {a.name}
                            </ChipToggle>
                        ))}
                    </div>
                    <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{agencyIds.length === 0 ? t('promotion.create.allAgencies') : null}</p>
                </div>
            )}
            <label className="block">
                <span className={label}>{t('promotion.create.minimumOrderAmount')}</span>
                <input type="number" min={0} value={minimumOrderAmount} onChange={(e) => setMinimumOrderAmount(e.target.value)} className={inputSm} />
            </label>
            <Toggle checked={combinable} onChange={setCombinable} label={t('promotion.create.combinable')} description={t('promotion.create.combinableHint')} />
            <div className="flex flex-wrap justify-end gap-2 pt-1">
                <button type="button" onClick={() => void submit(false)} disabled={!canSubmit || busy !== null} className={button('ghost', 'sm')}>
                    {busy === 'draft' ? <Spinner className="h-4 w-4" /> : null}
                    {t('promotion.create.saveDraft')}
                </button>
                <button type="button" onClick={() => void submit(true)} disabled={!canSubmit || busy !== null} className={button('primary', 'sm')}>
                    {busy === 'publish' ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                    {t('promotion.create.publish')}
                </button>
            </div>
        </SectionCard>
    );
}

const PROMOTION_STATUS_TONE: Record<string, 'neutral' | 'sky' | 'emerald' | 'rose'> = {
    draft: 'neutral',
    scheduled: 'sky',
    active: 'emerald',
    ended: 'rose',
};

function PromotionsTable({ reloadKey }: { reloadKey: number }) {
    const { t } = useI18n();
    const { money, date } = useFormat();
    const [page, setPage] = useState<Paginated<Promotion> | null>(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [status, setStatus] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams({ page: String(pageNumber) });
        if (status) params.set('status', status);
        api.get<Paginated<Promotion>>(`/promotions?${params}`).then(setPage).finally(() => setLoading(false));
    }, [pageNumber, status, reloadKey]);

    return (
        <SectionCard
            id="promotions-table-heading"
            title={t('promotion.table.title')}
            subtitle={t('promotion.table.subtitle')}
            flush
            headerExtra={
                <div className="flex flex-wrap gap-2 px-5 sm:px-0">
                    {(['active', 'scheduled', 'draft', 'ended'] as const).map((s) => (
                        <ChipToggle
                            key={s}
                            active={status === s}
                            onClick={() => {
                                setStatus((current) => (current === s ? null : s));
                                setPageNumber(1);
                            }}
                        >
                            {t(`promotion.status.${s}`)}
                        </ChipToggle>
                    ))}
                </div>
            }
        >
            {loading ? (
                <div className="p-5">
                    <LoadingState />
                </div>
            ) : !page || page.data.length === 0 ? (
                <div className="p-5">
                    <EmptyState compact icon={Tag} title={t('promotion.table.empty')} />
                </div>
            ) : (
                <>
                    <div className="overflow-x-auto px-5 sm:px-6">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
                                    <th className="py-2 pr-4 font-semibold">{t('promotion.table.code')}</th>
                                    <th className="py-2 pr-4 font-semibold">{t('promotion.table.discount')}</th>
                                    <th className="py-2 pr-4 font-semibold">{t('promotion.table.period')}</th>
                                    <th className="py-2 pr-4 font-semibold">{t('promotion.table.quota')}</th>
                                    <th className="py-2 pr-4 font-semibold">{t('promotion.table.usage')}</th>
                                    <th className="py-2 pr-4 font-semibold">{t('promotion.table.agencies')}</th>
                                    <th className="py-2 pr-4 font-semibold">{t('promotion.table.status')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                {page.data.map((promo) => (
                                    <tr key={promo.id}>
                                        <td className="py-3 pr-4 font-mono font-semibold text-ink-900 dark:text-white">{promo.code}</td>
                                        <td className="py-3 pr-4 tabular-nums">{promo.discount_type === 'percentage' ? `${promo.discount_value} %` : money(promo.discount_value)}</td>
                                        <td className="py-3 pr-4 whitespace-nowrap text-ink-600 dark:text-ink-350">
                                            {date(promo.starts_at)} – {date(promo.ends_at)}
                                        </td>
                                        <td className="py-3 pr-4 tabular-nums">{promo.quota_total ?? t('promotion.table.unlimited')}</td>
                                        <td className="py-3 pr-4 tabular-nums">
                                            {promo.usages_count}
                                            {promo.quota_total ? ` / ${promo.quota_total}` : ''}
                                        </td>
                                        <td className="py-3 pr-4 text-ink-600 dark:text-ink-350">{promo.agencies.length === 0 ? t('promotion.table.allAgencies') : promo.agencies.map((a) => a.name).join(', ')}</td>
                                        <td className="py-3 pr-4">
                                            <Pill tone={PROMOTION_STATUS_TONE[promo.status]}>{t(`promotion.status.${promo.status}`)}</Pill>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <Pagination meta={page} onPageChange={setPageNumber} />
                </>
            )}
        </SectionCard>
    );
}

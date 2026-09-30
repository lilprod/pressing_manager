import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BadgePercent, Check, Coins, Gift, Layers, Pencil, Plus, Star, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import { hasPermission } from '../lib/permissions';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import { SectionCard, StatCard } from '../components/ui/Metrics';
import { Pill } from '../components/ui/StatusBadge';
import { button, cx, input, inputSm, label, textLink } from '../components/ui/styles';
import type { LoyaltyTier } from '../types';

/* Écran « Promotions et fidélité » (Figma SPARK PRESSING, section 09, node 72:20021).
 * Seule la partie fidélité existe côté backend (paliers de points + remise automatique,
 * points crédités à chaque paiement). Tout le volet promotions (codes promo, quotas,
 * périodes, utilisation), les indicateurs membres/points, l'activité fidélité et la
 * répartition des membres par palier sont omis — voir CLAUDE.md §2. */

export default function LoyaltyPage() {
    const { t } = useI18n();
    const { user } = useAuth();
    const { settings } = useSettings();
    const { money } = useFormat();
    const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
    const [loading, setLoading] = useState(true);

    function reload() {
        api.get<LoyaltyTier[]>('/loyalty-tiers')
            .then(setTiers)
            .finally(() => setLoading(false));
    }

    useEffect(reload, []);

    const active = tiers.filter((tier) => tier.is_active);
    const maxDiscount = active.reduce((max, tier) => Math.max(max, tier.discount_rate), 0);
    const amountPerPoint = settings?.loyalty_amount_per_point ?? 100;

    return (
        <div className="space-y-6">
            {hasPermission(user, 'agencies.manage') && (
                <Link to="/settings" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    {t('settingsHub.back')}
                </Link>
            )}
            <PageHeader title={t('loyalty.title')} subtitle={t('loyalty.subtitle')} icon={Gift} />

            {loading ? (
                <LoadingState />
            ) : (
                <>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <StatCard label={t('loyalty.kpi.activeTiers')} value={`${active.length}/${tiers.length}`} icon={Layers} tone="brand" />
                        <StatCard label={t('loyalty.kpi.maxDiscount')} value={`-${Math.round(maxDiscount * 100)} %`} icon={BadgePercent} tone="accent" />
                        <StatCard
                            label={t('loyalty.kpi.rule')}
                            value={t('loyalty.kpi.ruleValue', { amount: money(amountPerPoint) })}
                            icon={Coins}
                            tone="emerald"
                            hint={t('loyalty.kpi.ruleHint')}
                        />
                    </div>

                    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                        <TiersPanel tiers={tiers} onChanged={reload} />
                        <CreateTierForm onCreated={reload} amountPerPoint={amountPerPoint} />
                    </div>
                </>
            )}
        </div>
    );
}

function TiersPanel({ tiers, onChanged }: { tiers: LoyaltyTier[]; onChanged: () => void }) {
    const { t } = useI18n();
    const [editing, setEditing] = useState<number | null>(null);
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
        <SectionCard id="loyalty-tiers-heading" title={t('loyalty.tiers')} subtitle={t('loyalty.tiersHint')}>
            {error && <Alert tone="error">{error}</Alert>}
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
                                    <p className="text-xs text-ink-600 dark:text-ink-350">{t('loyalty.fromPoints', { count: tier.min_points })}</p>
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
    const [minPoints, setMinPoints] = useState(String(tier.min_points));
    const [discount, setDiscount] = useState(String(Math.round(tier.discount_rate * 1000) / 10));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/loyalty-tiers/${tier.id}`, { name, min_points: Number(minPoints), discount_rate: Number(discount) / 100 });
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
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <label className="block">
                    <span className={label}>{t('loyalty.tierName')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.minPoints')}</span>
                    <input type="number" min={0} value={minPoints} onChange={(e) => setMinPoints(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.discountPercent')}</span>
                    <input type="number" min={0} max={100} step="0.5" value={discount} onChange={(e) => setDiscount(e.target.value)} className={inputSm} />
                </label>
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className={button('ghost', 'sm')}>
                    <X aria-hidden="true" className="h-4 w-4" />
                    {t('common.cancel')}
                </button>
                <button type="button" onClick={() => void save()} disabled={busy || name.trim() === '' || minPoints === '' || discount === ''} className={button('primary', 'sm')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                    {t('common.save')}
                </button>
            </div>
        </div>
    );
}

function CreateTierForm({ onCreated, amountPerPoint }: { onCreated: () => void; amountPerPoint: number }) {
    const { t } = useI18n();
    const { money } = useFormat();
    const [name, setName] = useState('');
    const [minPoints, setMinPoints] = useState('');
    const [discountPercent, setDiscountPercent] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function createTier() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/loyalty-tiers', {
                name,
                min_points: Number(minPoints),
                discount_rate: Number(discountPercent) / 100,
            });
            setName('');
            setMinPoints('');
            setDiscountPercent('');
            onCreated();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name.trim() !== '' && minPoints !== '' && discountPercent !== '';

    return (
        <SectionCard id="loyalty-create-heading" title={t('loyalty.newTier')} subtitle={t('loyalty.hint', { amount: money(amountPerPoint) })}>
            {error && <Alert tone="error">{error}</Alert>}
            <label className="block">
                <span className={label}>{t('loyalty.tierName')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </label>
            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className={label}>{t('loyalty.minPoints')}</span>
                    <input type="number" min={0} value={minPoints} onChange={(e) => setMinPoints(e.target.value)} className={input} />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.discountPercent')}</span>
                    <input type="number" min={0} max={100} value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} className={input} />
                </label>
            </div>
            <button type="button" onClick={() => void createTier()} disabled={!canSubmit || busy} className={button('primary', 'md', 'w-full')}>
                {busy ? <Spinner className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                {t('common.create')}
            </button>
        </SectionCard>
    );
}

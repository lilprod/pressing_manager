import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import { Pill } from '../components/ui/StatusBadge';
import { button, card, cardPadded, cx, input, inputSm, label, sectionTitle } from '../components/ui/styles';
import { Award, Plus, Star } from 'lucide-react';
import type { LoyaltyTier } from '../types';

export default function LoyaltyPage() {
    const { t } = useI18n();
    const [tiers, setTiers] = useState<LoyaltyTier[]>([]);
    const [loading, setLoading] = useState(true);

    function reload() {
        setLoading(true);
        api
            .get<LoyaltyTier[]>('/loyalty-tiers')
            .then(setTiers)
            .finally(() => setLoading(false));
    }

    useEffect(reload, []);

    return (
        <div className="space-y-6">
            <PageHeader title={t('loyalty.title')} subtitle={t('loyalty.subtitle')} icon={Award} />

            {loading ? (
                <LoadingState />
            ) : (
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                    <TiersPanel tiers={tiers} onChanged={reload} />
                    <CreateTierForm onCreated={reload} />
                </div>
            )}
        </div>
    );
}

function TiersPanel({ tiers, onChanged }: { tiers: LoyaltyTier[]; onChanged: () => void }) {
    const { t } = useI18n();

    async function toggleActive(tier: LoyaltyTier) {
        await api.patch(`/loyalty-tiers/${tier.id}`, { is_active: !tier.is_active });
        onChanged();
    }

    return (
        <section aria-labelledby="loyalty-tiers-heading" className={cx(card, 'overflow-hidden')}>
            <h2 id="loyalty-tiers-heading" className={cx(sectionTitle, 'flex items-center gap-2 px-5 pb-3 pt-5')}>
                <Star aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('loyalty.tiers')}
            </h2>

            {tiers.length === 0 ? (
                <EmptyState compact icon={Star} title={t('loyalty.noTiers')} />
            ) : (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                    {tiers.map((tier) => (
                        <li key={tier.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{tier.name}</p>
                                <p className="text-xs text-ink-600 dark:text-ink-350">
                                    {t('loyalty.fromPoints', { count: tier.min_points })} · -{Math.round(tier.discount_rate * 100)}%
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => void toggleActive(tier)}
                                className="shrink-0"
                                aria-pressed={tier.is_active}
                            >
                                <Pill tone={tier.is_active ? 'brand' : 'neutral'}>{tier.is_active ? t('loyalty.active') : t('loyalty.inactive')}</Pill>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function CreateTierForm({ onCreated }: { onCreated: () => void }) {
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
        <section aria-labelledby="loyalty-create-heading" className={cx(cardPadded, 'space-y-4')}>
            <h2 id="loyalty-create-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                <Plus aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('loyalty.newTier')}
            </h2>

            <p className="text-xs text-ink-600 dark:text-ink-350">{t('loyalty.hint', { amount: money(100) })}</p>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="space-y-3">
                <label className="block">
                    <span className={label}>{t('loyalty.tierName')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.minPoints')}</span>
                    <input type="number" min={0} value={minPoints} onChange={(e) => setMinPoints(e.target.value)} className={cx(inputSm, 'w-full')} />
                </label>
                <label className="block">
                    <span className={label}>{t('loyalty.discountPercent')}</span>
                    <input
                        type="number"
                        min={0}
                        max={100}
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(e.target.value)}
                        className={cx(inputSm, 'w-full')}
                    />
                </label>
                <button type="button" onClick={() => void createTier()} disabled={!canSubmit || busy} className={button('primary', 'md', 'w-full')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                    {t('common.create')}
                </button>
            </div>
        </section>
    );
}

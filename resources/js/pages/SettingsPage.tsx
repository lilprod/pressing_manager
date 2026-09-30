import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    Bell,
    Building2,
    Crown,
    Gift,
    KeyRound,
    LockKeyhole,
    Palette,
    Search,
    Settings as SettingsIcon,
    ShieldCheck,
    Shirt,
    Truck,
    Users,
    type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { brandingChecklist } from '../lib/brandingChecklist';
import { useFormat } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import PageHeader from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/Feedback';
import { ChipToggle, ProgressBar } from '../components/ui/Metrics';
import { Pill, TONES, type Tone } from '../components/ui/StatusBadge';
import { card, cardInteractive, cardPadded, cx, input, sectionTitle } from '../components/ui/styles';

/* Hub « Paramètres » (Figma SPARK PRESSING, section 09, node 25:12184) : recherche,
 * état de configuration et cartes de catégories menant aux écrans de réglage.
 * Seules les catégories qui ont un écran réel sont listées ; celles de la maquette sans
 * backend (agences, numérotation, horaires, promotions, workflow atelier, devise,
 * paiements, mode hors ligne) et le journal « Dernières modifications » sont omis —
 * voir CLAUDE.md §2. */

type GroupKey = 'organisation' | 'customers' | 'brand';

interface Category {
    key: string;
    group: GroupKey;
    to: string;
    icon: LucideIcon;
    title: string;
    detail: string;
    status?: { tone: Tone; label: string };
    updatedAt?: string | null;
    allowed: boolean;
}

export default function SettingsPage() {
    const { t } = useI18n();
    const { user } = useAuth();
    const { settings } = useSettings();
    const { date } = useFormat();
    const [query, setQuery] = useState('');
    const [group, setGroup] = useState<GroupKey | 'all'>('all');

    const checklist = brandingChecklist(settings);
    const done = checklist.filter((item) => item.done).length;
    const brandingComplete = done === checklist.length;
    const expiry = settings?.password_expiry_days;

    const categories: Category[] = [
        {
            key: 'agencies',
            group: 'organisation',
            to: '/agencies',
            icon: Building2,
            title: t('agency.title'),
            detail: t('settingsHub.card.agencies'),
            allowed: hasPermission(user, 'agencies.manage'),
        },
        {
            key: 'users',
            group: 'organisation',
            to: '/users',
            icon: Users,
            title: t('users.title'),
            detail: t('settingsHub.card.users'),
            allowed: hasPermission(user, 'users.manage'),
        },
        {
            key: 'roles',
            group: 'organisation',
            to: '/roles-permissions',
            icon: ShieldCheck,
            title: t('rbac.title'),
            detail: t('settingsHub.card.roles'),
            allowed: hasPermission(user, 'users.manage'),
        },
        {
            key: 'services',
            group: 'organisation',
            to: '/services',
            icon: Shirt,
            title: t('nav.services'),
            detail: t('settingsHub.card.services'),
            allowed: hasPermission(user, 'services.manage'),
        },
        {
            key: 'deliveries',
            group: 'organisation',
            to: '/deliveries',
            icon: Truck,
            title: t('nav.deliveries'),
            detail: t('settingsHub.card.deliveries'),
            allowed: hasPermission(user, 'deliveries.manage'),
        },
        {
            key: 'loyalty',
            group: 'customers',
            to: '/loyalty',
            icon: Gift,
            title: t('loyalty.title'),
            detail: t('settingsHub.card.loyalty'),
            allowed: hasPermission(user, 'clients.manage'),
        },
        {
            key: 'subscriptions',
            group: 'customers',
            to: '/subscriptions',
            icon: Crown,
            title: t('subscription.title'),
            detail: t('settingsHub.card.subscriptions'),
            allowed: hasPermission(user, 'subscriptions.manage'),
        },
        {
            key: 'notifications',
            group: 'customers',
            to: '/notifications',
            icon: Bell,
            title: t('nav.notifications'),
            detail: t('settingsHub.card.notifications'),
            allowed: hasPermission(user, 'notifications.manage'),
        },
        {
            key: 'branding',
            group: 'brand',
            to: '/settings/branding',
            icon: Palette,
            title: t('branding.title'),
            detail: t('settingsHub.card.branding'),
            status: brandingComplete ? { tone: 'emerald', label: t('settingsHub.status.configured') } : { tone: 'amber', label: t('settingsHub.status.toComplete') },
            updatedAt: settings?.updated_at,
            allowed: hasPermission(user, 'agencies.manage'),
        },
        {
            key: 'security',
            group: 'brand',
            to: '/settings/security',
            icon: LockKeyhole,
            title: t('settings.security'),
            detail: t('settingsHub.card.security'),
            status: expiry
                ? { tone: 'emerald', label: t('settingsHub.status.expiry', { days: expiry }) }
                : { tone: 'neutral', label: t('settingsHub.status.noExpiry') },
            updatedAt: settings?.updated_at,
            allowed: hasPermission(user, 'agencies.manage'),
        },
        {
            key: 'license',
            group: 'brand',
            to: '/license',
            icon: KeyRound,
            title: t('nav.license'),
            detail: t('settingsHub.card.license'),
            allowed: hasPermission(user, 'licenses.manage'),
        },
    ];

    const groups: GroupKey[] = ['organisation', 'customers', 'brand'];

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return categories.filter(
            (c) => c.allowed && (group === 'all' || c.group === group) && (!q || `${c.title} ${c.detail}`.toLowerCase().includes(q)),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, group, settings, user]);

    return (
        <div className="space-y-6">
            <PageHeader title={t('settings.title')} subtitle={t('settingsHub.subtitle')} icon={SettingsIcon} />

            <div className="grid gap-4 lg:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)]">
                <div className={cx(cardPadded, 'space-y-4')}>
                    <label className="relative block">
                        <span className="sr-only">{t('settingsHub.search')}</span>
                        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('settingsHub.searchPlaceholder')}
                            className={cx(input, 'pl-10')}
                        />
                    </label>
                    <div role="group" aria-label={t('settingsHub.filter')} className="flex flex-wrap gap-2">
                        <ChipToggle active={group === 'all'} onClick={() => setGroup('all')}>
                            {t('order.all')}
                        </ChipToggle>
                        {groups.map((g) => (
                            <ChipToggle key={g} active={group === g} onClick={() => setGroup(g)}>
                                {t(`settingsHub.group.${g}`)}
                            </ChipToggle>
                        ))}
                    </div>
                </div>

                <section aria-labelledby="settings-config-state" className={cx(cardPadded, 'flex flex-col justify-between gap-3')}>
                    <div>
                        <h2 id="settings-config-state" className={sectionTitle}>
                            {t('settingsHub.configState')}
                        </h2>
                        <p className="text-sm text-ink-600 dark:text-ink-350">{t('settingsHub.configStateHint')}</p>
                    </div>
                    <ProgressBar value={done} max={checklist.length} className="h-2" />
                    <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-ink-900 dark:text-ink-50">{t('settingsHub.configCount', { done, total: checklist.length })}</span>
                        {!brandingComplete && hasPermission(user, 'agencies.manage') && (
                            <Link to="/settings/branding" className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300">
                                {t('settingsHub.complete')}
                            </Link>
                        )}
                    </div>
                </section>
            </div>

            {visible.length === 0 ? (
                <div className={card}>
                    <EmptyState icon={Search} title={t('settingsHub.noResult')} />
                </div>
            ) : (
                groups.map((g) => {
                    const items = visible.filter((c) => c.group === g);
                    if (items.length === 0) return null;
                    return (
                        <section key={g} aria-labelledby={`settings-group-${g}`} className="space-y-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <h2 id={`settings-group-${g}`} className="text-xs font-bold uppercase tracking-wider text-ink-600 dark:text-ink-350">
                                    {t(`settingsHub.group.${g}`)}
                                </h2>
                                <p className="text-xs text-ink-500 dark:text-ink-400">{t(`settingsHub.groupHint.${g}`)}</p>
                            </div>
                            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                {items.map((c) => (
                                    <li key={c.key} className="min-w-0">
                                        <CategoryCard category={c} updatedLabel={c.updatedAt ? t('settingsHub.updatedAt', { date: date(c.updatedAt) }) : null} />
                                    </li>
                                ))}
                            </ul>
                        </section>
                    );
                })
            )}
        </div>
    );
}

function CategoryCard({ category, updatedLabel }: { category: Category; updatedLabel: string | null }) {
    const { t } = useI18n();
    const Icon = category.icon;
    return (
        <Link to={category.to} className={cx(cardInteractive, 'group flex h-full flex-col gap-4 p-5')}>
            <div className="flex items-start justify-between gap-2">
                <span className={cx('flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset', TONES.brand)}>
                    <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                </span>
                {category.status && <Pill tone={category.status.tone}>{category.status.label}</Pill>}
            </div>
            <div className="flex-1">
                <p className="font-semibold text-ink-900 dark:text-ink-50">{category.title}</p>
                <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{category.detail}</p>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-ink-100 pt-3 text-xs dark:border-ink-800">
                <span className="text-ink-500 dark:text-ink-400">{updatedLabel ?? ''}</span>
                <span className="inline-flex items-center gap-1 font-semibold text-brand-700 dark:text-brand-300">
                    {t('settingsHub.open')}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
            </div>
        </Link>
    );
}

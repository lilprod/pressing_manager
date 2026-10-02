import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowRight,
    Bell,
    Building2,
    Clock3,
    Crown,
    Gift,
    Hash,
    KeyRound,
    LockKeyhole,
    Palette,
    ScrollText,
    Search,
    Settings as SettingsIcon,
    Shirt,
    Truck,
    Users,
    WashingMachine,
    WifiOff,
    type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { api } from '../lib/api';
import { auditLogLabel, auditTypeLabel } from '../lib/auditLog';
import { brandingChecklist } from '../lib/brandingChecklist';
import { useFormat } from '../lib/format';
import { hasPermission } from '../lib/permissions';
import PageHeader from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/Feedback';
import { ChipToggle, ProgressBar } from '../components/ui/Metrics';
import { Pill, TONES, type Tone } from '../components/ui/StatusBadge';
import { card, cardInteractive, cardPadded, cx, input, sectionTitle } from '../components/ui/styles';
import type { AuditLog } from '../types';

/* Hub « Paramètres » (Figma SPARK PRESSING, section 09, node 25:12184) : recherche,
 * état global et cartes de catégories menant aux écrans de réglage, plus un panneau
 * « Dernières modifications » (journal d'audit générique, voir CLAUDE.md « Un système
 * d'audit générique existe déjà »). Seules les catégories qui ont un écran réel sont
 * listées — notamment « Promotions » (moteur marketing entièrement absent du backend,
 * chantier à part) est omise, voir CLAUDE.md §2. */

type GroupKey = 'structure' | 'operations' | 'finance' | 'platform';

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
    const [recentChanges, setRecentChanges] = useState<AuditLog[]>([]);

    const canSeeRecentChanges = hasPermission(user, 'agencies.manage');

    useEffect(() => {
        if (!canSeeRecentChanges) return;
        api
            .get<AuditLog[]>('/settings/recent-changes')
            .then(setRecentChanges)
            .catch(() => setRecentChanges([]));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canSeeRecentChanges]);

    const checklist = brandingChecklist(settings);
    const brandingDone = checklist.filter((item) => item.done).length;
    const brandingComplete = brandingDone === checklist.length;
    const expiry = settings?.password_expiry_days;

    // Un seul type Agency/AppSetting est journalisé à ce stade (chantier « Paramètres
    // opérationnels » ajoutera AgencySetting pour les cartes Codes dépôt/Délais/Cycle
    // atelier/Tarification) — pas de badge fabriqué pour les catégories sans signal réel.
    const lastAgencyChange = recentChanges.find((log) => log.auditable_type === 'Agency');
    const agencyStatus = lastAgencyChange
        ? recencyStatus(lastAgencyChange.created_at, t)
        : undefined;

    const categories: Category[] = [
        {
            key: 'agencies',
            group: 'structure',
            to: '/agencies',
            icon: Building2,
            title: t('agency.title'),
            detail: t('settingsHub.card.agencies'),
            status: agencyStatus ? { tone: agencyStatus.tone, label: agencyStatus.label } : undefined,
            updatedAt: agencyStatus ? lastAgencyChange!.created_at : null,
            allowed: hasPermission(user, 'agencies.manage'),
        },
        {
            key: 'users',
            group: 'structure',
            to: '/users',
            icon: Users,
            title: t('settingsHub.card.usersRolesTitle'),
            detail: t('settingsHub.card.users'),
            allowed: hasPermission(user, 'users.manage'),
        },
        {
            key: 'services',
            group: 'structure',
            to: '/services',
            icon: Shirt,
            title: t('settingsHub.card.catalogTitle'),
            detail: t('settingsHub.card.services'),
            allowed: hasPermission(user, 'services.manage'),
        },
        {
            key: 'orderCodes',
            group: 'structure',
            to: '/settings/operational',
            icon: Hash,
            title: t('settingsHub.card.orderCodesTitle'),
            detail: t('settingsHub.card.orderCodes'),
            allowed: hasPermission(user, 'agencies.manage'),
        },
        {
            key: 'delays',
            group: 'operations',
            to: '/settings/operational',
            icon: Clock3,
            title: t('settingsHub.card.delaysTitle'),
            detail: t('settingsHub.card.delays'),
            allowed: hasPermission(user, 'agencies.manage'),
        },
        {
            key: 'loyalty',
            group: 'operations',
            to: '/loyalty',
            icon: Gift,
            title: t('loyalty.title'),
            detail: t('settingsHub.card.loyalty'),
            allowed: hasPermission(user, 'clients.manage'),
        },
        {
            key: 'workshop',
            group: 'operations',
            to: '/settings/operational',
            icon: WashingMachine,
            title: t('settingsHub.card.workshopTitle'),
            detail: t('settingsHub.card.workshop'),
            allowed: hasPermission(user, 'agencies.manage'),
        },
        {
            key: 'pricing',
            group: 'finance',
            to: '/settings/operational',
            icon: Palette,
            title: t('settingsHub.card.pricingTitle'),
            detail: t('settingsHub.card.pricing'),
            allowed: hasPermission(user, 'agencies.manage'),
        },
        {
            key: 'deliveries',
            group: 'finance',
            to: '/deliveries',
            icon: Truck,
            title: t('settingsHub.card.deliveriesTitle'),
            detail: t('settingsHub.card.deliveries'),
            allowed: hasPermission(user, 'deliveries.manage'),
        },
        {
            key: 'subscriptions',
            group: 'finance',
            to: '/subscriptions',
            icon: Crown,
            title: t('subscription.title'),
            detail: t('settingsHub.card.subscriptions'),
            allowed: hasPermission(user, 'subscriptions.manage'),
        },
        {
            key: 'notifications',
            group: 'finance',
            to: '/notifications',
            icon: Bell,
            title: t('nav.notifications'),
            detail: t('settingsHub.card.notifications'),
            allowed: hasPermission(user, 'notifications.manage'),
        },
        {
            key: 'branding',
            group: 'platform',
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
            group: 'platform',
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
            key: 'offline',
            group: 'platform',
            to: '/settings/operational',
            icon: WifiOff,
            title: t('settingsHub.card.offlineTitle'),
            detail: t('settingsHub.card.offline'),
            allowed: hasPermission(user, 'agencies.manage'),
        },
        {
            key: 'audit',
            group: 'platform',
            to: '/audit-logs',
            icon: ScrollText,
            title: t('auditLogs.title'),
            detail: t('settingsHub.card.audit'),
            allowed: hasPermission(user, 'audit.view'),
        },
        {
            key: 'license',
            group: 'platform',
            to: '/license',
            icon: KeyRound,
            title: t('nav.license'),
            detail: t('settingsHub.card.license'),
            allowed: hasPermission(user, 'licenses.manage'),
        },
    ];

    const groups: GroupKey[] = ['structure', 'operations', 'finance', 'platform'];

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return categories.filter(
            (c) => c.allowed && (group === 'all' || c.group === group) && (!q || `${c.title} ${c.detail}`.toLowerCase().includes(q)),
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, group, settings, user, recentChanges]);

    // « À vérifier » = nb de cartes avec un badge "Action requise" réel (amber) — pas de
    // compte fabriqué pour matcher un total arbitraire. Aujourd'hui, seul Branding en a un.
    const toVerify = visible.filter((c) => c.status?.tone === 'amber').length;

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

                <section aria-labelledby="settings-global-state" className={cx(cardPadded, 'flex flex-col justify-between gap-3')}>
                    <div>
                        <h2 id="settings-global-state" className={sectionTitle}>
                            {t('settingsHub.globalState')}
                        </h2>
                        <p className="text-sm text-ink-600 dark:text-ink-350">{t('settingsHub.globalStateHint', { count: visible.length })}</p>
                    </div>
                    <ProgressBar value={visible.length - toVerify} max={Math.max(visible.length, 1)} className="h-2" />
                    <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-ink-900 dark:text-ink-50">
                            {t('settingsHub.globalStateCount', { upToDate: visible.length - toVerify, toVerify })}
                        </span>
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

            {canSeeRecentChanges && <RecentChangesPanel logs={recentChanges} />}
        </div>
    );
}

/** Règle générique (CLAUDE.md §2 « Hub — badges de statut ») : aucun statut fabriqué —
 * "Modifié" si l'entrée d'audit la plus récente date de moins de 48h, sinon "À jour". */
function recencyStatus(createdAt: string, t: (key: string, vars?: Record<string, string | number>) => string): { tone: Tone; label: string } {
    const hoursAgo = (Date.now() - new Date(createdAt).getTime()) / 3_600_000;
    return hoursAgo < 48
        ? { tone: 'sky', label: t('settingsHub.status.recentlyModified') }
        : { tone: 'emerald', label: t('settingsHub.status.upToDate') };
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

/** Panneau « Dernières modifications » (node 25:12184) : vraies entrées du journal
 * d'audit générique, pas une liste fabriquée — voir GET /settings/recent-changes. */
function RecentChangesPanel({ logs }: { logs: AuditLog[] }) {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();

    return (
        <section aria-labelledby="settings-recent-changes" className={cx(cardPadded, 'space-y-3')}>
            <div className="flex items-center justify-between gap-2">
                <h2 id="settings-recent-changes" className={sectionTitle}>
                    {t('settingsHub.recentChanges.title')}
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
                        <li key={log.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                            <span className="w-32 shrink-0 text-xs text-ink-500 dark:text-ink-400">{dateTime(log.created_at)}</span>
                            <Pill tone="neutral">{auditTypeLabel(log.auditable_type, t)}</Pill>
                            <span className="flex-1 font-medium text-ink-900 dark:text-white">{auditLogLabel(log, t, money)}</span>
                            <span className="text-xs text-ink-500 dark:text-ink-400">{log.user?.name ?? t('order.audit.systemActor')}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

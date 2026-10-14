import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    Archive,
    ArrowLeft,
    ArrowUpRight,
    ChevronDown,
    Eye,
    Headset,
    HeartPulse,
    LogIn,
    RefreshCw,
    Store,
    X,
    Building2,
    CreditCard,
    Download,
    Pencil,
    Power,
    ScrollText,
    Search,
    ShieldAlert,
    ShieldCheck,
    UsersRound,
} from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { useFormat } from '../../lib/format';
import RenewLicenseModal from '../../components/superadmin/RenewLicenseModal';
import { Alert, EmptyState, LoadingState } from '../../components/ui/Feedback';
import { StatCard } from '../../components/ui/Metrics';
import Pagination from '../../components/ui/Pagination';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cx, input, textLink } from '../../components/ui/styles';
import type { Paginated, PlatformAuditLog, Pressing, PressingAgency, PlatformUser } from '../../types';

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/* Fiche détail d'un pressing (CLAUDE.md « Audit de conformité Figma — interfaces
 * superadmin », Chantier C). Pas d'onglet « Configuration » (décision actée pendant
 * l'audit) : les champs de la capture (devise, fuseau, numérotation, offline) sont
 * en réalité des réglages par AGENCE (AgencySetting), pas par pressing — un résumé
 * « tenant » unique serait trompeur pour un pressing à plusieurs agences. */

function describeActivity(log: PlatformAuditLog): string {
    if (log.action.endsWith('.created')) return 'Créé(e)';
    if (log.action.endsWith('.deleted')) return 'Supprimé(e)';
    if (log.action === 'pressing.impersonated') return 'Connexion en tant que (impersonation)';
    if (log.action.endsWith('.updated')) {
        const keys = Object.keys(log.new_values ?? {});
        return keys.length > 0 ? `Modifié(e) : ${keys.join(', ')}` : 'Modifié(e)';
    }
    return log.action;
}

type Tab = 'overview' | 'agencies' | 'users' | 'license' | 'audit';

interface PressingOverview {
    agencies: { id: number; name: string; city: string | null; is_active: boolean; users_count: number }[];
    agencies_active: number;
    agencies_total: number;
    users_total: number;
    users_active_30d: number;
    users_by_role: { role: string; count: number; initials: string }[];
    license: {
        plan: string | null;
        starts_at: string | null;
        expires_at: string | null;
        days_remaining: number | null;
        consumed_pct: number | null;
        agencies_limit: number | null;
        users_limit: number | null;
        storage_limit_gb: number | null;
    };
    health: 'sain' | 'degrade' | 'incident';
    open_incidents: { id: number; title: string; priority: string }[];
    configuration: { timezone: string; numbering_formats: string[]; offline_enabled_count: number; offline_retention_days: number[] };
    offline_orders: { id: number; number: string; agency_name: string | null; created_at: string }[];
    offline_orders_total: number;
}

interface ActivityRow {
    key: string;
    source: 'audit' | 'auth';
    created_at: string;
    subject: string;
    kind: string;
    resource_id: string | null;
    agency_name: string | null;
    actor_name: string | null;
    actor_role: string | null;
    ip_address: string | null;
    result: 'success' | 'failure';
    user_agent: string | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
}

const HEALTH: Record<PressingOverview['health'], { label: string; tone: 'emerald' | 'amber' | 'rose' }> = {
    sain: { label: 'Sain', tone: 'emerald' },
    degrade: { label: 'Dégradé', tone: 'amber' },
    incident: { label: 'Incident', tone: 'rose' },
};

const SUBJECT_LABELS: Record<string, string> = {
    Order: 'Dépôt',
    OrderItem: 'Article de dépôt',
    Client: 'Client',
    Payment: 'Paiement',
    Invoice: 'Facture',
    Delivery: 'Livraison',
    CashMovement: 'Mouvement de caisse',
    CashClosure: 'Clôture de caisse',
    CashSession: 'Session de caisse',
    StockMovement: 'Mouvement de stock',
    Attendance: 'Pointage',
    Shift: 'Planning',
    Agency: 'Agence',
    AppSetting: 'Paramètres du pressing',
    AgencySetting: "Paramètres d'agence",
};

const AUTH_LABELS: Record<string, string> = {
    login: 'Connexion',
    login_failed: 'Connexion refusée',
    login_locked: 'Compte verrouillé',
    logout: 'Déconnexion',
    mfa_enabled: 'Double authentification activée',
    mfa_disabled: 'Double authentification désactivée',
    mfa_failed: 'Code MFA refusé',
    password_changed: 'Mot de passe modifié',
    role_changed: 'Rôle modifié',
    agency_assigned: 'Agence affectée',
    invitation_sent: 'Invitation envoyée',
    invitation_revoked: 'Invitation révoquée',
    session_revoked: 'Session révoquée',
    sessions_revoked: 'Sessions révoquées',
    device_authorized: 'Appareil autorisé',
    device_revoked: 'Appareil révoqué',
    cash_session_opened: 'Session de caisse ouverte',
    cash_session_closed: 'Session de caisse clôturée',
};

function activityLabel(row: ActivityRow): string {
    if (row.source === 'auth') return AUTH_LABELS[row.kind] ?? row.kind;
    const subject = SUBJECT_LABELS[row.subject] ?? row.subject;
    if (row.subject === 'CashClosure' && row.kind === 'created') return 'Caisse clôturée';
    const verb = row.kind === 'created' ? 'créé(e)' : row.kind === 'deleted' ? 'supprimé(e)' : 'modifié(e)';
    return `${subject} ${verb}`;
}

function activityResource(row: ActivityRow): string {
    if (row.source === 'auth') return 'Compte';
    const subject = SUBJECT_LABELS[row.subject] ?? row.subject;
    return row.resource_id ? `${subject} #${row.resource_id}` : subject;
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join('');
}

export default function PressingDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [pressing, setPressing] = useState<Pressing | null>(null);
    const [overview, setOverview] = useState<PressingOverview | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [tab, setTab] = useState<Tab>('overview');
    const [renewing, setRenewing] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const { date } = useFormat();

    function reload() {
        if (!id) return;
        platformApi
            .get<Pressing>(`/pressings/${id}`)
            .then(setPressing)
            .catch((err) => {
                if (err instanceof PlatformApiError && (err.status === 403 || err.status === 404)) setNotFound(true);
            })
            .finally(() => setLoading(false));
        platformApi
            .get<PressingOverview>(`/pressings/${id}/overview`)
            .then(setOverview)
            .catch(() => setOverview(null));
    }

    useEffect(reload, [id]);

    async function toggleStatus() {
        if (!pressing) return;
        setMenuOpen(false);
        const action = pressing.status === 'active' ? 'suspend' : 'reactivate';
        const updated = await platformApi.post<Pressing>(`/pressings/${pressing.id}/${action}`);
        setPressing((prev) => (prev ? { ...prev, status: updated.status } : prev));
    }

    async function impersonate() {
        if (!pressing) return;
        setMenuOpen(false);
        setActionError(null);
        try {
            const result = await platformApi.post<{ token: string }>(`/pressings/${pressing.id}/impersonate`);
            window.open(`/impersonate?token=${encodeURIComponent(result.token)}`, '_blank');
        } catch (err) {
            setActionError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        }
    }

    if (loading) return <LoadingState />;
    if (notFound || !pressing) {
        return (
            <div className="space-y-4">
                <Link to="/superadmin/pressings" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    Retour aux pressings
                </Link>
                <Alert tone="error">Pressing introuvable ou hors de votre périmètre.</Alert>
            </div>
        );
    }

    const tabs: [Tab | 'configuration', string][] = [
        ['overview', "Vue d'ensemble"],
        ['agencies', `Agences${overview ? ` (${overview.agencies_total})` : ''}`],
        ['users', 'Utilisateurs transverses'],
        ['license', 'Licence'],
        ['configuration', 'Configuration'],
        ['audit', 'Audit plateforme'],
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <Link to="/superadmin/pressings" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                        Retour aux pressings
                    </Link>
                    <p className="mt-1 text-sm text-ink-600 dark:text-ink-350">
                        Organisation, licence, configuration, santé et traçabilité du tenant.
                    </p>
                </div>
                <div className="relative flex flex-wrap items-center gap-2">
                    {pressing.contact_email && (
                        <a href={`mailto:${pressing.contact_email}`} className={button('secondary', 'sm')}>
                            <Headset aria-hidden="true" className="h-4 w-4" />
                            Support
                        </a>
                    )}
                    <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} className={button('primary', 'sm')}>
                        Actions
                        <ChevronDown aria-hidden="true" className="h-4 w-4" />
                    </button>
                    {menuOpen && (
                        <div role="menu" className="absolute right-0 top-11 z-20 w-60 rounded-xl border border-ink-200 bg-white p-1.5 shadow-lg dark:border-ink-700 dark:bg-ink-900">
                            <MenuItem icon={Pencil} label="Modifier la configuration" onClick={() => navigate(`/superadmin/pressings/${pressing.id}/edit`)} />
                            <MenuItem icon={CreditCard} label="Enregistrer un paiement" onClick={() => { setMenuOpen(false); setRenewing(true); }} />
                            <MenuItem icon={LogIn} label="Se connecter en tant que" onClick={() => void impersonate()} />
                            <MenuItem
                                icon={Power}
                                label={pressing.status === 'active' ? 'Suspendre le tenant' : 'Réactiver le tenant'}
                                danger={pressing.status === 'active'}
                                onClick={() => void toggleStatus()}
                            />
                        </div>
                    )}
                </div>
            </div>

            {actionError && <Alert tone="error">{actionError}</Alert>}

            <section className={cx(card, 'p-5 sm:p-6')}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-900 font-display text-lg font-bold text-white">
                            {initials(pressing.name)}
                        </span>
                        <div className="min-w-0">
                            <h1 className="truncate font-display text-2xl font-bold text-ink-900 dark:text-white">{pressing.name}</h1>
                            <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">
                                {pressing.code} · {pressing.country_code ?? '—'} · Créé le {date(pressing.created_at)}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Pill tone={pressing.status === 'active' ? 'emerald' : 'neutral'}>{pressing.status === 'active' ? 'Actif' : 'Suspendu'}</Pill>
                        {pressing.platform_plan && <Pill tone="accent">{pressing.platform_plan.name}</Pill>}
                        {(pressing.contact_name || pressing.contact_email) && (
                            <span className="text-ink-600 dark:text-ink-300">
                                {[pressing.contact_name, pressing.contact_email].filter(Boolean).join(' • ')}
                            </span>
                        )}
                    </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-1 border-b border-ink-200/80 dark:border-ink-800">
                    {tabs.map(([key, labelText]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => (key === 'configuration' ? navigate(`/superadmin/pressings/${pressing.id}/edit`) : setTab(key))}
                            className={cx(
                                '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition',
                                tab === key
                                    ? 'border-accent-500 text-ink-900 dark:text-white'
                                    : 'border-transparent text-ink-500 hover:text-ink-900 dark:text-ink-400 dark:hover:text-white',
                            )}
                        >
                            {labelText}
                        </button>
                    ))}
                </div>
            </section>

            {tab === 'overview' && (
                <OverviewTab pressing={pressing} overview={overview} onTab={setTab} onRenew={() => setRenewing(true)} />
            )}
            {tab === 'agencies' && <AgenciesTab pressingId={pressing.id} />}
            {tab === 'users' && <UsersTab pressingId={pressing.id} />}
            {tab === 'license' && <LicenseTab pressing={pressing} onRenew={() => setRenewing(true)} />}
            {tab === 'audit' && <AuditTab pressingId={pressing.id} />}

            {renewing && (
                <RenewLicenseModal
                    pressing={pressing}
                    onClose={() => setRenewing(false)}
                    onRenewed={() => {
                        setRenewing(false);
                        reload();
                    }}
                />
            )}
        </div>
    );
}

function MenuItem({ icon: Icon, label: text, onClick, danger }: { icon: typeof Pencil; label: string; onClick: () => void; danger?: boolean }) {
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            className={cx(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium transition hover:bg-ink-100 dark:hover:bg-ink-800',
                danger ? 'text-red-700 dark:text-red-400' : 'text-ink-800 dark:text-ink-100',
            )}
        >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {text}
        </button>
    );
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
    return (
        <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
                <h2 className="font-display text-base font-bold text-ink-900 dark:text-ink-50">{title}</h2>
                {subtitle && <p className="text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>}
            </div>
            {action}
        </div>
    );
}

function ManageLink({ onClick, label: text = 'Gérer' }: { onClick: () => void; label?: string }) {
    return (
        <button type="button" onClick={onClick} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-700 hover:text-ink-900 dark:text-ink-300 dark:hover:text-white">
            {text}
            <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
    );
}

function OverviewTab({
    pressing,
    overview,
    onTab,
    onRenew,
}: {
    pressing: Pressing;
    overview: PressingOverview | null;
    onTab: (tab: Tab) => void;
    onRenew: () => void;
}) {
    const { date, dateTime } = useFormat();
    if (!overview) return <LoadingState />;

    const lic = overview.license;
    const health = HEALTH[overview.health];
    const topAgencies = [...overview.agencies].sort((a, b) => b.users_count - a.users_count).slice(0, 4);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    label="Agences actives"
                    value={overview.agencies_active}
                    icon={Building2}
                    tone="accent"
                    hint={overview.agencies_active === overview.agencies_total ? 'Toutes actives' : `${overview.agencies_total - overview.agencies_active} désactivée(s)`}
                />
                <StatCard label="Utilisateurs" value={overview.users_total} icon={UsersRound} tone="emerald" hint={`${overview.users_active_30d} connecté(s) sur 30 jours`} />
                <StatCard
                    label="Licence"
                    value={lic.days_remaining !== null ? `${lic.days_remaining} jours` : '—'}
                    icon={CreditCard}
                    tone={lic.days_remaining !== null && lic.days_remaining < 30 ? 'amber' : 'sky'}
                    hint={lic.expires_at ? `Expire le ${date(lic.expires_at)}` : undefined}
                />
                <StatCard
                    label="Santé tenant"
                    value={health.label}
                    icon={HeartPulse}
                    tone={health.tone === 'rose' ? 'rose' : health.tone}
                    hint={overview.open_incidents.length === 0 ? 'Aucun incident ouvert' : `${overview.open_incidents.length} incident(s) ouvert(s)`}
                />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <section className={cx(card, 'p-5')}>
                    <CardHeader title="Agences" subtitle="Isolation contrôlée" action={<ManageLink onClick={() => onTab('agencies')} />} />
                    <ul className="space-y-3">
                        {topAgencies.map((a) => (
                            <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                                <span className="flex min-w-0 items-center gap-2 text-ink-800 dark:text-ink-100">
                                    <Store aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
                                    <span className="truncate font-medium">{a.name}</span>
                                    <span className="shrink-0 text-ink-500">· {a.users_count} users</span>
                                </span>
                                <Pill tone={a.is_active ? 'emerald' : 'neutral'}>{a.is_active ? 'Active' : 'Inactive'}</Pill>
                            </li>
                        ))}
                    </ul>
                    {overview.agencies_total > topAgencies.length && (
                        <p className="mt-3 text-xs text-ink-500 dark:text-ink-400">+ {overview.agencies_total - topAgencies.length} autre(s) agence(s)</p>
                    )}
                </section>

                <section className={cx(card, 'p-5')}>
                    <CardHeader
                        title="Personnel du pressing"
                        subtitle={`${overview.users_total} compte(s), répartis par rôle`}
                        action={<ManageLink onClick={() => onTab('users')} label="Transverses" />}
                    />
                    {overview.users_by_role.length === 0 ? (
                        <p className="text-sm text-ink-500">Aucun compte actif.</p>
                    ) : (
                        <ul className="flex flex-wrap gap-4">
                            {overview.users_by_role.map((r) => (
                                <li key={r.role} className="flex flex-col items-center gap-1 text-center">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-800 dark:bg-accent-500/20 dark:text-accent-200">
                                        {r.initials || '—'}
                                    </span>
                                    <span className="text-[11px] text-ink-600 dark:text-ink-300">
                                        {r.role} • {r.count}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className={cx(card, 'p-5')}>
                    <CardHeader
                        title={`Licence ${lic.plan ?? ''}`.trim()}
                        subtitle={lic.starts_at && lic.expires_at ? `${date(lic.starts_at)} → ${date(lic.expires_at)}` : undefined}
                        action={<ManageLink onClick={onRenew} label="Renouveler" />}
                    />
                    {lic.consumed_pct !== null && (
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs text-ink-600 dark:text-ink-300">
                                <span>Période consommée</span>
                                <span className="font-semibold">{lic.consumed_pct} %</span>
                            </div>
                            <div className="h-2 rounded-full bg-ink-100 dark:bg-ink-800">
                                <div className="h-2 rounded-full bg-accent-500" style={{ width: `${lic.consumed_pct}%` }} />
                            </div>
                        </div>
                    )}
                    <div className="mt-3 space-y-2">
                        {lic.agencies_limit !== null && <QuotaBar label="Agences" used={overview.agencies_total} limit={lic.agencies_limit} />}
                        {lic.users_limit !== null && <QuotaBar label="Utilisateurs" used={overview.users_total} limit={lic.users_limit} />}
                        {lic.storage_limit_gb !== null && (
                            <p className="text-xs text-ink-500 dark:text-ink-400">Stockage inclus : {lic.storage_limit_gb} Go (consommation non mesurée)</p>
                        )}
                        {lic.agencies_limit === null && lic.users_limit === null && (
                            <p className="text-xs text-ink-500 dark:text-ink-400">Ce plan ne fixe pas de quota d'agences ni d'utilisateurs.</p>
                        )}
                    </div>
                </section>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <section className={cx(card, 'p-5')}>
                    <CardHeader title="Configuration tenant" subtitle="Lu dans les réglages des agences" />
                    <dl className="space-y-3 text-sm">
                        <ConfigRow label="Devise" value="FCFA (XOF)" />
                        <ConfigRow label="Fuseau" value={overview.configuration.timezone} />
                        <ConfigRow
                            label="Numérotation"
                            value={
                                overview.configuration.numbering_formats.length === 1
                                    ? overview.configuration.numbering_formats[0]
                                    : `${overview.configuration.numbering_formats.length} formats selon l'agence`
                            }
                        />
                        <ConfigRow
                            label="Offline"
                            value={`Activé ${overview.configuration.offline_enabled_count}/${overview.agencies_total}${
                                overview.configuration.offline_retention_days.length === 1 ? ` • ${overview.configuration.offline_retention_days[0]} j` : ''
                            }`}
                        />
                    </dl>
                </section>

                <section className={cx(card, 'p-5')}>
                    <CardHeader title="Incidents ouverts" subtitle="Registre des incidents plateforme" action={<Pill tone={health.tone}>{health.label}</Pill>} />
                    {overview.open_incidents.length === 0 ? (
                        <p className="text-sm text-ink-500 dark:text-ink-400">Aucun incident ouvert pour ce pressing.</p>
                    ) : (
                        <ul className="space-y-2 text-sm">
                            {overview.open_incidents.map((i) => (
                                <li key={i.id} className="flex items-center justify-between gap-2">
                                    <span className="truncate text-ink-800 dark:text-ink-100">{i.title}</span>
                                    <Pill tone={i.priority === 'P1' ? 'rose' : 'amber'}>{i.priority}</Pill>
                                </li>
                            ))}
                        </ul>
                    )}
                    <Link to="/superadmin/incidents" className={cx(textLink, 'mt-3 inline-flex text-xs')}>
                        Ouvrir le registre
                    </Link>
                </section>

                <section className="rounded-2xl bg-brand-900 p-5 text-white">
                    <ShieldCheck aria-hidden="true" className="h-5 w-5 text-accent-300" />
                    <h2 className="mt-3 font-display text-base font-bold">Isolation du tenant</h2>
                    <p className="mt-1 text-sm text-brand-100/80">
                        Agences, personnel, clients, dépôts, catalogue et caisse sont filtrés par pressing à chaque requête. Le
                        journal ci-dessous ne contient que l'activité de ce pressing.
                    </p>
                </section>
            </div>

            <ActivityJournal pressing={pressing} agencies={overview.agencies} />

            <section className={cx(card, 'p-5')}>
                <CardHeader title="Synchronisation offline" subtitle={`${overview.offline_orders_total} dépôt(s) rejoué(s) depuis une file hors ligne`} />
                {overview.offline_orders.length === 0 ? (
                    <p className="text-sm text-ink-500 dark:text-ink-400">Aucun dépôt créé hors ligne pour ce pressing.</p>
                ) : (
                    <ul className="divide-y divide-ink-100 text-sm dark:divide-ink-800">
                        {overview.offline_orders.map((o) => (
                            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                <span className="flex min-w-0 items-center gap-2 text-ink-800 dark:text-ink-100">
                                    <RefreshCw aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
                                    <span className="font-medium">{o.number}</span>
                                    <span className="truncate text-ink-500">· {o.agency_name ?? '—'} · {dateTime(o.created_at)}</span>
                                </span>
                                <Pill tone="emerald">Synchronisé</Pill>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-200">
                <Archive aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                    <span className="font-semibold">Rétention et intégrité</span> — les journaux sont append-only : aucune entrée n'est
                    modifiée ni supprimée par l'application, et aucune purge automatique n'est programmée.
                </p>
            </div>
        </div>
    );
}

function ConfigRow({ label: text, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="text-ink-500 dark:text-ink-400">{text}</dt>
            <dd className="truncate text-right font-medium text-ink-900 dark:text-ink-50">{value}</dd>
        </div>
    );
}

const CATEGORIES: [string, string][] = [
    ['', 'Toutes les actions'],
    ['security', 'Sécurité'],
    ['operations', 'Opérations'],
    ['configuration', 'Configuration'],
];

function ActivityJournal({ pressing, agencies }: { pressing: Pressing; agencies: PressingOverview['agencies'] }) {
    const { dateTime } = useFormat();
    const [category, setCategory] = useState('');
    const [period, setPeriod] = useState<'day' | 'week' | 'month' | ''>('week');
    const [agencyId, setAgencyId] = useState('');
    const [result, setResult] = useState('');
    const [search, setSearch] = useState('');
    const [debounced, setDebounced] = useState('');
    const [page, setPage] = useState(1);
    const [data, setData] = useState<Paginated<ActivityRow> | null>(null);
    const [detail, setDetail] = useState<ActivityRow | null>(null);

    useEffect(() => {
        const handle = setTimeout(() => setDebounced(search.trim()), 300);
        return () => clearTimeout(handle);
    }, [search]);

    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (period) params.set('period', period);
    if (agencyId) params.set('agency_id', agencyId);
    if (result) params.set('result', result);
    if (debounced) params.set('search', debounced);
    const qs = params.toString();

    useEffect(() => setPage(1), [qs]);
    useEffect(() => {
        platformApi.get<Paginated<ActivityRow>>(`/pressings/${pressing.id}/activity?${qs}&page=${page}&per_page=10`).then(setData);
    }, [pressing.id, qs, page]);

    async function exportCsv() {
        const blob = await platformApi.blob(`/pressings/${pressing.id}/activity/export?${qs}`);
        downloadBlob(blob, `journal-${pressing.code}.csv`);
    }

    return (
        <section className={cx(card, 'p-5 sm:p-6')}>
            <CardHeader
                title="Journal d'audit"
                subtitle="Actions du personnel et connexions de ce pressing"
                action={
                    <button type="button" onClick={() => void exportCsv()} className={button('secondary', 'sm')}>
                        <Download aria-hidden="true" className="h-4 w-4" />
                        Exporter CSV
                    </button>
                }
            />
            <div className="flex flex-wrap gap-1 border-b border-ink-200/80 dark:border-ink-800">
                {CATEGORIES.map(([key, text]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setCategory(key)}
                        className={cx(
                            '-mb-px border-b-2 px-3 py-2 text-sm font-semibold',
                            category === key ? 'border-accent-500 text-ink-900 dark:text-white' : 'border-transparent text-ink-500 hover:text-ink-900 dark:text-ink-400',
                        )}
                    >
                        {text}
                    </button>
                ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                <label className="relative block">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Action, acteur, ressource ou IP…" className={cx(input, 'pl-9')} />
                </label>
                <div className="flex flex-wrap items-center gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
                    {([['day', 'Jour'], ['week', 'Semaine'], ['month', 'Mois'], ['', 'Tout']] as const).map(([key, text]) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setPeriod(key)}
                            className={cx(
                                'rounded-lg px-3 py-1.5 text-xs font-semibold',
                                period === key ? 'bg-white text-ink-900 shadow-sm dark:bg-ink-700 dark:text-white' : 'text-ink-600 dark:text-ink-300',
                            )}
                        >
                            {text}
                        </button>
                    ))}
                </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select value={agencyId} onChange={(e) => setAgencyId(e.target.value)} className={input} aria-label="Agence">
                    <option value="">Toutes les agences</option>
                    {agencies.map((a) => (
                        <option key={a.id} value={a.id}>
                            {a.name}
                        </option>
                    ))}
                </select>
                <select value={result} onChange={(e) => setResult(e.target.value)} className={input} aria-label="Résultat">
                    <option value="">Tous les résultats</option>
                    <option value="success">Succès</option>
                    <option value="failure">Échec</option>
                </select>
            </div>

            <div className="mt-4 overflow-x-auto">
                <div className="min-w-[1120px]">
                    <div role="row" className="flex gap-3 border-b border-ink-200/80 bg-ink-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-900/60 dark:text-ink-400">
                        <span className="w-48 shrink-0">Action</span>
                        <span className="w-44 shrink-0">Acteur / rôle</span>
                        <span className="w-40 shrink-0">Agence</span>
                        <span className="min-w-[150px] flex-1">Ressource</span>
                        <span className="w-32 shrink-0">Date</span>
                        <span className="w-28 shrink-0">Adresse IP</span>
                        <span className="w-20 shrink-0">Résultat</span>
                        <span className="w-16 shrink-0">Détails</span>
                    </div>
                    {data === null ? (
                        <LoadingState />
                    ) : data.data.length === 0 ? (
                        <EmptyState icon={ScrollText} title="Aucune activité" description="Aucune entrée ne correspond à ces filtres." />
                    ) : (
                        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                            {data.data.map((row) => (
                                <li key={row.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                                    <span className="w-48 shrink-0 truncate font-semibold text-ink-900 dark:text-ink-50">{activityLabel(row)}</span>
                                    <span className="w-44 shrink-0 truncate text-ink-700 dark:text-ink-200">
                                        {row.actor_name ?? 'Système'}
                                        {row.actor_role ? ` · ${row.actor_role}` : ''}
                                    </span>
                                    <span className="w-40 shrink-0 truncate text-ink-600 dark:text-ink-300">{row.agency_name ?? 'Pressing'}</span>
                                    <span className="min-w-[150px] flex-1 truncate text-ink-600 dark:text-ink-300">{activityResource(row)}</span>
                                    <span className="w-32 shrink-0 text-ink-600 dark:text-ink-300">{dateTime(row.created_at)}</span>
                                    <span className="w-28 shrink-0 truncate font-mono text-xs text-ink-600 dark:text-ink-300">{row.ip_address ?? '—'}</span>
                                    <span className="w-20 shrink-0">
                                        <Pill tone={row.result === 'failure' ? 'rose' : 'emerald'}>{row.result === 'failure' ? 'Échec' : 'Succès'}</Pill>
                                    </span>
                                    <span className="w-16 shrink-0">
                                        <button type="button" onClick={() => setDetail(row)} className={button('secondary', 'sm')} aria-label="Voir le détail">
                                            <Eye aria-hidden="true" className="h-4 w-4" />
                                        </button>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            {data && data.data.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
                    <span>{data.total} résultat(s)</span>
                    <Pagination meta={data} onPageChange={setPage} />
                </div>
            )}

            {detail && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" onClick={() => setDetail(null)}>
                    <div className={cx(card, 'max-h-[80vh] w-full max-w-lg overflow-y-auto p-5')} onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="font-display text-base font-bold text-ink-900 dark:text-white">{activityLabel(detail)}</h3>
                                <p className="text-xs text-ink-500">
                                    {dateTime(detail.created_at)} · {detail.actor_name ?? 'Système'} · {detail.agency_name ?? 'Pressing'}
                                </p>
                            </div>
                            <button type="button" onClick={() => setDetail(null)} className={button('ghost', 'sm')} aria-label="Fermer">
                                <X aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </div>
                        <dl className="mt-4 space-y-2 text-sm">
                            <ConfigRow label="Ressource" value={activityResource(detail)} />
                            <ConfigRow label="Adresse IP" value={detail.ip_address ?? '—'} />
                            <ConfigRow label="Résultat" value={detail.result === 'failure' ? 'Échec' : 'Succès'} />
                        </dl>
                        {detail.user_agent && <p className="mt-3 break-words text-xs text-ink-500">{detail.user_agent}</p>}
                        {(detail.old_values || detail.new_values) && (
                            <div className="mt-4 space-y-2">
                                {detail.old_values && Object.keys(detail.old_values).length > 0 && (
                                    <ValuesBlock title="Avant" values={detail.old_values} keys={detail.new_values ? Object.keys(detail.new_values) : undefined} />
                                )}
                                {detail.new_values && <ValuesBlock title={detail.source === 'auth' ? 'Détails' : 'Après'} values={detail.new_values} />}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}

function ValuesBlock({ title, values, keys }: { title: string; values: Record<string, unknown>; keys?: string[] }) {
    const entries = Object.entries(values).filter(([k]) => !keys || keys.includes(k));
    if (entries.length === 0) return null;
    return (
        <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</p>
            <dl className="mt-1 space-y-1 rounded-lg bg-ink-50 p-3 font-mono text-xs dark:bg-ink-800">
                {entries.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                        <dt className="text-ink-500">{k}</dt>
                        <dd className="truncate text-right text-ink-900 dark:text-ink-100">{v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function AgenciesTab({ pressingId }: { pressingId: number }) {
    const [agencies, setAgencies] = useState<PressingAgency[] | null>(null);

    useEffect(() => {
        platformApi.get<PressingAgency[]>(`/pressings/${pressingId}/agencies`).then(setAgencies);
    }, [pressingId]);

    if (!agencies) return <LoadingState />;
    if (agencies.length === 0) return <EmptyState icon={Building2} title="Aucune agence" />;

    return (
        <div className={cx(card, 'overflow-hidden')}>
            <div className="overflow-x-auto">
                <div
                    role="row"
                    className="hidden min-w-[560px] items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 sm:flex dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                >
                    <span className="min-w-0 flex-1">Agence</span>
                    <span className="w-28 shrink-0">Ville</span>
                    <span className="w-24 shrink-0 text-right">Staff</span>
                    <span className="w-32 shrink-0 text-right">Dépôts actifs</span>
                    <span className="w-24 shrink-0">Statut</span>
                </div>
                <ul className="min-w-[560px] divide-y divide-ink-100 dark:divide-ink-800">
                    {agencies.map((agency) => (
                        <li key={agency.id} className="flex items-center gap-4 px-5 py-3">
                            <span className="min-w-0 flex-1 truncate font-semibold text-ink-900 dark:text-ink-50">{agency.name}</span>
                            <span className="w-28 shrink-0 text-sm text-ink-600 dark:text-ink-350">{agency.city ?? '—'}</span>
                            <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink-900 dark:text-white">{agency.users_count}</span>
                            <span className="w-32 shrink-0 text-right text-sm tabular-nums text-ink-900 dark:text-white">{agency.active_orders_count}</span>
                            <span className="w-24 shrink-0">
                                <Pill tone={agency.is_active ? 'emerald' : 'neutral'}>{agency.is_active ? 'Active' : 'Inactive'}</Pill>
                            </span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

function UsersTab({ pressingId }: { pressingId: number }) {
    const [users, setUsers] = useState<PlatformUser[] | null>(null);

    useEffect(() => {
        platformApi.get<Paginated<PlatformUser>>(`/users?pressing_id=${pressingId}&per_page=50`).then((res) => setUsers(res.data));
    }, [pressingId]);

    if (!users) return <LoadingState />;
    if (users.length === 0) return <EmptyState icon={UsersRound} title="Aucun utilisateur transverse affecté" />;

    return (
        <div className={cx(card, 'overflow-hidden')}>
            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {users.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5">
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{u.name}</p>
                            <p className="truncate text-xs text-ink-500 dark:text-ink-400">{u.email} · {u.platform_role?.name ?? '—'}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            {u.totp_enabled_at ? (
                                <Pill tone="emerald" icon={ShieldCheck}>MFA</Pill>
                            ) : (
                                <Pill tone="amber" icon={ShieldAlert}>MFA</Pill>
                            )}
                            <Pill tone={u.is_active ? 'emerald' : 'rose'}>{u.is_active ? 'Actif' : 'Suspendu'}</Pill>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function LicenseTab({ pressing, onRenew }: { pressing: Pressing; onRenew: () => void }) {
    const { dateTime } = useFormat();
    const license = pressing.license;

    return (
        <div className="space-y-6">
            <div className={cx(card, 'flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6')}>
                <div>
                    <p className="text-sm text-ink-600 dark:text-ink-350">Plan courant</p>
                    <p className="font-display text-lg font-bold text-ink-900 dark:text-white">{pressing.platform_plan?.name ?? '—'}</p>
                    {license && (
                        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                            {dateTime(license.starts_at)} → {dateTime(license.expires_at)} · {license.status}
                        </p>
                    )}
                </div>
                <button type="button" onClick={onRenew} className={button('primary', 'md')}>
                    <CreditCard aria-hidden="true" className="h-4 w-4" />
                    Enregistrer un paiement
                </button>
            </div>

            <section aria-labelledby="pressing-license-history" className={cx(card, 'overflow-hidden')}>
                <h2 id="pressing-license-history" className="px-5 pb-1 pt-5 font-display text-base font-bold text-ink-900 sm:px-6 dark:text-ink-50">
                    Historique des paiements
                </h2>
                {!license || license.payments === undefined || license.payments.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-ink-600 sm:px-6 dark:text-ink-350">Aucun paiement enregistré pour l'instant.</p>
                ) : (
                    <ul className="mt-3 divide-y divide-ink-100 dark:divide-ink-800">
                        {license.payments.map((payment) => (
                            <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 sm:px-6">
                                <div>
                                    <p className="font-semibold text-ink-900 dark:text-ink-50">{payment.amount.toLocaleString('fr-FR')} FCFA</p>
                                    <p className="text-xs text-ink-500 dark:text-ink-400">
                                        {payment.method} {payment.external_reference ? `· ${payment.external_reference}` : ''}
                                    </p>
                                </div>
                                <span className="shrink-0 text-xs text-ink-500 dark:text-ink-400">{dateTime(payment.paid_at)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

type AuditCategory = '' | 'security' | 'configuration';

/**
 * Chantier « Re-audit Pressing détail » (CLAUDE.md) : 3 sous-onglets (Toutes les
 * actions/Sécurité/Configuration), recherche + plage de dates, export CSV/PDF.
 * Pas de sous-onglets « Impressions »/« Synchronisation offline » ni de colonne
 * « Résultat » (succès/échec) — aucune entrée PlatformAuditLog ne peut jamais s'y
 * rattacher pour un pressing, voir CLAUDE.md pour le détail de cette décision.
 */
function AuditTab({ pressingId }: { pressingId: number }) {
    const { dateTime } = useFormat();
    const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<PlatformAuditLog>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [category, setCategory] = useState<AuditCategory>('');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);

    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput), 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    function buildParams(withPage: boolean): URLSearchParams {
        const params = new URLSearchParams({ pressing_id: String(pressingId) });
        if (withPage) params.set('page', String(page));
        if (category) params.set('category', category);
        if (search) params.set('search', search);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        return params;
    }

    useEffect(() => {
        setLoading(true);
        platformApi
            .get<Paginated<PlatformAuditLog>>(`/audit-logs?${buildParams(true)}`)
            .then((res) => {
                setLogs(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pressingId, page, category, search, from, to]);

    async function exportAs(format: 'csv' | 'pdf') {
        setExporting(format);
        try {
            const blob = await platformApi.blob(`/audit-logs/export/${format}?${buildParams(false)}`);
            downloadBlob(blob, `audit-pressing-${pressingId}.${format}`);
        } finally {
            setExporting(null);
        }
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
                {([
                    ['', 'Toutes les actions'],
                    ['security', 'Sécurité'],
                    ['configuration', 'Configuration'],
                ] as [AuditCategory, string][]).map(([key, labelText]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => {
                            setPage(1);
                            setCategory(key);
                        }}
                        className={cx(
                            'rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
                            category === key
                                ? 'bg-brand-600 text-white dark:bg-brand-500'
                                : 'bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700',
                        )}
                    >
                        {labelText}
                    </button>
                ))}
            </div>

            <div className={cx(card, 'flex flex-wrap items-end gap-3 p-4')}>
                <label className="min-w-[200px] flex-1 text-sm">
                    <span className="mb-1 block font-medium text-ink-700 dark:text-ink-200">Recherche</span>
                    <span className="relative block">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                        <input
                            value={searchInput}
                            onChange={(e) => {
                                setPage(1);
                                setSearchInput(e.target.value);
                            }}
                            placeholder="Action ou acteur…"
                            className={cx(input, 'pl-9')}
                        />
                    </span>
                </label>
                <label className="text-sm">
                    <span className="mb-1 block font-medium text-ink-700 dark:text-ink-200">Du</span>
                    <input
                        type="date"
                        value={from}
                        onChange={(e) => {
                            setPage(1);
                            setFrom(e.target.value);
                        }}
                        className={input}
                    />
                </label>
                <label className="text-sm">
                    <span className="mb-1 block font-medium text-ink-700 dark:text-ink-200">Au</span>
                    <input
                        type="date"
                        value={to}
                        onChange={(e) => {
                            setPage(1);
                            setTo(e.target.value);
                        }}
                        className={input}
                    />
                </label>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => exportAs('csv')} disabled={exporting !== null} className={button('secondary', 'sm')}>
                        <Download aria-hidden="true" className="h-4 w-4" />
                        {exporting === 'csv' ? 'Export…' : 'CSV'}
                    </button>
                    <button type="button" onClick={() => exportAs('pdf')} disabled={exporting !== null} className={button('secondary', 'sm')}>
                        <Download aria-hidden="true" className="h-4 w-4" />
                        {exporting === 'pdf' ? 'Export…' : 'PDF'}
                    </button>
                </div>
            </div>

            {loading ? (
                <LoadingState />
            ) : logs.length === 0 ? (
                <EmptyState icon={ScrollText} title="Aucune activité enregistrée" />
            ) : (
                <div className={cx(card, 'overflow-hidden')}>
                    <div className="overflow-x-auto">
                        <div className="min-w-[760px]">
                            <div
                                role="row"
                                className="flex items-center gap-4 border-b border-ink-100 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400"
                            >
                                <span className="flex-1">Action</span>
                                <span className="w-44 shrink-0">Acteur · Rôle</span>
                                <span className="w-24 shrink-0">Ressource</span>
                                <span className="w-36 shrink-0">Date</span>
                                <span className="w-32 shrink-0">Adresse IP</span>
                            </div>
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {logs.map((log) => (
                                    <li key={log.id} role="row" className="flex items-center gap-4 px-5 py-3.5 text-sm">
                                        <span className="flex-1 truncate font-semibold text-ink-900 dark:text-ink-50">{describeActivity(log)}</span>
                                        <span className="w-44 shrink-0 truncate text-ink-600 dark:text-ink-300">
                                            {log.platform_user?.name ?? 'Système'}
                                            {log.platform_user?.platform_role && (
                                                <span className="text-ink-400 dark:text-ink-500"> · {log.platform_user.platform_role.name}</span>
                                            )}
                                        </span>
                                        <span className="w-24 shrink-0 text-ink-500 dark:text-ink-400">
                                            {log.auditable_type.split('\\').pop()}
                                        </span>
                                        <span className="w-36 shrink-0 text-ink-500 dark:text-ink-400">{dateTime(log.created_at)}</span>
                                        <span className="w-32 shrink-0 font-mono text-xs text-ink-500 dark:text-ink-400">
                                            {log.ip_address ?? '—'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    <Pagination meta={meta} onPageChange={setPage} />
                </div>
            )}
        </div>
    );
}

/** Barre de consommation réelle (agences/utilisateurs vs limite du plan) — jamais
 * affichée sans une vraie limite (voir OverviewTab, appel conditionnel). */
function QuotaBar({ label: quotaLabel, used, limit }: { label: string; used: number; limit: number }) {
    const percent = Math.min(100, Math.round((used / limit) * 100));
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-ink-700 dark:text-ink-200">{quotaLabel}</span>
                <span className="font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                    {used} / {limit}
                </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div
                    className={cx('h-full rounded-full', percent >= 100 ? 'bg-red-500' : percent >= 80 ? 'bg-amber-500' : 'bg-brand-600')}
                    style={{ width: `${percent}%` }}
                />
            </div>
        </div>
    );
}

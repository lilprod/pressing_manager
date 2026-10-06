import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
    ArrowLeft,
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

type Tab = 'overview' | 'agencies' | 'users' | 'license' | 'audit';

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

export default function PressingDetailPage() {
    const { id } = useParams<{ id: string }>();
    const [pressing, setPressing] = useState<Pressing | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [tab, setTab] = useState<Tab>('overview');
    const [renewing, setRenewing] = useState(false);

    function reload() {
        if (!id) return;
        platformApi
            .get<Pressing>(`/pressings/${id}`)
            .then(setPressing)
            .catch((err) => {
                if (err instanceof PlatformApiError && err.status === 403) setNotFound(true);
                else if (err instanceof PlatformApiError && err.status === 404) setNotFound(true);
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [id]);

    async function toggleStatus() {
        if (!pressing) return;
        const action = pressing.status === 'active' ? 'suspend' : 'reactivate';
        const updated = await platformApi.post<Pressing>(`/pressings/${pressing.id}/${action}`);
        setPressing((prev) => (prev ? { ...prev, status: updated.status } : prev));
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

    return (
        <div className="space-y-6">
            <Link to="/superadmin/pressings" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                Retour aux pressings
            </Link>

            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3.5">
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                        <Building2 aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="truncate font-display text-2xl font-bold text-ink-900 dark:text-white">{pressing.name}</h1>
                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">
                            {pressing.code} · {pressing.country_code ?? '—'} · {pressing.platform_plan?.name ?? '—'}
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={pressing.status === 'active' ? 'emerald' : 'neutral'}>{pressing.status === 'active' ? 'Actif' : 'Suspendu'}</Pill>
                    <button type="button" onClick={() => void toggleStatus()} className={button('ghost', 'sm')}>
                        <Power aria-hidden="true" className="h-4 w-4" />
                        {pressing.status === 'active' ? 'Suspendre' : 'Réactiver'}
                    </button>
                    <Link to={`/superadmin/pressings/${pressing.id}/edit`} className={button('secondary', 'sm')}>
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                        Modifier
                    </Link>
                </div>
            </header>

            <div className="flex flex-wrap gap-2 border-b border-ink-200/80 pb-px dark:border-ink-800">
                {([
                    ['overview', "Vue d'ensemble"],
                    ['agencies', 'Agences'],
                    ['users', 'Utilisateurs transverses'],
                    ['license', 'Licence'],
                    ['audit', 'Audit'],
                ] as [Tab, string][]).map(([key, labelText]) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={cx(
                            'rounded-t-lg px-3.5 py-2 text-sm font-semibold transition',
                            tab === key
                                ? 'border-b-2 border-brand-600 text-brand-700 dark:border-brand-400 dark:text-brand-300'
                                : 'text-ink-600 hover:text-ink-900 dark:text-ink-350 dark:hover:text-white',
                        )}
                    >
                        {labelText}
                    </button>
                ))}
            </div>

            {tab === 'overview' && <OverviewTab pressing={pressing} onViewAudit={() => setTab('audit')} />}
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

function OverviewTab({ pressing, onViewAudit }: { pressing: Pressing; onViewAudit: () => void }) {
    const { dateTime } = useFormat();
    const [recentAudit, setRecentAudit] = useState<PlatformAuditLog[]>([]);

    useEffect(() => {
        platformApi
            .get<Paginated<PlatformAuditLog>>(`/audit-logs?pressing_id=${pressing.id}&per_page=5`)
            .then((res) => setRecentAudit(res.data));
    }, [pressing.id]);

    const daysRemaining = pressing.license?.days_remaining ?? null;
    const plan = pressing.platform_plan;

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3">
                <StatCard label="Agences" value={pressing.agencies_count} icon={Building2} tone="brand" />
                <StatCard label="Utilisateurs" value={pressing.users_count} icon={UsersRound} tone="sky" hint="Au dernier rapport reçu" />
                <StatCard
                    label="Licence"
                    value={daysRemaining !== null ? `${daysRemaining} j` : '—'}
                    icon={CreditCard}
                    tone={daysRemaining !== null && daysRemaining < 30 ? 'amber' : 'emerald'}
                    hint={pressing.license ? pressing.license.status : undefined}
                />
            </div>

            {/* Chantier « Re-audit Pressing — quotas de licence » (CLAUDE.md) : barre de
                consommation réelle, affichée seulement si le plan a réellement une limite
                — jamais un « illimité » fabriqué quand le plan n'en précise pas. */}
            {plan && (plan.agencies_limit !== null || plan.users_limit !== null || plan.storage_limit_gb !== null) && (
                <section aria-labelledby="pressing-quotas" className={cx(card, 'space-y-3 p-5 sm:p-6')}>
                    <h2 id="pressing-quotas" className="font-display text-base font-bold text-ink-900 dark:text-ink-50">
                        Quotas du plan
                    </h2>
                    <div className="space-y-3">
                        {plan.agencies_limit !== null && (
                            <QuotaBar label="Agences" used={pressing.agencies_count} limit={plan.agencies_limit} />
                        )}
                        {plan.users_limit !== null && (
                            <QuotaBar label="Utilisateurs" used={pressing.users_count} limit={plan.users_limit} />
                        )}
                    </div>
                    {plan.storage_limit_gb !== null && (
                        <p className="text-sm text-ink-600 dark:text-ink-350">
                            Stockage inclus : <span className="font-semibold text-ink-900 dark:text-ink-50">{plan.storage_limit_gb} Go</span>
                            {' '}— aucune mesure de consommation réelle n'existe dans l'app (uploads ponctuels uniquement).
                        </p>
                    )}
                </section>
            )}

            <section aria-labelledby="pressing-recent-audit" className={cx(card, 'p-5 sm:p-6')}>
                <div className="mb-3 flex items-center justify-between">
                    <h2 id="pressing-recent-audit" className="font-display text-base font-bold text-ink-900 dark:text-ink-50">
                        Activité récente
                    </h2>
                    <button type="button" onClick={onViewAudit} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                        Voir tout
                    </button>
                </div>
                {recentAudit.length === 0 ? (
                    <p className="text-sm text-ink-600 dark:text-ink-350">Aucune activité enregistrée.</p>
                ) : (
                    <ul className="space-y-2">
                        {recentAudit.map((log) => (
                            <li key={log.id} className="flex items-center justify-between gap-2 text-sm">
                                <span className="text-ink-800 dark:text-ink-100">{describeActivity(log)}</span>
                                <span className="shrink-0 text-xs text-ink-500 dark:text-ink-400">{dateTime(log.created_at)}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </section>
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

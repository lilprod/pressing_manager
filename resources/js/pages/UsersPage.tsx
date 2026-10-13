import { useEffect, useRef, useState } from 'react';
import { Copy, History, ImageUp, KeyRound, LogIn, Mail, Pencil, Power, Search, Send, ShieldCheck, TriangleAlert, Upload, UserCog, UserPlus, UsersRound, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import { useFormat } from '../lib/format';
import PageHeader, { Avatar } from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import { ChipToggle, SectionCard, StatCard } from '../components/ui/Metrics';
import Pagination from '../components/ui/Pagination';
import { Pill } from '../components/ui/StatusBadge';
import { button, card, cx, iconButton, input, label, select } from '../components/ui/styles';
import type { Paginated, Role, User } from '../types';

/* Écran « Équipe & rôles » (captures Figma « Équipe-roles », audit du 2026-10-13) :
 * KPI réels (GET /users/stats), onglets Utilisateurs / Invitations / Activité récente /
 * Accès multi-agence, recherche + filtres agence/rôle/statut côté serveur, filtre de
 * dernière connexion (jour/semaine/mois), taux MFA, import CSV tout-ou-rien, panneau
 * d'invitation avec affectations multi-agences et exigence MFA. L'activité récente
 * provient du journal des connexions (auth_events). */

/** Permissions jugées sensibles : signalées à l'invitation (caisse, comptes, droits, paramétrage). */
const SENSITIVE_PERMISSIONS = ['payments.manage', 'users.manage', 'agencies.manage', 'invoices.manage', 'audit.view'];

type DirectoryUser = User & { last_active_at?: string | null };
type Tab = 'users' | 'invitations' | 'activity' | 'multi';
type LoginPeriod = '' | 'today' | 'week' | 'month';

interface TeamStats {
    active_count: number;
    new_this_month: number;
    managers_count: number;
    multi_agency_count: number;
    pending_invitations: number;
    invitations_expiring_soon: number;
    logins_today: number;
    mfa_enabled_count: number;
}

interface TeamEvent {
    id: number;
    type: string;
    user: { id: number; name: string } | null;
    actor: { id: number; name: string } | null;
    device: string | null;
    meta: Record<string, unknown> | null;
    created_at: string;
}

function splitName(name: string): [string, string] {
    const [first, ...rest] = name.split(' ');
    return [first ?? '', rest.join(' ')];
}

export default function UsersPage() {
    const { t } = useI18n();
    const { user: me, activeAgencyId, agencies } = useAuth();
    const [users, setUsers] = useState<DirectoryUser[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<User>, 'current_page' | 'last_page' | 'total'>>({ current_page: 1, last_page: 1, total: 0 });
    const [page, setPage] = useState(1);
    const [tab, setTab] = useState<Tab>('users');
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [agencyFilter, setAgencyFilter] = useState<number | ''>('');
    const [statusFilter, setStatusFilter] = useState('');
    const [loginPeriod, setLoginPeriod] = useState<LoginPeriod>('');
    const [roles, setRoles] = useState<Role[]>([]);
    const [stats, setStats] = useState<TeamStats | null>(null);
    const [events, setEvents] = useState<TeamEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [importErrors, setImportErrors] = useState<{ row: number; field: string; message: string }[]>([]);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [temporaryPassword, setTemporaryPassword] = useState<{ email: string; password: string } | null>(null);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const importRef = useRef<HTMLInputElement>(null);

    function scope(): URLSearchParams {
        const params = new URLSearchParams();
        const agency = agencyFilter || activeAgencyId;
        if (agency) params.set('agency_id', String(agency));
        return params;
    }

    function reload() {
        const params = scope();
        params.set('full', '1');
        params.set('page', String(page));
        if (roleFilter) params.set('role', roleFilter);
        if (search) params.set('search', search);
        if (loginPeriod) params.set('login_period', loginPeriod);
        if (tab === 'invitations') params.set('status', 'pending');
        else if (statusFilter) params.set('status', statusFilter);
        Promise.all([
            api.get<Paginated<DirectoryUser>>(`/users?${params}`),
            api.get<Role[]>('/roles'),
            api.get<TeamStats>(`/users/stats?${scope()}`),
            api.get<TeamEvent[]>(`/users/activity?${scope()}`),
        ])
            .then(([usersRes, rolesRes, statsRes, eventsRes]) => {
                setUsers(tab === 'multi' ? usersRes.data.filter((u) => u.agency_id === null || (u.extra_agencies ?? []).length > 0) : usersRes.data);
                setMeta({ current_page: usersRes.current_page, last_page: usersRes.last_page, total: usersRes.total });
                setRoles(rolesRes);
                setStats(statsRes);
                setEvents(eventsRes);
            })
            .catch((err) => setError(err instanceof ApiError ? err.message : t('common.error')))
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        const timeout = setTimeout(reload, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeAgencyId, page, roleFilter, search, agencyFilter, statusFilter, loginPeriod, tab]);
    useEffect(() => setPage(1), [activeAgencyId, roleFilter, search, agencyFilter, statusFilter, loginPeriod, tab]);

    function focusPanel(target: User | null) {
        setEditingUser(target);
        requestAnimationFrame(() => {
            panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            panelRef.current?.querySelector<HTMLInputElement>('input[name="email"]')?.focus({ preventScroll: true });
        });
    }

    async function run(action: () => Promise<void>) {
        setError(null);
        setFeedback(null);
        try {
            await action();
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    async function importCsv(file: File) {
        setImportErrors([]);
        await run(async () => {
            const formData = new FormData();
            formData.append('file', file);
            try {
                const result = await api.postForm<{ created: number }>('/users/import', formData);
                setFeedback(t('users.import.done', { count: result.created }));
            } catch (err) {
                if (err instanceof ApiError && err.status === 422) {
                    const rows = err.errors as unknown;
                    if (Array.isArray(rows)) setImportErrors(rows as { row: number; field: string; message: string }[]);
                }
                throw err;
            }
        });
    }

    const staffRoles = roles.filter((r) => r.slug !== 'client');
    const mfaRate = stats && stats.active_count > 0 ? Math.round((stats.mfa_enabled_count / stats.active_count) * 100) : 0;

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('users.title')}
                subtitle={t('users.subtitle')}
                icon={UsersRound}
                actions={
                    <>
                        <button type="button" onClick={() => importRef.current?.click()} className={button('secondary', 'md', 'h-10')}>
                            <Upload aria-hidden="true" className="h-4 w-4" />
                            {t('users.import.action')}
                        </button>
                        <input
                            ref={importRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="sr-only"
                            aria-label={t('users.import.action')}
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void importCsv(file);
                                e.target.value = '';
                            }}
                        />
                        <button type="button" onClick={() => focusPanel(null)} className={button('primary', 'md', 'h-10')}>
                            <UserPlus aria-hidden="true" className="h-4 w-4" />
                            {t('users.invite')}
                        </button>
                    </>
                }
            />

            {temporaryPassword && <TemporaryPasswordBanner email={temporaryPassword.email} password={temporaryPassword.password} onDismiss={() => setTemporaryPassword(null)} />}
            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}
            {importErrors.length > 0 && (
                <Alert tone="warning">
                    <p className="font-semibold">{t('users.import.errors')}</p>
                    <ul className="mt-1 list-disc pl-5 text-xs">
                        {importErrors.map((e, i) => (
                            <li key={i}>{t('users.import.rowError', { row: e.row, field: e.field, message: e.message })}</li>
                        ))}
                    </ul>
                    <p className="mt-1 text-xs">{t('users.import.format')}</p>
                </Alert>
            )}

            {stats && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard label={t('users.stats.active')} value={stats.active_count} icon={UsersRound} tone="brand" hint={t('users.stats.newThisMonth', { count: stats.new_this_month })} />
                    <StatCard label={t('users.stats.managers')} value={stats.managers_count} icon={UserCog} tone="accent" hint={t('users.stats.multiAgency', { count: stats.multi_agency_count })} />
                    <StatCard label={t('users.stats.invitations')} value={stats.pending_invitations} icon={Mail} tone="rose" hint={t('users.stats.expiringSoon', { count: stats.invitations_expiring_soon })} />
                    <StatCard
                        label={t('users.stats.loginsToday')}
                        value={stats.logins_today}
                        icon={LogIn}
                        tone="emerald"
                        hint={t('users.stats.ofTeam', { percent: stats.active_count > 0 ? Math.round((stats.logins_today / stats.active_count) * 100) : 0 })}
                    />
                </div>
            )}

            <div className={cx(card, 'space-y-3 p-4 sm:p-5')}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h2 className="font-display text-base font-bold text-ink-900 dark:text-ink-50">{t('users.directory')}</h2>
                        <p className="text-xs text-ink-600 dark:text-ink-350">{t('users.directoryHint')}</p>
                    </div>
                    <Pill tone={mfaRate >= 80 ? 'emerald' : 'amber'} icon={ShieldCheck}>
                        {t('users.mfaRate', { percent: mfaRate })}
                    </Pill>
                </div>
                <div role="tablist" className="flex flex-wrap gap-1 border-b border-ink-200/80 dark:border-ink-800">
                    {(['users', 'invitations', 'activity', 'multi'] as Tab[]).map((key) => (
                        <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={tab === key}
                            onClick={() => setTab(key)}
                            className={cx(
                                '-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition',
                                tab === key ? 'border-brand-600 text-brand-800 dark:border-brand-400 dark:text-brand-200' : 'border-transparent text-ink-600 hover:text-ink-900 dark:text-ink-350',
                            )}
                        >
                            {t(`users.tabs.${key}`)}
                        </button>
                    ))}
                </div>
                {tab !== 'activity' && (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
                        <label className="relative block">
                            <span className="sr-only">{t('users.search')}</span>
                            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('users.search')} className={cx(input, 'pl-9')} />
                        </label>
                        <select value={agencyFilter} onChange={(e) => setAgencyFilter(e.target.value ? Number(e.target.value) : '')} className={select} aria-label={t('users.agency')}>
                            <option value="">{t('nav.allAgencies')}</option>
                            {agencies.map((a) => (
                                <option key={a.id} value={a.id}>
                                    {a.name}
                                </option>
                            ))}
                        </select>
                        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={select} aria-label={t('users.filterRole')}>
                            <option value="">{t('users.allRoles')}</option>
                            {staffRoles.map((r) => (
                                <option key={r.id} value={r.slug}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={tab === 'invitations'} className={select} aria-label={t('common.status')}>
                            <option value="">{t('users.allStatuses')}</option>
                            <option value="active">{t('users.active')}</option>
                            <option value="inactive">{t('users.inactive')}</option>
                            <option value="pending">{t('users.pendingInvitation')}</option>
                        </select>
                    </div>
                )}
                {tab !== 'activity' && (
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-ink-600 dark:text-ink-350">{t('users.loginPeriod')}</span>
                        {(['today', 'week', 'month'] as const).map((p) => (
                            <ChipToggle key={p} active={loginPeriod === p} onClick={() => setLoginPeriod(loginPeriod === p ? '' : p)}>
                                {t(`client.filter.activity.${p}`)}
                            </ChipToggle>
                        ))}
                    </div>
                )}
            </div>

            {loading ? (
                <LoadingState />
            ) : (
                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
                    <div className="min-w-0 space-y-6">
                        {tab === 'activity' ? (
                            <ActivityList events={events} />
                        ) : (
                            <section aria-labelledby="users-directory" className={cx(card, 'min-w-0 overflow-hidden')}>
                                <h2 id="users-directory" className="sr-only">
                                    {t('users.directory')}
                                </h2>
                                {users.length === 0 ? (
                                    <EmptyState icon={UsersRound} title={t('users.none')} />
                                ) : (
                                    <div className="relative overflow-x-auto">
                                        <table className="w-full min-w-[900px] table-fixed text-left text-sm">
                                            <thead className="border-b border-ink-200/80 bg-ink-50 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                                                <tr>
                                                    <th scope="col" className="w-[26%] px-5 py-2.5">{t('users.table.user')}</th>
                                                    <th scope="col" className="w-[14%] px-3 py-2.5">{t('users.role')}</th>
                                                    <th scope="col" className="w-[15%] px-3 py-2.5">{t('users.agency')}</th>
                                                    <th scope="col" className="w-[15%] px-3 py-2.5">{t('common.status')}</th>
                                                    <th scope="col" className="w-[14%] px-3 py-2.5">{t('users.table.lastLogin')}</th>
                                                    <th scope="col" className="w-[16%] px-4 py-2.5 text-right">
                                                        <span className="sr-only">{t('users.table.actions')}</span>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                                {users.map((u) => (
                                                    <UserRow
                                                        key={u.id}
                                                        user={u}
                                                        isMe={u.id === me?.id}
                                                        selected={editingUser?.id === u.id}
                                                        onEdit={() => focusPanel(u)}
                                                        onReset={() =>
                                                            void run(async () => {
                                                                const r = await api.post<{ temporary_password: string }>(`/users/${u.id}/reset-password`);
                                                                setTemporaryPassword({ email: u.email, password: r.temporary_password });
                                                            })
                                                        }
                                                        onToggle={() => void run(async () => { await api.patch(`/users/${u.id}`, { is_active: !u.is_active }); })}
                                                        onResendInvitation={() =>
                                                            void run(async () => {
                                                                const r = await api.post<{ temporary_password: string }>(`/users/${u.id}/invitation`);
                                                                setTemporaryPassword({ email: u.email, password: r.temporary_password });
                                                            })
                                                        }
                                                        onRevokeInvitation={() => void run(async () => { await api.delete(`/users/${u.id}/invitation`); })}
                                                    />
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                <Pagination meta={meta} onPageChange={setPage} />
                            </section>
                        )}
                        {tab !== 'activity' && <ActivityList events={events.slice(0, 5)} compact />}
                    </div>

                    <div ref={panelRef} className="min-w-0 scroll-mt-24 lg:sticky lg:top-24">
                        <UserPanel
                            key={editingUser?.id ?? 'new'}
                            editing={editingUser}
                            roles={staffRoles}
                            onCancelEdit={() => setEditingUser(null)}
                            onCreated={(email, password) => {
                                setTemporaryPassword({ email, password });
                                reload();
                            }}
                            onSaved={() => {
                                setEditingUser(null);
                                reload();
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function ActivityList({ events, compact = false }: { events: TeamEvent[]; compact?: boolean }) {
    const { t } = useI18n();
    const { dateTime } = useFormat();
    return (
        <SectionCard id={compact ? 'team-activity-compact' : 'team-activity'} title={t('users.activity.title')} subtitle={t('users.activity.subtitle')}>
            {events.length === 0 ? (
                <p className="text-sm text-ink-600 dark:text-ink-350">{t('users.activity.empty')}</p>
            ) : (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                    {events.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                            <History aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-500" />
                            <span className="min-w-0 flex-1 text-ink-800 dark:text-ink-100">
                                {t(`users.activity.type.${e.type}`, {
                                    user: e.user?.name ?? '—',
                                    actor: e.actor?.name ?? t('order.audit.systemActor'),
                                    device: e.device ?? '—',
                                })}
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-ink-500 dark:text-ink-400">{dateTime(e.created_at)}</span>
                        </li>
                    ))}
                </ul>
            )}
        </SectionCard>
    );
}

function UserRow({
    user: u,
    isMe,
    selected,
    onEdit,
    onReset,
    onToggle,
    onResendInvitation,
    onRevokeInvitation,
}: {
    user: DirectoryUser;
    isMe: boolean;
    selected: boolean;
    onEdit: () => void;
    onReset: () => void;
    onToggle: () => void;
    onResendInvitation: () => void;
    onRevokeInvitation: () => void;
}) {
    const { t } = useI18n();
    const { dateTime } = useFormat();
    const [first, last] = splitName(u.name);
    const pending = !!u.invitation_expires_at && !u.last_login_at && u.is_active;
    const extra = u.extra_agencies ?? [];

    return (
        <tr className={cx(selected && 'bg-brand-50/60 dark:bg-brand-400/5')}>
            <td className="px-5 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <Avatar firstName={first} lastName={last} photoUrl={u.photo_url} size="sm" />
                    <div className="min-w-0">
                        <p className="break-words font-semibold leading-snug text-ink-900 dark:text-ink-50">
                            {u.name}
                            {isMe && <span className="ml-1.5 text-xs font-medium text-ink-500 dark:text-ink-400">({t('users.you')})</span>}
                        </p>
                        <p className="truncate text-xs text-ink-600 dark:text-ink-350">{u.email}</p>
                    </div>
                </div>
            </td>
            <td className="px-3 py-3">
                <Pill tone={u.role?.scope === 'global' ? 'brand' : 'neutral'} className="max-w-full whitespace-normal">{u.role?.name}</Pill>
            </td>
            <td className="break-words px-3 py-3 text-ink-700 dark:text-ink-200">
                {u.agency?.name ?? <span className="text-ink-500 dark:text-ink-400">{t('users.allAgencies')}</span>}
                {extra.length > 0 && <span className="ml-1 text-xs font-semibold text-brand-700 dark:text-brand-300" title={extra.map((a) => a.name).join(', ')}>+{extra.length}</span>}
            </td>
            <td className="px-3 py-3">
                <div className="flex flex-col items-start gap-1">
                    {pending ? (
                        <Pill tone="amber" icon={Mail}>{t('users.pendingInvitation')}</Pill>
                    ) : u.is_active ? (
                        <Pill tone="emerald">{t('users.active')}</Pill>
                    ) : (
                        <Pill tone="rose">{t('users.inactive')}</Pill>
                    )}
                    {u.mfa_enabled && <Pill tone="brand" icon={ShieldCheck}>MFA</Pill>}
                    {u.password_expired && (
                        <Pill tone="amber" icon={TriangleAlert}>
                            {t('users.passwordExpired')}
                        </Pill>
                    )}
                </div>
            </td>
            <td className="px-3 py-3 text-xs text-ink-600 dark:text-ink-350">{u.last_login_at ? dateTime(u.last_login_at) : t('users.never')}</td>
            <td className="px-4 py-3">
                <div className="flex justify-end gap-0.5">
                    {pending && (
                        <>
                            <button type="button" onClick={onResendInvitation} className={cx(iconButton, 'h-8 w-8')} aria-label={t('users.resendInvitation')} title={t('users.resendInvitation')}>
                                <Send aria-hidden="true" className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={onRevokeInvitation} className={cx(iconButton, 'h-8 w-8 text-red-700 dark:text-red-300')} aria-label={t('users.revokeInvitation')} title={t('users.revokeInvitation')}>
                                <X aria-hidden="true" className="h-4 w-4" />
                            </button>
                        </>
                    )}
                    <button type="button" onClick={onEdit} className={cx(iconButton, 'h-8 w-8')} aria-label={t('users.editNamed', { name: u.name })} title={t('common.edit')}>
                        <Pencil aria-hidden="true" className="h-4 w-4" />
                    </button>
                    <button
                        type="button"
                        onClick={onReset}
                        className={cx(iconButton, 'h-8 w-8')}
                        aria-label={t('users.resetNamed', { name: u.name })}
                        title={t('users.resetPassword')}
                    >
                        <KeyRound aria-hidden="true" className="h-4 w-4" />
                    </button>
                    {!isMe && (
                        <button
                            type="button"
                            onClick={onToggle}
                            className={cx(iconButton, 'h-8 w-8', u.is_active ? 'text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-400/10' : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300')}
                            aria-label={u.is_active ? t('users.deactivateNamed', { name: u.name }) : t('users.activateNamed', { name: u.name })}
                            title={u.is_active ? t('users.deactivate') : t('users.activate')}
                        >
                            <Power aria-hidden="true" className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
}

function TemporaryPasswordBanner({ email, password, onDismiss }: { email: string; password: string; onDismiss: () => void }) {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);

    async function copy() {
        try {
            await navigator.clipboard.writeText(password);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Presse-papiers indisponible : le mot de passe reste affichable et sélectionnable manuellement.
        }
    }

    return (
        <Alert tone="success">
            <div className="space-y-2">
                <p className="font-semibold">{t('users.temporaryPasswordFor', { email })}</p>
                <p className="text-xs">{t('users.temporaryPasswordHint')}</p>
                <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-lg bg-white/70 px-3 py-1.5 font-mono text-sm dark:bg-black/20">{password}</code>
                    <button type="button" onClick={() => void copy()} className={button('secondary', 'sm')}>
                        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                        {copied ? t('common.copied') : t('common.copy')}
                    </button>
                    <button type="button" onClick={onDismiss} className={button('ghost', 'sm')}>
                        {t('common.close')}
                    </button>
                </div>
            </div>
        </Alert>
    );
}

/** Panneau latéral « Création d'utilisateur » de la maquette, qui sert aussi à l'édition. */
function UserPanel({
    editing,
    roles,
    onCancelEdit,
    onCreated,
    onSaved,
}: {
    editing: User | null;
    roles: Role[];
    onCancelEdit: () => void;
    onCreated: (email: string, password: string) => void;
    onSaved: () => void;
}) {
    const { t } = useI18n();
    const { agencies, user: me } = useAuth();
    const [name, setName] = useState(editing?.name ?? '');
    const [email, setEmail] = useState(editing?.email ?? '');
    const [phone, setPhone] = useState(editing?.phone ?? '');
    const [roleId, setRoleId] = useState<number | ''>(editing?.role?.id ?? '');
    const [agencyId, setAgencyId] = useState<number | ''>(editing?.agency_id ?? '');
    const [extraAgencyIds, setExtraAgencyIds] = useState<number[]>((editing?.extra_agencies ?? []).map((a) => a.id));
    const [mfaRequired, setMfaRequired] = useState(editing?.mfa_required ?? false);
    const [jobTitle, setJobTitle] = useState(editing?.job_title ?? '');
    const [employeeNumber, setEmployeeNumber] = useState(editing?.employee_number ?? '');
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const selectedRole = roles.find((r) => r.id === roleId);
    const needsAgencyPicker = me?.agency_id === null && !!selectedRole && selectedRole.scope !== 'global';
    const photoPreview = photoFile ? URL.createObjectURL(photoFile) : editing?.photo_url ?? null;
    const [first, last] = splitName(name);

    const effectiveAgency = needsAgencyPicker ? agencyId : me?.agency_id ?? '';
    const canHaveExtra = !!selectedRole && selectedRole.scope !== 'global';
    const sensitive = (selectedRole?.permissions ?? []).filter((p) => SENSITIVE_PERMISSIONS.includes(p.slug));

    async function submit(sendInvitation = true) {
        setBusy(true);
        setError(null);
        try {
            if (editing) {
                await api.patch(`/users/${editing.id}`, {
                    name,
                    email,
                    phone: phone || null,
                    role_id: roleId,
                    agency_id: needsAgencyPicker && agencyId ? agencyId : undefined,
                    extra_agency_ids: canHaveExtra ? extraAgencyIds.filter((id) => id !== effectiveAgency) : [],
                    mfa_required: mfaRequired,
                    job_title: jobTitle || null,
                    employee_number: employeeNumber || null,
                });
                if (photoFile) {
                    const formData = new FormData();
                    formData.append('photo', photoFile);
                    await api.postForm(`/users/${editing.id}/photo`, formData);
                }
                onSaved();
            } else {
                const formData = new FormData();
                formData.append('name', name);
                formData.append('email', email);
                if (phone) formData.append('phone', phone);
                formData.append('role_id', String(roleId));
                if (needsAgencyPicker && agencyId) formData.append('agency_id', String(agencyId));
                if (photoFile) formData.append('photo', photoFile);
                if (canHaveExtra) extraAgencyIds.filter((id) => id !== effectiveAgency).forEach((id) => formData.append('extra_agency_ids[]', String(id)));
                formData.append('mfa_required', mfaRequired ? '1' : '0');
                formData.append('send_invitation', sendInvitation ? '1' : '0');
                if (jobTitle) formData.append('job_title', jobTitle);
                if (employeeNumber) formData.append('employee_number', employeeNumber);
                const result = await api.postForm<{ email: string; temporary_password: string }>('/users', formData);
                onCreated(result.email, result.temporary_password);
                setName('');
                setEmail('');
                setPhone('');
                setPhotoFile(null);
                setRoleId('');
                setAgencyId('');
            }
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name.trim() !== '' && email.trim() !== '' && roleId !== '' && (!needsAgencyPicker || agencyId !== '');

    return (
        <SectionCard
            id="user-panel-heading"
            title={editing ? t('users.editUser') : t('users.inviteMember')}
            subtitle={editing ? editing.email : t('users.newUserHint')}
            headerExtra={
                editing ? (
                    <button type="button" onClick={onCancelEdit} className={cx(iconButton, 'h-8 w-8')} aria-label={t('common.close')}>
                        <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                ) : undefined
            }
        >
            {error && <Alert tone="error">{error}</Alert>}

            <div className="flex items-center gap-3">
                <Avatar firstName={first || '?'} lastName={last} photoUrl={photoPreview} size="lg" />
                <label className={cx(button('secondary', 'sm'), 'cursor-pointer')}>
                    <ImageUp aria-hidden="true" className="h-4 w-4" />
                    {t('profile.photo')}
                    <input type="file" accept="image/*" aria-label={t('profile.photo')} onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} className="sr-only" />
                </label>
            </div>

            <label className="block">
                <span className={label}>{t('profile.name')}</span>
                <input name="name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </label>
            <label className="block">
                <span className={label}>{t('profile.email')}</span>
                <span className="relative block">
                    <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cx(input, 'pl-10')} />
                </span>
            </label>
            <label className="block">
                <span className={label}>{t('profile.phone')}</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
            </label>
            <label className="block">
                <span className={label}>{t('users.role')}</span>
                <select value={roleId} onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : '')} className={select}>
                    <option value="">{t('users.selectRole')}</option>
                    {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                            {r.name}
                        </option>
                    ))}
                </select>
            </label>
            {needsAgencyPicker && (
                <label className="block">
                    <span className={label}>{t('users.agency')}</span>
                    <select value={agencyId} onChange={(e) => setAgencyId(e.target.value ? Number(e.target.value) : '')} className={select}>
                        <option value="">{t('users.selectAgency')}</option>
                        {agencies.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.name}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-1">
                <label className="block">
                    <span className={label}>{t('profile.jobTitle')}</span>
                    <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={input} />
                </label>
                <label className="block">
                    <span className={label}>{t('users.employeeNumber')}</span>
                    <input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} className={input} />
                </label>
            </div>

            {canHaveExtra && agencies.length > 1 && (
                <fieldset className="space-y-1.5">
                    <legend className={label}>{t('users.multiAgency')}</legend>
                    {agencies
                        .filter((a) => a.id !== effectiveAgency)
                        .map((a) => (
                            <label key={a.id} className="flex items-center gap-2 text-sm text-ink-800 dark:text-ink-100">
                                <input
                                    type="checkbox"
                                    checked={extraAgencyIds.includes(a.id)}
                                    onChange={(e) => setExtraAgencyIds(e.target.checked ? [...extraAgencyIds, a.id] : extraAgencyIds.filter((id) => id !== a.id))}
                                    className="h-4 w-4 rounded border-ink-300"
                                />
                                {a.name}
                            </label>
                        ))}
                </fieldset>
            )}
            <label className="flex items-center gap-2 text-sm text-ink-800 dark:text-ink-100">
                <input type="checkbox" checked={mfaRequired} onChange={(e) => setMfaRequired(e.target.checked)} className="h-4 w-4 rounded border-ink-300" />
                {t('users.requireMfa')}
            </label>
            {sensitive.length > 0 && (
                <Alert tone="warning">
                    <p className="font-semibold">{t('users.sensitive', { count: sensitive.length })}</p>
                    <p className="text-xs">{sensitive.map((p) => p.name).join(' · ')}</p>
                </Alert>
            )}

            {!editing && <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">{t('users.invitationHint')}</p>}

            <div className="flex flex-wrap gap-2">
                {editing && (
                    <button type="button" onClick={onCancelEdit} className={button('ghost', 'md', 'flex-1')}>
                        {t('common.cancel')}
                    </button>
                )}
                <button type="button" onClick={() => void submit(true)} disabled={!canSubmit || busy} className={button('primary', 'md', 'flex-1')}>
                    {busy ? <Spinner className="h-4 w-4" /> : editing ? null : <Send aria-hidden="true" className="h-4 w-4" />}
                    {editing ? t('common.save') : t('users.sendInvitation')}
                </button>
            </div>
            {!editing && (
                <button type="button" onClick={() => void submit(false)} disabled={!canSubmit || busy} className={button('secondary', 'md', 'w-full')}>
                    <UserPlus aria-hidden="true" className="h-4 w-4" />
                    {t('users.createWithoutInvitation')}
                </button>
            )}
        </SectionCard>
    );
}

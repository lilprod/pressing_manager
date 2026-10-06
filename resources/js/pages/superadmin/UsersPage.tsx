import { useEffect, useRef, useState } from 'react';
import { Building2, Clock, Copy, KeyRound, Mail, Pencil, Power, ShieldAlert, ShieldCheck, UserPlus, UsersRound, X } from 'lucide-react';
import { useSuperadminAuth } from '../../contexts/SuperadminAuthContext';
import { useFormat } from '../../lib/format';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { Avatar } from '../../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { SectionCard, StatCard } from '../../components/ui/Metrics';
import Pagination from '../../components/ui/Pagination';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cx, iconButton, input, label, select } from '../../components/ui/styles';
import type { Paginated, PlatformAuditLog, PlatformRole, PlatformUser, Pressing } from '../../types';

/* Écran « Utilisateurs transverses » (Phase 2 de la plateforme superadmin, voir
 * CLAUDE.md § Plateforme superadmin). Mirrors resources/js/pages/UsersPage.tsx
 * (tenant) : liste + panneau latéral sticky pour créer/éditer. Le damier de
 * permissions est en LECTURE SEULE — il reflète ce que le rôle sélectionné
 * accorde, il n'existe pas de surcharge par utilisateur (décision actée dans le
 * plan de Phase 2, pour ne pas inventer un second mécanisme d'autorisation).
 * Pas d'i18n sur cette console (décision Phase 1, français uniquement). */

interface UserStats {
    total: number;
    mfa_enabled_pct: number;
    pending_setup_count: number;
    suspended_count: number;
}

function splitName(name: string): [string, string] {
    const [first, ...rest] = name.split(' ');
    return [first ?? '', rest.join(' ')];
}

function describeActivity(log: PlatformAuditLog): { text: string; tone: 'emerald' | 'rose' | 'neutral' } {
    if (log.action === 'login.success') return { text: 'Connexion réussie', tone: 'emerald' };
    if (log.action === 'login.failed') return { text: 'Tentative de connexion échouée', tone: 'rose' };
    if (log.action === 'login.locked') return { text: 'Compte verrouillé après 5 échecs', tone: 'rose' };
    if (log.action === 'platform_user.assignment_changed') return { text: 'Pressings affectés modifiés', tone: 'neutral' };
    if (log.action.endsWith('.created')) return { text: 'Compte créé', tone: 'emerald' };
    if (log.action.endsWith('.updated')) {
        const values = log.new_values ?? {};
        if ('platform_role_id' in values) return { text: 'Rôle modifié', tone: 'neutral' };
        if ('is_active' in values) return values.is_active ? { text: 'Compte réactivé', tone: 'emerald' } : { text: 'Compte suspendu', tone: 'rose' };
        if ('name' in values || 'email' in values) return { text: 'Informations modifiées', tone: 'neutral' };
        return { text: 'Compte modifié', tone: 'neutral' };
    }
    return { text: log.action, tone: 'neutral' };
}

export default function UsersPage() {
    const { user: me } = useSuperadminAuth();
    const [users, setUsers] = useState<PlatformUser[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<PlatformUser>, 'current_page' | 'last_page' | 'total'>>({ current_page: 1, last_page: 1, total: 0 });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [pressingFilter, setPressingFilter] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [securityFilter, setSecurityFilter] = useState('');
    const [roles, setRoles] = useState<PlatformRole[]>([]);
    const [pressings, setPressings] = useState<Pressing[]>([]);
    const [stats, setStats] = useState<UserStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [temporaryPassword, setTemporaryPassword] = useState<{ email: string; password: string } | null>(null);
    const [editingUser, setEditingUser] = useState<PlatformUser | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        if (pressingFilter) params.set('pressing_id', pressingFilter);
        if (roleFilter) params.set('platform_role_id', roleFilter);
        if (statusFilter) params.set('status', statusFilter);
        if (securityFilter) params.set('security', securityFilter);
        platformApi
            .get<Paginated<PlatformUser>>(`/users?${params}`)
            .then((res) => {
                setUsers(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .catch((err) => setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.'))
            .finally(() => setLoading(false));
    }

    function loadStats() {
        platformApi.get<UserStats>('/users/stats').then(setStats).catch(() => {});
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(reload, [page, pressingFilter, roleFilter, statusFilter, securityFilter]);

    useEffect(() => {
        setPage(1);
        const timeout = setTimeout(reload, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => {
        platformApi.get<PlatformRole[]>('/roles').then(setRoles);
        platformApi.get<Paginated<Pressing>>('/pressings?per_page=100').then((res) => setPressings(res.data));
        loadStats();
    }, []);

    function focusPanel(target: PlatformUser | null) {
        setEditingUser(target);
        requestAnimationFrame(() => {
            panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            panelRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus({ preventScroll: true });
        });
    }

    async function toggleActive(target: PlatformUser) {
        setError(null);
        try {
            await platformApi.patch(`/users/${target.id}`, { is_active: !target.is_active });
            reload();
            loadStats();
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        }
    }

    async function resetPassword(target: PlatformUser) {
        if (!window.confirm(`Réinitialiser le mot de passe de ${target.name} ? Un nouveau mot de passe temporaire sera généré.`)) {
            return;
        }
        setError(null);
        try {
            const result = await platformApi.post<{ temporary_password: string }>(`/users/${target.id}/reset-password`);
            setTemporaryPassword({ email: target.email, password: result.temporary_password });
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        }
    }

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3.5">
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                        <UsersRound aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="truncate font-display text-2xl font-bold text-ink-900 dark:text-white">Utilisateurs transverses</h1>
                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Équipe ADMIN ayant accès à la console plateforme.</p>
                    </div>
                </div>
                <button type="button" onClick={() => focusPanel(null)} className={button('primary', 'md')}>
                    <UserPlus aria-hidden="true" className="h-4 w-4" />
                    Nouvel utilisateur
                </button>
            </header>

            {stats && (
                <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:grid-cols-4">
                    <StatCard label="Utilisateurs transverses" value={stats.total} icon={UsersRound} tone="brand" />
                    <StatCard label="MFA activée" value={`${stats.mfa_enabled_pct}%`} icon={ShieldCheck} tone="emerald" />
                    <StatCard label="Invitations en attente" value={stats.pending_setup_count} icon={Mail} tone="amber" />
                    <StatCard label="Comptes suspendus" value={stats.suspended_count} icon={ShieldAlert} tone="rose" />
                </div>
            )}

            {temporaryPassword && (
                <TemporaryPasswordBanner email={temporaryPassword.email} password={temporaryPassword.password} onDismiss={() => setTemporaryPassword(null)} />
            )}
            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
                <section aria-labelledby="platform-users-directory" className={cx(card, 'min-w-0 overflow-hidden')}>
                    <div className="flex flex-wrap items-end gap-3 px-5 pb-4 pt-5 sm:px-6">
                        <div className="min-w-0 flex-1">
                            <h2 id="platform-users-directory" className="font-display text-base font-bold text-ink-900 dark:text-ink-50">
                                Annuaire
                            </h2>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{meta.total} utilisateur(s)</p>
                        </div>
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher un nom, un e-mail…"
                            className={cx(input, 'h-10 basis-full text-sm sm:w-56 sm:basis-auto')}
                        />
                        <select value={pressingFilter} onChange={(e) => setPressingFilter(e.target.value)} className={cx(select, 'h-10 text-sm')}>
                            <option value="">Tous les pressings</option>
                            {pressings.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={cx(select, 'h-10 text-sm')}>
                            <option value="">Tous les rôles</option>
                            {roles.map((r) => (
                                <option key={r.id} value={r.id}>
                                    {r.name}
                                </option>
                            ))}
                        </select>
                        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={cx(select, 'h-10 text-sm')}>
                            <option value="">Tous les statuts</option>
                            <option value="active">Actifs</option>
                            <option value="suspended">Suspendus</option>
                        </select>
                        <select value={securityFilter} onChange={(e) => setSecurityFilter(e.target.value)} className={cx(select, 'h-10 text-sm')}>
                            <option value="">MFA : indifférent</option>
                            <option value="mfa_on">MFA activée</option>
                            <option value="mfa_off">MFA non configurée</option>
                        </select>
                    </div>

                    {loading ? (
                        <LoadingState />
                    ) : users.length === 0 ? (
                        <EmptyState icon={UsersRound} title="Aucun utilisateur transverse" />
                    ) : (
                        <div className="relative overflow-x-auto">
                            <table className="w-full min-w-[760px] table-fixed text-left text-sm">
                                <thead className="border-y border-ink-200/80 bg-ink-50 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                                    <tr>
                                        <th scope="col" className="w-[28%] px-5 py-2.5 sm:px-6">Utilisateur</th>
                                        <th scope="col" className="w-[16%] px-3 py-2.5">Rôle</th>
                                        <th scope="col" className="w-[24%] px-3 py-2.5">Pressings affectés</th>
                                        <th scope="col" className="w-[14%] px-3 py-2.5">MFA</th>
                                        <th scope="col" className="w-[10%] px-3 py-2.5">Statut</th>
                                        <th scope="col" className="w-[8%] px-4 py-2.5 text-right">
                                            <span className="sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                    {users.map((u) => {
                                        const [first, last] = splitName(u.name);
                                        const isMe = u.id === me?.id;
                                        return (
                                            <tr key={u.id} className={cx(editingUser?.id === u.id && 'bg-brand-50/60 dark:bg-brand-400/5')}>
                                                <td className="px-5 py-3 sm:px-6">
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <Avatar firstName={first} lastName={last} size="sm" />
                                                        <div className="min-w-0">
                                                            <p className="break-words font-semibold leading-snug text-ink-900 dark:text-ink-50">
                                                                {u.name}
                                                                {isMe && <span className="ml-1.5 text-xs font-medium text-ink-500 dark:text-ink-400">(vous)</span>}
                                                            </p>
                                                            <p className="truncate text-xs text-ink-600 dark:text-ink-350">{u.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3">
                                                    <Pill tone={u.platform_role?.slug === 'superadmin' ? 'brand' : 'neutral'} className="max-w-full whitespace-normal">
                                                        {u.platform_role?.name ?? '—'}
                                                    </Pill>
                                                </td>
                                                <td className="px-3 py-3">
                                                    {u.platform_role?.slug === 'superadmin' ? (
                                                        <span className="text-xs text-ink-500 dark:text-ink-400">Tous (superadmin)</span>
                                                    ) : u.pressings && u.pressings.length > 0 ? (
                                                        <div className="flex flex-wrap gap-1">
                                                            {u.pressings.slice(0, 2).map((p) => (
                                                                <Pill key={p.id} tone="neutral" icon={Building2}>
                                                                    {p.name}
                                                                </Pill>
                                                            ))}
                                                            {u.pressings.length > 2 && (
                                                                <Pill tone="neutral">+{u.pressings.length - 2}</Pill>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-ink-500 dark:text-ink-400">Aucun</span>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3">
                                                    {u.totp_enabled_at ? (
                                                        <Pill tone="emerald" icon={ShieldCheck}>Activée</Pill>
                                                    ) : (
                                                        <Pill tone="amber" icon={ShieldAlert}>En attente</Pill>
                                                    )}
                                                </td>
                                                <td className="px-3 py-3">
                                                    {u.is_active ? <Pill tone="emerald">Actif</Pill> : <Pill tone="rose">Suspendu</Pill>}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-end gap-0.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => focusPanel(u)}
                                                            className={cx(iconButton, 'h-8 w-8')}
                                                            aria-label={`Modifier ${u.name}`}
                                                            title="Modifier"
                                                        >
                                                            <Pencil aria-hidden="true" className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void resetPassword(u)}
                                                            className={cx(iconButton, 'h-8 w-8')}
                                                            aria-label={`Réinitialiser le mot de passe de ${u.name}`}
                                                            title="Réinitialiser le mot de passe"
                                                        >
                                                            <KeyRound aria-hidden="true" className="h-4 w-4" />
                                                        </button>
                                                        {!isMe && (
                                                            <button
                                                                type="button"
                                                                onClick={() => void toggleActive(u)}
                                                                className={cx(
                                                                    iconButton,
                                                                    'h-8 w-8',
                                                                    u.is_active
                                                                        ? 'text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-300 dark:hover:bg-red-400/10'
                                                                        : 'text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300',
                                                                )}
                                                                aria-label={u.is_active ? `Suspendre ${u.name}` : `Réactiver ${u.name}`}
                                                                title={u.is_active ? 'Suspendre' : 'Réactiver'}
                                                            >
                                                                <Power aria-hidden="true" className="h-4 w-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <Pagination meta={meta} onPageChange={setPage} />
                </section>

                <div ref={panelRef} className="min-w-0 scroll-mt-24 lg:sticky lg:top-24 lg:space-y-6">
                    <UserPanel
                        key={editingUser?.id ?? 'new'}
                        editing={editingUser}
                        roles={roles}
                        pressings={pressings}
                        onCancelEdit={() => setEditingUser(null)}
                        onCreated={(email, password) => {
                            setTemporaryPassword({ email, password });
                            reload();
                            loadStats();
                        }}
                        onSaved={(updated) => {
                            setEditingUser(updated);
                            reload();
                            loadStats();
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

function TemporaryPasswordBanner({ email, password, onDismiss }: { email: string; password: string; onDismiss: () => void }) {
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
                <p className="font-semibold">Mot de passe temporaire pour {email}</p>
                <p className="text-xs">Ce mot de passe ne sera plus jamais affiché — transmettez-le à l'intéressé(e) maintenant.</p>
                <div className="flex flex-wrap items-center gap-2">
                    <code className="rounded-lg bg-white/70 px-3 py-1.5 font-mono text-sm dark:bg-black/20">{password}</code>
                    <button type="button" onClick={() => void copy()} className={button('secondary', 'sm')}>
                        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                        {copied ? 'Copié' : 'Copier'}
                    </button>
                    <button type="button" onClick={onDismiss} className={button('ghost', 'sm')}>
                        Fermer
                    </button>
                </div>
            </div>
        </Alert>
    );
}

function UserPanel({
    editing,
    roles,
    pressings,
    onCancelEdit,
    onCreated,
    onSaved,
}: {
    editing: PlatformUser | null;
    roles: PlatformRole[];
    pressings: Pressing[];
    onCancelEdit: () => void;
    onCreated: (email: string, password: string) => void;
    onSaved: (updated: PlatformUser) => void;
}) {
    const { dateTime } = useFormat();
    const [name, setName] = useState(editing?.name ?? '');
    const [email, setEmail] = useState(editing?.email ?? '');
    const [roleId, setRoleId] = useState<number | ''>(editing?.platform_role_id ?? '');
    const [selectedPressingIds, setSelectedPressingIds] = useState<number[]>(editing?.pressings?.map((p) => p.id) ?? []);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [activity, setActivity] = useState<PlatformAuditLog[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);

    const selectedRole = roles.find((r) => r.id === roleId);
    const isSuperadminRole = selectedRole?.slug === 'superadmin';
    const allPermissions = Array.from(
        new Map(roles.flatMap((r) => r.permissions ?? []).map((p) => [p.slug, p])).values(),
    );
    const [first, last] = splitName(name || '?');

    useEffect(() => {
        if (!editing) {
            setActivity([]);
            return;
        }
        setActivityLoading(true);
        platformApi
            .get<PlatformAuditLog[]>(`/users/${editing.id}/activity`)
            .then(setActivity)
            .finally(() => setActivityLoading(false));
    }, [editing]);

    function togglePressing(id: number) {
        setSelectedPressingIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    }

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            if (editing) {
                const updated = await platformApi.patch<PlatformUser>(`/users/${editing.id}`, {
                    name,
                    email,
                    platform_role_id: roleId,
                    pressing_ids: isSuperadminRole ? [] : selectedPressingIds,
                });
                onSaved(updated);
            } else {
                const result = await platformApi.post<{ email: string; temporary_password: string }>('/users', {
                    name,
                    email,
                    platform_role_id: roleId,
                    pressing_ids: isSuperadminRole ? [] : selectedPressingIds,
                });
                onCreated(result.email, result.temporary_password);
                setName('');
                setEmail('');
                setRoleId('');
                setSelectedPressingIds([]);
            }
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name.trim() !== '' && email.trim() !== '' && roleId !== '';

    return (
        <div className="space-y-6">
            <SectionCard
                id="platform-user-panel-heading"
                title={editing ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
                subtitle={editing ? editing.email : 'Ajouter un membre de l\'équipe ADMIN à la console.'}
                headerExtra={
                    editing ? (
                        <button type="button" onClick={onCancelEdit} className={cx(iconButton, 'h-8 w-8')} aria-label="Fermer">
                            <X aria-hidden="true" className="h-4 w-4" />
                        </button>
                    ) : undefined
                }
            >
                {error && <Alert tone="error">{error}</Alert>}

                <div className="flex items-center gap-3">
                    <Avatar firstName={first} lastName={last} size="lg" />
                    {editing &&
                        (editing.totp_enabled_at ? (
                            <Pill tone="emerald" icon={ShieldCheck}>MFA activée</Pill>
                        ) : (
                            <Pill tone="amber" icon={ShieldAlert}>MFA non configurée</Pill>
                        ))}
                </div>

                <label className="block">
                    <span className={label}>Nom</span>
                    <input name="name" value={name} onChange={(e) => setName(e.target.value)} className={input} />
                </label>
                <label className="block">
                    <span className={label}>E-mail</span>
                    <span className="relative block">
                        <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cx(input, 'pl-10')} />
                    </span>
                </label>
                <label className="block">
                    <span className={label}>Rôle</span>
                    <select value={roleId} onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : '')} className={select}>
                        <option value="">Sélectionner un rôle</option>
                        {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name}
                            </option>
                        ))}
                    </select>
                </label>

                {selectedRole && (
                    <div>
                        <span className={label}>Permissions du rôle (lecture seule)</span>
                        <ul className="space-y-1 rounded-xl border border-ink-200/80 p-3 dark:border-ink-800">
                            {allPermissions.map((perm) => {
                                const granted = selectedRole.permissions?.some((p) => p.slug === perm.slug) ?? false;
                                return (
                                    <li key={perm.slug} className="flex items-center gap-2 text-sm">
                                        {granted ? (
                                            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                        ) : (
                                            <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-300 dark:text-ink-600" />
                                        )}
                                        <span className={cx(granted ? 'text-ink-800 dark:text-ink-100' : 'text-ink-400 dark:text-ink-600')}>{perm.name}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {selectedRole && !isSuperadminRole && (
                    <div>
                        <span className={label}>Pressings affectés</span>
                        {selectedPressingIds.length > 0 && (
                            <div className="mb-2 flex flex-wrap gap-1.5">
                                {selectedPressingIds.map((id) => {
                                    const p = pressings.find((x) => x.id === id);
                                    if (!p) return null;
                                    return (
                                        <span
                                            key={id}
                                            className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800 ring-1 ring-inset ring-brand-200 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/25"
                                        >
                                            {p.name}
                                            <button type="button" onClick={() => togglePressing(id)} aria-label={`Retirer ${p.name}`}>
                                                <X aria-hidden="true" className="h-3 w-3" />
                                            </button>
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                        <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-ink-200/80 p-2 dark:border-ink-800">
                            {pressings.map((p) => (
                                <li key={p.id}>
                                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-ink-50 dark:hover:bg-ink-800/60">
                                        <input
                                            type="checkbox"
                                            checked={selectedPressingIds.includes(p.id)}
                                            onChange={() => togglePressing(p.id)}
                                            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                                        />
                                        <span className="truncate text-ink-800 dark:text-ink-100">{p.name}</span>
                                        <span className="text-xs text-ink-500 dark:text-ink-400">{p.code}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                {isSuperadminRole && (
                    <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">
                        Le rôle Superadmin donne accès à tous les pressings, quelle que soit l'affectation.
                    </p>
                )}

                {!editing && (
                    <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">
                        Un mot de passe temporaire sera généré et affiché une seule fois, et une invitation sera envoyée par e-mail à l'adresse indiquée.
                    </p>
                )}

                <div className="flex gap-2">
                    {editing && (
                        <button type="button" onClick={onCancelEdit} className={button('ghost', 'md', 'flex-1')}>
                            Annuler
                        </button>
                    )}
                    <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md', 'flex-1')}>
                        {busy ? <Spinner className="h-4 w-4" /> : editing ? null : <UserPlus aria-hidden="true" className="h-4 w-4" />}
                        {editing ? 'Enregistrer' : 'Créer'}
                    </button>
                </div>
            </SectionCard>

            {editing && (
                <SectionCard id="platform-user-activity-heading" title="Journal d'activité" subtitle="50 dernières entrées">
                    {activityLoading ? (
                        <LoadingState />
                    ) : activity.length === 0 ? (
                        <p className="text-sm text-ink-600 dark:text-ink-350">Aucune activité enregistrée.</p>
                    ) : (
                        <ul className="space-y-2">
                            {activity.map((log) => {
                                const { text, tone } = describeActivity(log);
                                return (
                                    <li key={log.id} className="flex items-start gap-2.5 text-sm">
                                        <Clock aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-400 dark:text-ink-500" />
                                        <div className="min-w-0 flex-1">
                                            <Pill tone={tone}>{text}</Pill>
                                            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{dateTime(log.created_at)}</p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </SectionCard>
            )}
        </div>
    );
}

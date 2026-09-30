import { useEffect, useRef, useState } from 'react';
import { Copy, ImageUp, KeyRound, Mail, Pencil, Power, TriangleAlert, UserPlus, UsersRound, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import { useFormat } from '../lib/format';
import PageHeader, { Avatar } from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import { SectionCard } from '../components/ui/Metrics';
import Pagination from '../components/ui/Pagination';
import { Pill } from '../components/ui/StatusBadge';
import { button, card, cx, iconButton, input, label, select } from '../components/ui/styles';
import type { Paginated, Role, User } from '../types';

/* Écran « Utilisateurs et équipe » (Figma SPARK PRESSING, section 11, node 43:1497) :
 * annuaire en tableau + panneau latéral de création (la maquette montre un panneau à
 * côté de la liste, pas un écran dédié) réutilisé pour l'édition (crayon), à la place
 * de l'ancienne modale. Omis faute de backend (voir CLAUDE.md §2) : import CSV, cartes
 * d'indicateurs, onglets par statut, recherche texte et filtre de statut côté serveur,
 * affectation multi-agences, journal « Activité récente ». */

type DirectoryUser = User & { last_active_at?: string | null };

function splitName(name: string): [string, string] {
    const [first, ...rest] = name.split(' ');
    return [first ?? '', rest.join(' ')];
}

export default function UsersPage() {
    const { t } = useI18n();
    const { user: me, activeAgencyId } = useAuth();
    const [users, setUsers] = useState<DirectoryUser[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<User>, 'current_page' | 'last_page' | 'total'>>({ current_page: 1, last_page: 1, total: 0 });
    const [page, setPage] = useState(1);
    const [roleFilter, setRoleFilter] = useState('');
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [temporaryPassword, setTemporaryPassword] = useState<{ email: string; password: string } | null>(null);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    function reload() {
        const params = new URLSearchParams({ full: '1', page: String(page) });
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        if (roleFilter) params.set('role', roleFilter);
        Promise.all([api.get<Paginated<DirectoryUser>>(`/users?${params}`), api.get<Role[]>('/roles')])
            .then(([usersRes, rolesRes]) => {
                setUsers(usersRes.data);
                setMeta({ current_page: usersRes.current_page, last_page: usersRes.last_page, total: usersRes.total });
                setRoles(rolesRes);
            })
            .catch((err) => setError(err instanceof ApiError ? err.message : t('common.error')))
            .finally(() => setLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(reload, [activeAgencyId, page, roleFilter]);
    useEffect(() => setPage(1), [activeAgencyId, roleFilter]);

    function focusPanel(target: User | null) {
        setEditingUser(target);
        requestAnimationFrame(() => {
            panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            panelRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus({ preventScroll: true });
        });
    }

    async function resetPassword(target: User) {
        setError(null);
        try {
            const result = await api.post<{ temporary_password: string }>(`/users/${target.id}/reset-password`);
            setTemporaryPassword({ email: target.email, password: result.temporary_password });
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    async function toggleActive(target: User) {
        setError(null);
        try {
            await api.patch(`/users/${target.id}`, { is_active: !target.is_active });
            reload();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    const staffRoles = roles.filter((r) => r.slug !== 'client');

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('users.title')}
                subtitle={t('users.subtitle')}
                icon={UsersRound}
                actions={
                    <button type="button" onClick={() => focusPanel(null)} className={button('primary', 'md', 'h-10')}>
                        <UserPlus aria-hidden="true" className="h-4 w-4" />
                        {t('users.add')}
                    </button>
                }
            />

            {temporaryPassword && (
                <TemporaryPasswordBanner email={temporaryPassword.email} password={temporaryPassword.password} onDismiss={() => setTemporaryPassword(null)} />
            )}
            {error && <Alert tone="error">{error}</Alert>}

            {loading ? (
                <LoadingState />
            ) : (
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
                    <section aria-labelledby="users-directory" className={cx(card, 'min-w-0 overflow-hidden')}>
                        <div className="flex flex-wrap items-end justify-between gap-3 px-5 pb-4 pt-5 sm:px-6">
                            <div>
                                <h2 id="users-directory" className="font-display text-base font-bold text-ink-900 dark:text-ink-50">
                                    {t('users.directory')}
                                </h2>
                                <p className="text-sm text-ink-600 dark:text-ink-350">{t('users.count', { count: meta.total })}</p>
                            </div>
                            <label className="block basis-full sm:basis-auto">
                                <span className="sr-only">{t('users.filterRole')}</span>
                                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className={cx(select, 'h-10 text-sm sm:w-52')}>
                                    <option value="">{t('users.allRoles')}</option>
                                    {staffRoles.map((r) => (
                                        <option key={r.id} value={r.slug}>
                                            {r.name}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        {users.length === 0 ? (
                            <EmptyState icon={UsersRound} title={t('users.none')} />
                        ) : (
                            <div className="relative overflow-x-auto">
                                <table className="w-full min-w-[720px] table-fixed text-left text-sm">
                                    <thead className="border-y border-ink-200/80 bg-ink-50 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                                        <tr>
                                            <th scope="col" className="w-[31%] px-5 py-2.5 sm:px-6">{t('users.table.user')}</th>
                                            <th scope="col" className="w-[14%] px-3 py-2.5">{t('common.status')}</th>
                                            <th scope="col" className="w-[16%] px-3 py-2.5">{t('users.agency')}</th>
                                            <th scope="col" className="w-[16%] px-3 py-2.5">{t('users.role')}</th>
                                            <th scope="col" className="w-[12%] px-3 py-2.5">{t('users.table.lastActive')}</th>
                                            <th scope="col" className="w-[11%] px-4 py-2.5 text-right">
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
                                                onReset={() => void resetPassword(u)}
                                                onToggle={() => void toggleActive(u)}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <Pagination meta={meta} onPageChange={setPage} />
                    </section>

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

function UserRow({
    user: u,
    isMe,
    selected,
    onEdit,
    onReset,
    onToggle,
}: {
    user: DirectoryUser;
    isMe: boolean;
    selected: boolean;
    onEdit: () => void;
    onReset: () => void;
    onToggle: () => void;
}) {
    const { t } = useI18n();
    const { dateTime } = useFormat();
    const [first, last] = splitName(u.name);

    return (
        <tr className={cx(selected && 'bg-brand-50/60 dark:bg-brand-400/5')}>
            <td className="px-5 py-3 sm:px-6">
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
                <div className="flex flex-col items-start gap-1">
                    {u.is_active ? <Pill tone="emerald">{t('users.active')}</Pill> : <Pill tone="rose">{t('users.inactive')}</Pill>}
                    {u.must_change_password && (
                        <Pill tone="amber" icon={Mail}>
                            {t('users.pendingFirstLogin')}
                        </Pill>
                    )}
                    {u.password_expired && (
                        <Pill tone="amber" icon={TriangleAlert}>
                            {t('users.passwordExpired')}
                        </Pill>
                    )}
                </div>
            </td>
            <td className="break-words px-3 py-3 text-ink-700 dark:text-ink-200">{u.agency?.name ?? <span className="text-ink-500 dark:text-ink-400">{t('users.allAgencies')}</span>}</td>
            <td className="px-3 py-3">
                <Pill tone={u.role?.scope === 'global' ? 'brand' : 'neutral'} className="max-w-full whitespace-normal">{u.role?.name}</Pill>
            </td>
            <td className="px-3 py-3 text-xs text-ink-600 dark:text-ink-350">{u.last_active_at ? dateTime(u.last_active_at) : t('users.never')}</td>
            <td className="px-4 py-3">
                <div className="flex justify-end gap-0.5">
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
    const [photoFile, setPhotoFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const selectedRole = roles.find((r) => r.id === roleId);
    const needsAgencyPicker = me?.agency_id === null && !!selectedRole && selectedRole.scope !== 'global';
    const photoPreview = photoFile ? URL.createObjectURL(photoFile) : editing?.photo_url ?? null;
    const [first, last] = splitName(name);

    async function submit() {
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
            title={editing ? t('users.editUser') : t('users.newUser')}
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

            {!editing && <p className="rounded-xl bg-ink-50 px-3 py-2.5 text-xs text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">{t('users.invitationHint')}</p>}

            <div className="flex gap-2">
                {editing && (
                    <button type="button" onClick={onCancelEdit} className={button('ghost', 'md', 'flex-1')}>
                        {t('common.cancel')}
                    </button>
                )}
                <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md', 'flex-1')}>
                    {busy ? <Spinner className="h-4 w-4" /> : editing ? null : <UserPlus aria-hidden="true" className="h-4 w-4" />}
                    {editing ? t('common.save') : t('common.create')}
                </button>
            </div>
        </SectionCard>
    );
}

import { useEffect, useRef, useState } from 'react';
import {
    Bell,
    Boxes,
    ChartNoAxesCombined,
    Check,
    Copy,
    Minus,
    PackagePlus,
    Plus,
    Receipt,
    Save,
    Settings,
    ShieldAlert,
    ShieldCheck,
    Shirt,
    Trash2,
    Truck,
    Users,
    UsersRound,
    X,
    type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import PageHeader, { Avatar } from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import { SectionCard } from '../components/ui/Metrics';
import { Pill, TONES } from '../components/ui/StatusBadge';
import { button, card, cx, input, label, select } from '../components/ui/styles';
import type { Paginated, Permission, Role, RoleScope, User } from '../types';
import { SYSTEM_ROLE_SLUGS } from '../types';

/* Écran « Rôles et permissions » (Figma SPARK PRESSING, section 11, node 43:1850) :
 * cartes de rôles, configuration du rôle sélectionné en ligne (remplace l'ancienne
 * modale), matrice domaines × rôles, utilisateurs concernés et duplication (création
 * pré-remplie via POST /roles existant). Omis faute de backend (voir CLAUDE.md §2) :
 * permissions par agence / portée fine, journal des changements de droits. */

const GROUP_ICONS: Record<string, LucideIcon> = {
    clients: Users,
    orders: PackagePlus,
    billing: Receipt,
    admin: Settings,
    reports: ChartNoAxesCombined,
    stocks: Boxes,
    deliveries: Truck,
    hr: UsersRound,
    notifications: Bell,
    catalog: Shirt,
};

type Draft = { mode: 'create' | 'edit'; roleId: number | null; name: string; scope: RoleScope; permissionIds: Set<number> };

function groupLabel(t: (key: string) => string, group: string): string {
    const key = `rbac.group.${group}`;
    const translated = t(key);
    return translated === key ? group : translated;
}

function isSystem(role: Role): boolean {
    return (SYSTEM_ROLE_SLUGS as string[]).includes(role.slug);
}

export default function RolesPermissionsPage() {
    const { t } = useI18n();
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const editorRef = useRef<HTMLDivElement>(null);

    function reload(keepSelection?: number | null) {
        return Promise.all([api.get<Role[]>('/roles'), api.get<Permission[]>('/permissions')])
            .then(([rolesRes, permissionsRes]) => {
                const visible = rolesRes;
                setRoles(visible);
                setPermissions(permissionsRes);
                const next = keepSelection !== undefined ? keepSelection : selectedId;
                const role = visible.find((r) => r.id === next) ?? visible[0] ?? null;
                setSelectedId(role?.id ?? null);
                setDraft(role ? draftFrom(role) : null);
            })
            .finally(() => setLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => void reload(), []);

    function draftFrom(role: Role): Draft {
        return { mode: 'edit', roleId: role.id, name: role.name, scope: role.scope, permissionIds: new Set(role.permissions?.map((p) => p.id) ?? []) };
    }

    function reveal() {
        requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }

    function select(role: Role) {
        setSelectedId(role.id);
        setDraft(draftFrom(role));
        setFeedback(null);
    }

    function startCreate() {
        setDraft({ mode: 'create', roleId: null, name: '', scope: 'agency', permissionIds: new Set() });
        setFeedback(null);
        reveal();
    }

    function startDuplicate() {
        const source = roles.find((r) => r.id === selectedId);
        if (!source) return;
        setDraft({
            mode: 'create',
            roleId: null,
            name: t('rbac.copyOf', { name: source.name }),
            scope: source.scope,
            permissionIds: new Set(source.permissions?.map((p) => p.id) ?? []),
        });
        setFeedback(null);
        reveal();
    }

    const selected = roles.find((r) => r.id === selectedId) ?? null;
    const groups = Array.from(new Set(permissions.map((p) => p.group)));

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('rbac.title')}
                subtitle={t('rbac.subtitle')}
                icon={ShieldCheck}
                actions={
                    <>
                        <button type="button" onClick={startDuplicate} disabled={!selected} className={button('secondary', 'md', 'h-10')}>
                            <Copy aria-hidden="true" className="h-4 w-4" />
                            {t('rbac.duplicate')}
                        </button>
                        <button type="button" onClick={startCreate} className={button('primary', 'md', 'h-10')}>
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            {t('rbac.newRole')}
                        </button>
                    </>
                }
            />

            {feedback && <Alert tone="success">{feedback}</Alert>}

            {loading ? (
                <LoadingState />
            ) : (
                <>
                    <ul aria-label={t('rbac.roles')} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                        {roles.map((role) => {
                            const active = draft?.mode === 'edit' && role.id === selectedId;
                            return (
                                <li key={role.id} className="min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => select(role)}
                                        aria-pressed={active}
                                        className={cx(
                                            card,
                                            'flex h-full w-full flex-col items-start gap-2 p-4 text-left transition duration-150 hover:border-ink-300 dark:hover:border-ink-700',
                                            active && 'border-brand-600 ring-2 ring-brand-600/20 dark:border-brand-400',
                                        )}
                                    >
                                        <div className="flex flex-wrap gap-1.5">
                                            <Pill tone={role.scope === 'global' ? 'brand' : 'neutral'}>{t(`rbac.scope.${role.scope}`)}</Pill>
                                            {isSystem(role) && <Pill tone="accent">{t('rbac.system')}</Pill>}
                                        </div>
                                        <p className="font-display font-bold text-ink-900 dark:text-white">{role.name}</p>
                                        <p className="text-xs text-ink-600 dark:text-ink-350">
                                            {t('rbac.usersCount', { count: role.users_count ?? 0 })} · {t('rbac.permissionCount', { count: role.permissions?.length ?? 0 })}
                                        </p>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>

                    <div ref={editorRef} className="scroll-mt-24">
                        {draft && (
                            <RoleEditor
                                key={`${draft.mode}-${draft.roleId ?? 'new'}-${draft.name}`}
                                draft={draft}
                                role={draft.mode === 'edit' ? selected : null}
                                permissions={permissions}
                                groups={groups}
                                onCancel={() => (selected ? setDraft(draftFrom(selected)) : setDraft(null))}
                                onSaved={async (savedId, message) => {
                                    await reload(savedId);
                                    setFeedback(message);
                                }}
                            />
                        )}
                    </div>

                    <Matrix roles={roles} permissions={permissions} groups={groups} highlightId={draft?.mode === 'edit' ? selectedId : null} />

                    {selected && draft?.mode === 'edit' && <RoleUsers role={selected} />}
                </>
            )}
        </div>
    );
}

function RoleEditor({
    draft,
    role,
    permissions,
    groups,
    onCancel,
    onSaved,
}: {
    draft: Draft;
    role: Role | null;
    permissions: Permission[];
    groups: string[];
    onCancel: () => void;
    onSaved: (savedId: number | null, message: string) => void | Promise<void>;
}) {
    const { t } = useI18n();
    const [name, setName] = useState(draft.name);
    const [scope, setScope] = useState<RoleScope>(draft.scope);
    const [permissionIds, setPermissionIds] = useState<Set<number>>(new Set(draft.permissionIds));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const original = role ? new Set(role.permissions?.map((p) => p.id) ?? []) : new Set<number>();
    const dirty =
        draft.mode === 'create' ||
        name !== role?.name ||
        scope !== role?.scope ||
        permissionIds.size !== original.size ||
        [...permissionIds].some((id) => !original.has(id));

    function toggle(id: number) {
        setPermissionIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleGroup(group: string, on: boolean) {
        setPermissionIds((prev) => {
            const next = new Set(prev);
            permissions.filter((p) => p.group === group).forEach((p) => (on ? next.add(p.id) : next.delete(p.id)));
            return next;
        });
    }

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            const payload = { name, scope, permission_ids: Array.from(permissionIds) };
            if (draft.mode === 'edit' && role) {
                await api.patch(`/roles/${role.id}`, payload);
                await onSaved(role.id, t('rbac.saved'));
            } else {
                const created = await api.post<Role>('/roles', payload);
                await onSaved(created.id, t('rbac.created'));
            }
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        if (!role) return;
        setBusy(true);
        setError(null);
        try {
            await api.delete(`/roles/${role.id}`);
            await onSaved(null, t('rbac.deleted'));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const title = draft.mode === 'create' ? t('rbac.newRole') : t('rbac.configure', { name: role?.name ?? '' });

    return (
        <SectionCard
            id="role-editor-heading"
            title={title}
            subtitle={t('rbac.configureHint')}
            headerExtra={
                <div className="flex flex-wrap gap-2">
                    {draft.mode === 'edit' && role && !isSystem(role) && (
                        <button type="button" onClick={() => void remove()} disabled={busy} className={button('dangerGhost', 'sm')}>
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                            {t('common.delete')}
                        </button>
                    )}
                    {dirty && (
                        <button type="button" onClick={onCancel} className={button('ghost', 'sm')}>
                            <X aria-hidden="true" className="h-4 w-4" />
                            {t('common.cancel')}
                        </button>
                    )}
                    <button type="button" onClick={() => void submit()} disabled={busy || !dirty || name.trim() === ''} className={button('primary', 'sm')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                        {draft.mode === 'create' ? t('common.create') : t('common.save')}
                    </button>
                </div>
            }
        >
            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                    <span className={label}>{t('rbac.roleName')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
                </label>
                <label className="block">
                    <span className={label}>{t('rbac.scope')}</span>
                    <select value={scope} onChange={(e) => setScope(e.target.value as RoleScope)} className={select}>
                        <option value="agency">{t('rbac.scope.agency')}</option>
                        <option value="global">{t('rbac.scope.global')}</option>
                        <option value="flexible">{t('rbac.scope.flexible')}</option>
                    </select>
                </label>
            </div>

            {draft.mode === 'edit' && role && (role.users_count ?? 0) > 0 && (
                <Alert tone="warning" icon={ShieldAlert}>
                    {t('rbac.impact', { count: role.users_count ?? 0 })}
                </Alert>
            )}

            <fieldset className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <legend className="sr-only">{t('rbac.permissions')}</legend>
                {groups.map((group) => {
                    const items = permissions.filter((p) => p.group === group);
                    const granted = items.filter((p) => permissionIds.has(p.id)).length;
                    const Icon = GROUP_ICONS[group] ?? ShieldCheck;
                    return (
                        <div key={group} className="rounded-xl border border-ink-200/80 p-3.5 dark:border-ink-800">
                            <div className="mb-2 flex items-center justify-between gap-2">
                                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink-900 dark:text-ink-50">
                                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-500 dark:text-ink-350" />
                                    <span className="truncate">{groupLabel(t, group)}</span>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => toggleGroup(group, granted < items.length)}
                                    className="shrink-0 text-xs font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
                                >
                                    {granted < items.length ? t('rbac.selectAll') : t('rbac.selectNone')}
                                </button>
                            </div>
                            <div className="space-y-1.5">
                                {items.map((p) => (
                                    <label key={p.id} className="flex items-start gap-2 text-sm text-ink-800 dark:text-ink-100" title={p.slug}>
                                        <input
                                            type="checkbox"
                                            checked={permissionIds.has(p.id)}
                                            onChange={() => toggle(p.id)}
                                            className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-400 text-brand-600 focus:ring-brand-500"
                                        />
                                        {p.name}
                                    </label>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </fieldset>
        </SectionCard>
    );
}

function Matrix({ roles, permissions, groups, highlightId }: { roles: Role[]; permissions: Permission[]; groups: string[]; highlightId: number | null }) {
    const { t } = useI18n();

    return (
        <SectionCard id="rbac-matrix-heading" flush title={t('rbac.matrix')} subtitle={t('rbac.matrixHint')}>
            <div className="relative overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-y border-ink-200/80 bg-ink-50 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                        <tr>
                            <th scope="col" className="px-5 py-2.5 sm:px-6">{t('rbac.domain')}</th>
                            {roles.map((role) => (
                                <th
                                    key={role.id}
                                    scope="col"
                                    className={cx('w-24 px-2 py-2.5 text-center', role.id === highlightId && 'bg-brand-50 text-brand-800 dark:bg-brand-400/10 dark:text-brand-300')}
                                >
                                    {role.name}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                        {groups.map((group) => {
                            const items = permissions.filter((p) => p.group === group);
                            const Icon = GROUP_ICONS[group] ?? ShieldCheck;
                            return (
                                <tr key={group}>
                                    <td className="px-5 py-3 sm:px-6">
                                        <div className="flex items-start gap-2.5">
                                            <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-500 dark:text-ink-350" />
                                            <div className="min-w-0">
                                                <p className="font-semibold text-ink-900 dark:text-ink-50">{groupLabel(t, group)}</p>
                                                <p className="text-xs text-ink-600 dark:text-ink-350">{items.map((p) => p.name).join(' · ')}</p>
                                            </div>
                                        </div>
                                    </td>
                                    {roles.map((role) => {
                                        const granted = items.filter((p) => role.permissions?.some((rp) => rp.id === p.id)).length;
                                        return (
                                            <td key={role.id} className={cx('px-2 py-3 text-center', role.id === highlightId && 'bg-brand-50/60 dark:bg-brand-400/5')}>
                                                <MatrixCell granted={granted} total={items.length} />
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
}

function MatrixCell({ granted, total }: { granted: number; total: number }) {
    const { t } = useI18n();
    if (granted === total && total > 0) {
        return (
            <span className={cx('mx-auto flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset', TONES.emerald)}>
                <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.5} />
                <span className="sr-only">{t('rbac.granted')}</span>
            </span>
        );
    }
    if (granted > 0) {
        return (
            <span className={cx('mx-auto inline-flex h-6 items-center rounded-full px-2 text-[11px] font-bold tabular-nums ring-1 ring-inset', TONES.amber)} title={t('rbac.partial')}>
                {granted}/{total}
            </span>
        );
    }
    return (
        <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-ink-100 text-ink-400 dark:bg-ink-800 dark:text-ink-500">
            <Minus aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="sr-only">{t('rbac.notGranted')}</span>
        </span>
    );
}

function RoleUsers({ role }: { role: Role }) {
    const { t } = useI18n();
    const [users, setUsers] = useState<User[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        api.get<Paginated<User>>(`/users?full=1&per_page=8&role=${encodeURIComponent(role.slug)}`)
            .then((res) => {
                setUsers(res.data);
                setTotal(res.total);
            })
            .catch(() => setUsers([]))
            .finally(() => setLoading(false));
    }, [role.slug]);

    return (
        <SectionCard
            id="role-users-heading"
            title={t('rbac.concernedUsers')}
            subtitle={t('rbac.concernedUsersHint', { role: role.name, count: total })}
            action={{ to: '/users', label: t('users.title') }}
        >
            {loading ? (
                <LoadingState className="py-6" />
            ) : users.length === 0 ? (
                <EmptyState compact icon={UsersRound} title={t('rbac.noUsers')} />
            ) : (
                <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {users.map((u) => {
                        const [first, ...rest] = u.name.split(' ');
                        return (
                            <li key={u.id} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-ink-200/80 px-3 py-2 dark:border-ink-800">
                                <Avatar firstName={first} lastName={rest.join(' ')} photoUrl={u.photo_url} size="sm" />
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-ink-900 dark:text-ink-50">{u.name}</p>
                                    <p className="truncate text-xs text-ink-600 dark:text-ink-350">{u.agency?.name ?? t('users.allAgencies')}</p>
                                </div>
                                {!u.is_active && <Pill tone="rose" className="ml-auto">{t('users.inactive')}</Pill>}
                            </li>
                        );
                    })}
                </ul>
            )}
            {total > users.length && <p className="text-xs text-ink-600 dark:text-ink-350">{t('rbac.moreUsers', { count: total - users.length })}</p>}
        </SectionCard>
    );
}

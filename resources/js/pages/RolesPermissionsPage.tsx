import { Fragment, useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { Alert, LoadingState, Spinner } from '../components/ui/Feedback';
import { Pill } from '../components/ui/StatusBadge';
import { button, card, cardPadded, cx, input, label, select, sectionTitle } from '../components/ui/styles';
import { Check, Minus, Pencil, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import type { Permission, Role, RoleScope } from '../types';
import { SYSTEM_ROLE_SLUGS } from '../types';

type Tab = 'roles' | 'permissions' | 'matrix';

export default function RolesPermissionsPage() {
    const { t } = useI18n();
    const [roles, setRoles] = useState<Role[]>([]);
    const [permissions, setPermissions] = useState<Permission[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<Tab>('roles');
    const [creating, setCreating] = useState(false);
    const [editingRole, setEditingRole] = useState<Role | null>(null);

    function reload() {
        Promise.all([api.get<Role[]>('/roles'), api.get<Permission[]>('/permissions')])
            .then(([rolesRes, permissionsRes]) => {
                setRoles(rolesRes);
                setPermissions(permissionsRes);
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, []);

    const tabs: { key: Tab; label: string }[] = [
        { key: 'roles', label: t('rbac.roles') },
        { key: 'permissions', label: t('rbac.permissions') },
        { key: 'matrix', label: t('rbac.matrix') },
    ];

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('rbac.title')}
                subtitle={t('rbac.subtitle')}
                icon={ShieldCheck}
                actions={
                    tab === 'roles' && (
                        <button type="button" onClick={() => setCreating(true)} className={button('primary')}>
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            {t('rbac.newRole')}
                        </button>
                    )
                }
            />

            <div role="tablist" aria-label={t('rbac.title')} className="flex gap-2">
                {tabs.map((tb) => (
                    <button
                        key={tb.key}
                        type="button"
                        role="tab"
                        aria-selected={tab === tb.key}
                        onClick={() => setTab(tb.key)}
                        className={cx(
                            'inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition duration-150',
                            tab === tb.key
                                ? 'bg-ink-900 text-white shadow-sm dark:bg-white dark:text-ink-950'
                                : 'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-200 dark:ring-ink-700 dark:hover:bg-ink-800',
                        )}
                    >
                        {tb.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <LoadingState />
            ) : (
                <>
                    {tab === 'roles' && <RolesTab roles={roles} onEdit={setEditingRole} onChanged={reload} />}
                    {tab === 'permissions' && <PermissionsTab permissions={permissions} />}
                    {tab === 'matrix' && <MatrixTab roles={roles} permissions={permissions} />}
                </>
            )}

            {creating && (
                <RoleFormModal
                    role={null}
                    permissions={permissions}
                    onClose={() => setCreating(false)}
                    onSaved={() => {
                        setCreating(false);
                        reload();
                    }}
                />
            )}

            {editingRole && (
                <RoleFormModal
                    role={editingRole}
                    permissions={permissions}
                    onClose={() => setEditingRole(null)}
                    onSaved={() => {
                        setEditingRole(null);
                        reload();
                    }}
                />
            )}
        </div>
    );
}

function groupLabel(t: (key: string) => string, group: string): string {
    const key = `rbac.group.${group}`;
    const translated = t(key);
    return translated === key ? group : translated;
}

function RolesTab({ roles, onEdit, onChanged }: { roles: Role[]; onEdit: (role: Role) => void; onChanged: () => void }) {
    const { t } = useI18n();
    const [error, setError] = useState<string | null>(null);

    async function deleteRole(role: Role) {
        setError(null);
        try {
            await api.delete(`/roles/${role.id}`);
            onChanged();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    return (
        <div className="space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {roles.map((role) => {
                    const isSystem = (SYSTEM_ROLE_SLUGS as string[]).includes(role.slug);
                    return (
                        <div key={role.id} className={cx(card, 'space-y-2 p-4')}>
                            <div className="flex items-center justify-between gap-2">
                                <p className="font-display font-bold text-ink-900 dark:text-white">{role.name}</p>
                                <Pill tone="neutral">{t(`rbac.scope.${role.scope}`)}</Pill>
                            </div>
                            <p className="font-mono text-xs text-ink-500 dark:text-ink-400">{role.slug}</p>
                            <p className="text-sm text-ink-600 dark:text-ink-350">
                                {t('rbac.permissionCount', { count: role.permissions?.length ?? 0 })}
                            </p>
                            <div className="flex items-center gap-2 pt-1">
                                <button type="button" onClick={() => onEdit(role)} className={button('secondary', 'sm')}>
                                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                                    {t('common.edit')}
                                </button>
                                {!isSystem && (
                                    <button type="button" onClick={() => void deleteRole(role)} className={button('dangerGhost', 'sm')}>
                                        <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                        {t('common.delete')}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function PermissionsTab({ permissions }: { permissions: Permission[] }) {
    const { t } = useI18n();
    const groups = Array.from(new Set(permissions.map((p) => p.group)));

    return (
        <div className="space-y-5">
            {groups.map((group) => (
                <section key={group} className={cx(card, 'overflow-hidden')}>
                    <h2 className="border-b border-ink-200/80 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink-600 dark:border-ink-800 dark:text-ink-350">
                        {groupLabel(t, group)}
                    </h2>
                    <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                        {permissions
                            .filter((p) => p.group === group)
                            .map((p) => (
                                <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                                    <span className="text-ink-900 dark:text-ink-50">{p.name}</span>
                                    <span className="font-mono text-xs text-ink-500 dark:text-ink-400">{p.slug}</span>
                                </li>
                            ))}
                    </ul>
                </section>
            ))}
        </div>
    );
}

function MatrixTab({ roles, permissions }: { roles: Role[]; permissions: Permission[] }) {
    const { t } = useI18n();
    const groups = Array.from(new Set(permissions.map((p) => p.group)));

    return (
        <div className={cx(card, 'overflow-x-auto')}>
            <table className="w-full text-left text-sm">
                <thead className="bg-ink-50 text-xs uppercase tracking-wider text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">
                    <tr>
                        <th scope="col" className="sticky left-0 bg-ink-50 px-4 py-2.5 font-semibold dark:bg-ink-950/50">
                            {t('rbac.permissions')}
                        </th>
                        {roles.map((role) => (
                            <th key={role.id} scope="col" className="whitespace-nowrap px-3 py-2.5 text-center font-semibold">
                                {role.name}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {groups.map((group) => (
                        <Fragment key={group}>
                            <tr className="bg-ink-50/60 dark:bg-ink-950/30">
                                <td colSpan={roles.length + 1} className="px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-ink-600 dark:text-ink-350">
                                    {groupLabel(t, group)}
                                </td>
                            </tr>
                            {permissions
                                .filter((p) => p.group === group)
                                .map((permission) => (
                                    <tr key={permission.id} className="border-t border-ink-100 dark:border-ink-800">
                                        <td className="sticky left-0 bg-white px-4 py-2 dark:bg-ink-900">{permission.name}</td>
                                        {roles.map((role) => {
                                            const has = role.permissions?.some((p) => p.id === permission.id);
                                            return (
                                                <td key={role.id} className="px-3 py-2 text-center">
                                                    {has ? (
                                                        <Check aria-label={t('rbac.granted')} className="mx-auto h-4 w-4 text-emerald-700 dark:text-emerald-300" />
                                                    ) : (
                                                        <Minus aria-hidden="true" className="mx-auto h-4 w-4 text-ink-300 dark:text-ink-700" />
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                        </Fragment>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function RoleFormModal({
    role,
    permissions,
    onClose,
    onSaved,
}: {
    role: Role | null;
    permissions: Permission[];
    onClose: () => void;
    onSaved: () => void;
}) {
    const { t } = useI18n();
    const [name, setName] = useState(role?.name ?? '');
    const [scope, setScope] = useState<RoleScope>(role?.scope ?? 'agency');
    const [permissionIds, setPermissionIds] = useState<Set<number>>(new Set(role?.permissions?.map((p) => p.id) ?? []));
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const groups = Array.from(new Set(permissions.map((p) => p.group)));

    function togglePermission(id: number) {
        setPermissionIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            const payload = { name, scope, permission_ids: Array.from(permissionIds) };
            if (role) {
                await api.patch(`/roles/${role.id}`, payload);
            } else {
                await api.post('/roles', payload);
            }
            onSaved();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name.trim() !== '';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
            <section className={cx(cardPadded, 'max-h-[85vh] w-full max-w-lg space-y-4 overflow-y-auto')}>
                <div className="flex items-center justify-between">
                    <h2 className={sectionTitle}>{role ? t('rbac.editRole') : t('rbac.newRole')}</h2>
                    <button type="button" onClick={onClose} aria-label={t('common.close')} className={button('ghost', 'sm')}>
                        <X aria-hidden="true" className="h-4 w-4" />
                    </button>
                </div>
                {error && <Alert tone="error">{error}</Alert>}

                <label className="block">
                    <span className={label}>{t('rbac.roleName')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
                </label>
                <label className="block">
                    <span className={label}>{t('rbac.scope')}</span>
                    <select value={scope} onChange={(e) => setScope(e.target.value as RoleScope)} className={cx(select, 'w-full')}>
                        <option value="agency">{t('rbac.scope.agency')}</option>
                        <option value="global">{t('rbac.scope.global')}</option>
                        <option value="flexible">{t('rbac.scope.flexible')}</option>
                    </select>
                </label>

                <fieldset className="space-y-3">
                    <legend className={label}>{t('rbac.permissions')}</legend>
                    {groups.map((group) => (
                        <div key={group}>
                            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink-600 dark:text-ink-350">{groupLabel(t, group)}</p>
                            <div className="space-y-1.5">
                                {permissions
                                    .filter((p) => p.group === group)
                                    .map((p) => (
                                        <label key={p.id} className="flex items-center gap-2 text-sm text-ink-800 dark:text-ink-100">
                                            <input
                                                type="checkbox"
                                                checked={permissionIds.has(p.id)}
                                                onChange={() => togglePermission(p.id)}
                                                className="h-4 w-4 rounded border-ink-400 text-brand-600 focus:ring-brand-500"
                                            />
                                            {p.name}
                                        </label>
                                    ))}
                            </div>
                        </div>
                    ))}
                </fieldset>

                <div className="flex justify-end gap-2 pt-2">
                    <button type="button" onClick={onClose} className={button('secondary', 'md')}>
                        {t('common.cancel')}
                    </button>
                    <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : null}
                        {t('common.save')}
                    </button>
                </div>
            </section>
        </div>
    );
}

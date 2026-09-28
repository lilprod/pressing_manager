import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import PageHeader, { Avatar } from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../components/ui/Feedback';
import { Pill } from '../components/ui/StatusBadge';
import { button, card, cardPadded, cx, input, label, select, sectionTitle } from '../components/ui/styles';
import { Copy, KeyRound, TriangleAlert, UsersRound } from 'lucide-react';
import type { Role, User } from '../types';

export default function UsersPage() {
    const { t } = useI18n();
    const { user: me, activeAgencyId } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [roles, setRoles] = useState<Role[]>([]);
    const [loading, setLoading] = useState(true);
    const [temporaryPassword, setTemporaryPassword] = useState<{ email: string; password: string } | null>(null);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ full: '1' });
        if (activeAgencyId) params.set('agency_id', String(activeAgencyId));
        Promise.all([api.get<User[]>(`/users?${params}`), api.get<Role[]>('/roles')])
            .then(([usersRes, rolesRes]) => {
                setUsers(usersRes);
                setRoles(rolesRes);
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [activeAgencyId]);

    async function resetPassword(target: User) {
        const result = await api.post<{ temporary_password: string }>(`/users/${target.id}/reset-password`);
        setTemporaryPassword({ email: target.email, password: result.temporary_password });
        reload();
    }

    async function toggleActive(target: User) {
        await api.patch(`/users/${target.id}`, { is_active: !target.is_active });
        reload();
    }

    return (
        <div className="space-y-6">
            <PageHeader title={t('users.title')} subtitle={t('users.subtitle')} icon={UsersRound} />

            {temporaryPassword && (
                <TemporaryPasswordBanner
                    email={temporaryPassword.email}
                    password={temporaryPassword.password}
                    onDismiss={() => setTemporaryPassword(null)}
                />
            )}

            {loading ? (
                <LoadingState />
            ) : (
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                    <div className={cx(card, 'overflow-hidden')}>
                        {users.length === 0 ? (
                            <EmptyState icon={UsersRound} title={t('users.none')} />
                        ) : (
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {users.map((u) => (
                                    <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                                        <Avatar firstName={u.name.split(' ')[0]} lastName={u.name.split(' ').slice(1).join(' ')} photoUrl={u.photo_url} size="sm" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{u.name}</p>
                                                <Pill tone="neutral">{u.role?.name}</Pill>
                                                {!u.is_active && <Pill tone="rose">{t('users.inactive')}</Pill>}
                                                {u.must_change_password && (
                                                    <Pill tone="amber" icon={TriangleAlert}>
                                                        {t('users.mustChangePassword')}
                                                    </Pill>
                                                )}
                                                {u.password_expired && (
                                                    <Pill tone="amber" icon={TriangleAlert}>
                                                        {t('users.passwordExpired')}
                                                    </Pill>
                                                )}
                                            </div>
                                            <p className="truncate text-sm text-ink-600 dark:text-ink-350">
                                                {u.email}
                                                {u.agency && (
                                                    <>
                                                        <span aria-hidden="true"> · </span>
                                                        {u.agency.name}
                                                    </>
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            {u.id !== me?.id && (
                                                <button type="button" onClick={() => void toggleActive(u)} className={button('secondary', 'sm')}>
                                                    {u.is_active ? t('users.deactivate') : t('users.activate')}
                                                </button>
                                            )}
                                            <button type="button" onClick={() => void resetPassword(u)} className={button('secondary', 'sm')}>
                                                <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
                                                {t('users.resetPassword')}
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <CreateUserForm roles={roles} onCreated={(email, password) => { setTemporaryPassword({ email, password }); reload(); }} />
                </div>
            )}
        </div>
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
                <div className="flex items-center gap-2">
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

function CreateUserForm({ roles, onCreated }: { roles: Role[]; onCreated: (email: string, password: string) => void }) {
    const { t } = useI18n();
    const { agencies, user: me } = useAuth();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [roleId, setRoleId] = useState<number | ''>('');
    const [agencyId, setAgencyId] = useState<number | ''>('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const selectedRole = roles.find((r) => r.id === roleId);
    const needsAgencyPicker = me?.agency_id === null && selectedRole && selectedRole.scope !== 'global';

    async function submit() {
        setBusy(true);
        setError(null);
        try {
            const result = await api.post<{ email: string; temporary_password: string }>('/users', {
                name,
                email,
                phone: phone || undefined,
                role_id: roleId,
                agency_id: needsAgencyPicker && agencyId ? agencyId : undefined,
            });
            onCreated(result.email, result.temporary_password);
            setName('');
            setEmail('');
            setPhone('');
            setRoleId('');
            setAgencyId('');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name !== '' && email !== '' && roleId !== '';

    return (
        <section className={cx(cardPadded, 'space-y-4')}>
            <h2 className={sectionTitle}>{t('users.newUser')}</h2>
            {error && <Alert tone="error">{error}</Alert>}

            <label className="block">
                <span className={label}>{t('profile.name')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
            </label>
            <label className="block">
                <span className={label}>{t('profile.email')}</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cx(input, 'w-full')} />
            </label>
            <label className="block">
                <span className={label}>{t('profile.phone')}</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={cx(input, 'w-full')} />
            </label>
            <label className="block">
                <span className={label}>{t('users.role')}</span>
                <select value={roleId} onChange={(e) => setRoleId(e.target.value ? Number(e.target.value) : '')} className={cx(select, 'w-full')}>
                    <option value="">{t('users.selectRole')}</option>
                    {roles
                        .filter((r) => r.slug !== 'client')
                        .map((r) => (
                            <option key={r.id} value={r.id}>
                                {r.name}
                            </option>
                        ))}
                </select>
            </label>
            {needsAgencyPicker && (
                <label className="block">
                    <span className={label}>{t('users.agency')}</span>
                    <select value={agencyId} onChange={(e) => setAgencyId(e.target.value ? Number(e.target.value) : '')} className={cx(select, 'w-full')}>
                        <option value="">{t('users.selectAgency')}</option>
                        {agencies.map((a) => (
                            <option key={a.id} value={a.id}>
                                {a.name}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            <button type="button" onClick={() => void submit()} disabled={!canSubmit || busy} className={button('primary', 'md', 'w-full')}>
                {busy ? <Spinner className="h-4 w-4" /> : null}
                {t('common.create')}
            </button>
        </section>
    );
}

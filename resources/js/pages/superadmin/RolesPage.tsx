import { useEffect, useState } from 'react';
import { Plus, ShieldCheck, ShieldHalf } from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { SectionCard } from '../../components/ui/Metrics';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cx, input, label } from '../../components/ui/styles';
import type { PlatformPermission, PlatformRole } from '../../types';

/**
 * Phase 4 : gestion des rôles plateforme au-delà du catalogue fixe à 3 rôles.
 * Création de rôles personnalisés + permissions ; les rôles système restent en
 * lecture seule pour les permissions (voir PlatformRoleController, décision
 * documentée : éviter un auto-verrouillage du rôle superadmin).
 */
export default function RolesPage() {
    const [roles, setRoles] = useState<PlatformRole[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState('');
    const [selectedPermissions, setSelectedPermissions] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function reload() {
        setLoading(true);
        platformApi.get<PlatformRole[]>('/roles').then(setRoles).finally(() => setLoading(false));
    }

    useEffect(reload, []);

    const allPermissions: PlatformPermission[] = Array.from(
        new Map(roles.flatMap((r) => r.permissions ?? []).map((p) => [p.slug, p])).values(),
    );

    function togglePermission(id: number) {
        setSelectedPermissions((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
    }

    async function createRole() {
        setBusy(true);
        setError(null);
        try {
            await platformApi.post('/roles', { name, permission_ids: selectedPermissions });
            setName('');
            setSelectedPermissions([]);
            reload();
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <header className="flex items-center gap-3.5">
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                    <ShieldHalf aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Rôles plateforme</h1>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Rôles du personnel Spark et leurs permissions.</p>
                </div>
            </header>

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
                <div className={cx(card, 'overflow-hidden')}>
                    {loading ? (
                        <LoadingState />
                    ) : roles.length === 0 ? (
                        <EmptyState icon={ShieldHalf} title="Aucun rôle" />
                    ) : (
                        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                            {roles.map((role) => (
                                <li key={role.id} className="px-5 py-4">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-semibold text-ink-900 dark:text-ink-50">{role.name}</p>
                                        {role.is_system && <Pill tone="brand">Système</Pill>}
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {(role.permissions ?? []).map((p) => (
                                            <Pill key={p.slug} tone="neutral" icon={ShieldCheck}>
                                                {p.name}
                                            </Pill>
                                        ))}
                                        {(role.permissions ?? []).length === 0 && (
                                            <span className="text-xs text-ink-500 dark:text-ink-400">Aucune permission</span>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <SectionCard id="new-role" title="Nouveau rôle">
                    {error && <Alert tone="error">{error}</Alert>}
                    <label className="block">
                        <span className={label}>Nom</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
                    </label>
                    <div>
                        <span className={label}>Permissions</span>
                        <ul className="space-y-1 rounded-xl border border-ink-200/80 p-3 dark:border-ink-800">
                            {allPermissions.map((perm) => (
                                <li key={perm.slug}>
                                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={selectedPermissions.includes(perm.id)}
                                            onChange={() => togglePermission(perm.id)}
                                            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                                        />
                                        <span className="text-ink-800 dark:text-ink-100">{perm.name}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <button type="button" onClick={() => void createRole()} disabled={busy || !name.trim()} className={button('primary', 'md', 'w-full')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                        Créer
                    </button>
                </SectionCard>
            </div>
        </div>
    );
}

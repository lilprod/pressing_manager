import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck } from 'lucide-react';
import { platformApi } from '../../lib/platformApi';
import { useFormat } from '../../lib/format';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { StatCard } from '../../components/ui/Metrics';
import { card, cx, textLink } from '../../components/ui/styles';

/* Écran « Licences » (nav de la capture Vue plateforme) : licence réelle de chaque
 * pressing (plan, échéance, jours restants) et dernier paiement enregistré. Le
 * renouvellement se fait depuis la fiche du pressing (modale existante). */

type LicenseRow = {
    pressing: { id: number; name: string; code: string; status: string };
    plan: { id: number; name: string; price: number | null; currency: string | null } | null;
    license_status: string | null;
    expires_at: string | null;
    days_remaining: number | null;
    last_payment: { amount: number; method: string; paid_at: string } | null;
};

export default function LicensesPage() {
    const { date, money } = useFormat();
    const [rows, setRows] = useState<LicenseRow[] | null>(null);

    useEffect(() => {
        platformApi.get<LicenseRow[]>('/licenses').then(setRows).catch(() => setRows([]));
    }, []);

    const active = rows?.filter((r) => (r.days_remaining ?? -1) > 30).length ?? 0;
    const due = rows?.filter((r) => r.days_remaining !== null && r.days_remaining >= 0 && r.days_remaining <= 30).length ?? 0;
    const expired = rows?.filter((r) => r.days_remaining !== null && r.days_remaining < 0).length ?? 0;

    return (
        <div className="space-y-6">
            <header className="flex items-center gap-3.5">
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                    <BadgeCheck aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Licences</h1>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Échéances et paiements des licences de chaque pressing.</p>
                </div>
            </header>

            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-3">
                <StatCard label="Actives (> 30 j)" value={active} icon={BadgeCheck} tone="emerald" />
                <StatCard label="À renouveler (≤ 30 j)" value={due} icon={BadgeCheck} tone="amber" />
                <StatCard label="Expirées" value={expired} icon={BadgeCheck} tone="rose" />
            </div>

            <div className={cx(card, 'overflow-hidden')}>
                {rows === null ? (
                    <LoadingState />
                ) : rows.length === 0 ? (
                    <EmptyState icon={BadgeCheck} title="Aucune licence" />
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] text-left text-sm">
                            <thead className="border-b border-ink-200/80 text-xs font-semibold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
                                <tr>
                                    <th className="px-5 py-3">Pressing</th>
                                    <th className="px-4 py-3">Plan</th>
                                    <th className="px-4 py-3">Échéance</th>
                                    <th className="px-4 py-3">Jours restants</th>
                                    <th className="px-4 py-3">Dernier paiement</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                {rows.map((row) => (
                                    <tr key={row.pressing.id}>
                                        <td className="px-5 py-3">
                                            <Link to={`/superadmin/pressings/${row.pressing.id}`} className={cx(textLink, 'font-semibold')}>
                                                {row.pressing.name}
                                            </Link>
                                            <span className="block text-xs text-ink-500 dark:text-ink-400">{row.pressing.code}</span>
                                        </td>
                                        <td className="px-4 py-3">{row.plan ? <Pill tone="brand">{row.plan.name}</Pill> : '—'}</td>
                                        <td className="px-4 py-3 tabular-nums">{row.expires_at ? date(row.expires_at) : '—'}</td>
                                        <td className="px-4 py-3">
                                            {row.days_remaining === null ? (
                                                '—'
                                            ) : (
                                                <Pill tone={row.days_remaining < 0 ? 'rose' : row.days_remaining <= 30 ? 'amber' : 'emerald'}>
                                                    {row.days_remaining < 0 ? `Expirée (${-row.days_remaining} j)` : `${row.days_remaining} j`}
                                                </Pill>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                                            {row.last_payment ? `${money(row.last_payment.amount)} · ${row.last_payment.method} · ${date(row.last_payment.paid_at)}` : 'Aucun'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

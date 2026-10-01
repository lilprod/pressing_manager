import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Pencil, Plus, Search } from 'lucide-react';
import { platformApi } from '../../lib/platformApi';
import { EmptyState, LoadingState } from '../../components/ui/Feedback';
import Pagination from '../../components/ui/Pagination';
import { Pill } from '../../components/ui/StatusBadge';
import { button, card, cx, inputLg } from '../../components/ui/styles';
import type { Paginated, Pressing } from '../../types';

export default function PressingsPage() {
    const [pressings, setPressings] = useState<Pressing[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<Pressing>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    function reload() {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page) });
        if (search) params.set('search', search);
        platformApi
            .get<Paginated<Pressing>>(`/pressings?${params}`)
            .then((res) => {
                setPressings(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [page]);

    useEffect(() => {
        setPage(1);
        const timeout = setTimeout(reload, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3.5">
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                        <Building2 aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="truncate font-display text-2xl font-bold text-ink-900 dark:text-white">Pressings</h1>
                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Gérez l'ensemble des pressings clients de la plateforme.</p>
                    </div>
                </div>
                <Link to="/superadmin/pressings/new" className={button('primary', 'md')}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Nouveau pressing
                </Link>
            </header>

            <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Rechercher un pressing, un code…"
                    className={cx(inputLg, 'pl-12')}
                />
            </div>

            <div className={cx(card, 'overflow-hidden')}>
                {loading ? (
                    <LoadingState />
                ) : pressings.length === 0 ? (
                    <EmptyState icon={Building2} title="Aucun pressing enregistré" />
                ) : (
                    <div className="overflow-x-auto">
                        <div
                            role="row"
                            className="hidden min-w-[760px] items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 sm:flex dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                        >
                            <span className="min-w-0 flex-1">Pressing</span>
                            <span className="w-20 shrink-0">Pays</span>
                            <span className="w-24 shrink-0 text-right">Agences</span>
                            <span className="w-24 shrink-0 text-right">Utilisateurs</span>
                            <span className="w-28 shrink-0">Statut</span>
                            <span className="w-16 shrink-0">Actions</span>
                        </div>
                        <ul className="min-w-[760px] divide-y divide-ink-100 dark:divide-ink-800">
                            {pressings.map((pressing) => (
                                <li key={pressing.id} className="flex flex-wrap items-center gap-4 px-5 py-3.5 sm:flex-nowrap">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{pressing.name}</p>
                                        <p className="text-xs text-ink-500 dark:text-ink-400">
                                            {pressing.code} · {pressing.platform_plan?.name ?? '—'}
                                        </p>
                                    </div>
                                    <span className="w-20 shrink-0 text-sm text-ink-600 dark:text-ink-350">{pressing.country_code ?? '—'}</span>
                                    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink-900 dark:text-white">{pressing.agencies_count}</span>
                                    <span className="w-24 shrink-0 text-right text-sm tabular-nums text-ink-900 dark:text-white">{pressing.users_count}</span>
                                    <span className="w-28 shrink-0">
                                        <Pill tone={pressing.status === 'active' ? 'emerald' : 'neutral'}>
                                            {pressing.status === 'active' ? 'Actif' : 'Suspendu'}
                                        </Pill>
                                    </span>
                                    <Link
                                        to={`/superadmin/pressings/${pressing.id}/edit`}
                                        aria-label={`Modifier ${pressing.name}`}
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-ink-600 transition hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-ink-800"
                                    >
                                        <Pencil aria-hidden="true" className="h-4 w-4" />
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                <Pagination meta={meta} onPageChange={setPage} />
            </div>
        </div>
    );
}

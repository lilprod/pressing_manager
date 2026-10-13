import { useEffect, useState } from 'react';
import { Pencil, Plus, Save, Search, Store, X } from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import Toggle from '../../components/ui/Toggle';
import { button, card, cx, input, label, select } from '../../components/ui/styles';

/* Écran « Agences » cross-tenant (capture Figma, audit du 2026-10-13). Données lues et
 * modifiées directement dans la base partagée (pivot multi-tenant) : identité, contacts,
 * horaires et jours d'ouverture, codes dépôt, délais, étapes atelier, activation. Le
 * panneau de modification est ouvert par défaut sur la première agence, comme la
 * maquette. Le « mode de tarification » est affiché tel qu'il est réellement (par
 * article, grille du pressing + prix locaux de l'agence), pas comme un choix fictif.
 * Omis : la pastille « En ligne / Instable / Hors ligne » (aucune télémétrie de
 * connexion) et « Exiger la validation Laveur → Classeur » (aucune règle de ce type). */

type AgencyRow = {
    id: number;
    code: string;
    name: string;
    city: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    manager_name: string | null;
    local_price_overrides: number;
    is_active: boolean;
    opens_at: string | null;
    closes_at: string | null;
    opening_days: number[] | null;
    pressing: { id: number; name: string; code: string; country_code: string | null; status: string } | null;
    staff_count: number;
    deposits_30d: number;
    settings: {
        order_number_prefix: string | null;
        order_number_suffix: string | null;
        order_number_padding: number;
        standard_delay_hours: number | null;
        express_delay_hours: number | null;
        washer_step_enabled: boolean;
        sorter_step_enabled: boolean;
    };
};

type PressingOption = { id: number; name: string; country_code: string | null };
type Page<T> = { data: T[]; current_page: number; last_page: number; total: number };

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

type Draft = {
    pressing_id: string;
    code: string;
    name: string;
    city: string;
    address: string;
    phone: string;
    email: string;
    opens_at: string;
    closes_at: string;
    opening_days: number[];
    is_active: boolean;
    order_number_prefix: string;
    order_number_suffix: string;
    standard_delay_hours: string;
    express_delay_hours: string;
    washer_step_enabled: boolean;
    sorter_step_enabled: boolean;
};

function toDraft(row: AgencyRow | null): Draft {
    return {
        pressing_id: row?.pressing ? String(row.pressing.id) : '',
        code: row?.code ?? '',
        name: row?.name ?? '',
        city: row?.city ?? '',
        address: row?.address ?? '',
        phone: row?.phone ?? '',
        email: row?.email ?? '',
        opens_at: row?.opens_at ?? '',
        closes_at: row?.closes_at ?? '',
        opening_days: row?.opening_days ?? [],
        is_active: row?.is_active ?? true,
        order_number_prefix: row?.settings.order_number_prefix ?? '',
        order_number_suffix: row?.settings.order_number_suffix ?? '',
        standard_delay_hours: row?.settings.standard_delay_hours != null ? String(row.settings.standard_delay_hours) : '',
        express_delay_hours: row?.settings.express_delay_hours != null ? String(row.settings.express_delay_hours) : '',
        washer_step_enabled: row?.settings.washer_step_enabled ?? true,
        sorter_step_enabled: row?.settings.sorter_step_enabled ?? true,
    };
}

export default function AgenciesPage() {
    const [page, setPage] = useState<Page<AgencyRow> | null>(null);
    const [pressings, setPressings] = useState<PressingOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [pressingId, setPressingId] = useState('');
    const [country, setCountry] = useState('');
    const [status, setStatus] = useState('');
    const [current, setCurrent] = useState(1);
    const [editing, setEditing] = useState<AgencyRow | 'new' | null>(null);
    // Panneau ouvert par défaut sur la première agence (maquette) ; fermé seulement à la demande.
    const [panelClosed, setPanelClosed] = useState(false);

    useEffect(() => {
        platformApi.get<Page<PressingOption>>('/pressings?per_page=100').then((p) => setPressings(p.data)).catch(() => setPressings([]));
    }, []);

    function reload() {
        const query = new URLSearchParams({ page: String(current) });
        if (search.trim()) query.set('search', search.trim());
        if (pressingId) query.set('pressing_id', pressingId);
        if (country) query.set('country_code', country);
        if (status) query.set('status', status);
        setLoading(true);
        platformApi
            .get<Page<AgencyRow>>(`/agencies?${query}`)
            .then((result) => {
                setPage(result);
                setEditing((current) => {
                    if (current === 'new') return current;
                    if (current) return result.data.find((r) => r.id === current.id) ?? current;
                    return panelClosed ? null : result.data[0] ?? null;
                });
            })
            .finally(() => setLoading(false));
    }

    useEffect(() => {
        const handle = setTimeout(reload, 300);
        return () => clearTimeout(handle);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, pressingId, country, status, current]);

    const countries = Array.from(new Set(pressings.map((p) => p.country_code).filter(Boolean))) as string[];

    return (
        <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3.5">
                    <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                        <Store aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div>
                        <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Agences</h1>
                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Implantations de tous les pressings et leur configuration opérationnelle.</p>
                    </div>
                </div>
                <button type="button" onClick={() => { setPanelClosed(false); setEditing('new'); }} className={button('primary', 'md')}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    Nouvelle agence
                </button>
            </header>

            <div className={cx('grid grid-cols-1 items-start gap-6', editing && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
                <div className="min-w-0 space-y-4">
                    <div className={cx(card, 'space-y-3 p-4')}>
                        <div className="relative">
                            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                            <input
                                value={search}
                                onChange={(e) => {
                                    setSearch(e.target.value);
                                    setCurrent(1);
                                }}
                                placeholder="Rechercher une agence, une ville ou un code…"
                                className={cx(input, 'pl-9')}
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <label className="block">
                                <span className={label}>Pressing</span>
                                <select value={pressingId} onChange={(e) => { setPressingId(e.target.value); setCurrent(1); }} className={select}>
                                    <option value="">Tous</option>
                                    {pressings.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className={label}>Pays</span>
                                <select value={country} onChange={(e) => { setCountry(e.target.value); setCurrent(1); }} className={select}>
                                    <option value="">Tous</option>
                                    {countries.map((c) => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className={label}>Statut</span>
                                <select value={status} onChange={(e) => { setStatus(e.target.value); setCurrent(1); }} className={select}>
                                    <option value="">Tous</option>
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </label>
                        </div>
                    </div>

                    <div className={cx(card, 'overflow-hidden')}>
                        <p className="border-b border-ink-100 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:text-ink-400">
                            {page?.total ?? 0} agence(s) · tri : activité des 30 derniers jours
                        </p>
                        {loading && !page ? (
                            <LoadingState />
                        ) : !page || page.data.length === 0 ? (
                            <EmptyState icon={Store} title="Aucune agence" />
                        ) : (
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {page.data.map((row) => (
                                    <li
                                        key={row.id}
                                        className={cx(
                                            'flex flex-wrap items-center gap-3 px-5 py-3.5',
                                            editing !== 'new' && editing?.id === row.id && 'bg-accent-50 dark:bg-accent-500/10',
                                        )}
                                    >
                                        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                                            <p className="truncate font-semibold text-ink-900 dark:text-white">{row.name}</p>
                                            <p className="truncate text-xs text-ink-600 dark:text-ink-350">
                                                {[row.city, row.pressing?.country_code, row.code].filter(Boolean).join(' · ')}
                                            </p>
                                            <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                                                {row.settings.standard_delay_hours ? `Standard ${row.settings.standard_delay_hours} h · ` : ''}
                                                Par article{row.local_price_overrides > 0 ? ` (${row.local_price_overrides} prix locaux)` : ''}
                                                {row.opens_at && row.closes_at ? ` · ${row.opens_at}–${row.closes_at}` : ''}
                                            </p>
                                        </div>
                                        <div className="w-36 min-w-0 text-sm">
                                            <p className="truncate font-medium text-ink-800 dark:text-ink-100">{row.pressing?.name ?? '—'}</p>
                                            <p className="truncate text-xs text-ink-500 dark:text-ink-400">{row.manager_name ?? '—'}</p>
                                        </div>
                                        <div className="w-28 text-right text-sm">
                                            <p className="font-semibold tabular-nums text-ink-900 dark:text-white">{row.deposits_30d} dépôts</p>
                                            <p className="text-xs text-ink-500 dark:text-ink-400">{row.staff_count} staff</p>
                                        </div>
                                        <Pill tone={row.is_active ? 'emerald' : 'neutral'}>{row.is_active ? 'Active' : 'Inactive'}</Pill>
                                        <button type="button" onClick={() => { setPanelClosed(false); setEditing(row); }} className={button('ghost', 'sm')} aria-label={`Modifier ${row.name}`}>
                                            <Pencil aria-hidden="true" className="h-4 w-4" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {page && page.last_page > 1 && (
                            <div className="border-t border-ink-100 px-5 py-3 dark:border-ink-800">
                                <Pagination meta={page} onPageChange={setCurrent} />
                            </div>
                        )}
                    </div>
                </div>

                {editing && (
                    <AgencyPanel
                        key={editing === 'new' ? 'new' : editing.id}
                        row={editing === 'new' ? null : editing}
                        pressings={pressings}
                        onClose={() => {
                            setPanelClosed(true);
                            setEditing(null);
                        }}
                        onSaved={() => {
                            if (editing === 'new') setEditing(null);
                            reload();
                        }}
                    />
                )}
            </div>
        </div>
    );
}

function AgencyPanel({ row, pressings, onClose, onSaved }: { row: AgencyRow | null; pressings: PressingOption[]; onClose: () => void; onSaved: () => void }) {
    const [draft, setDraft] = useState<Draft>(() => toDraft(row));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const isNew = row === null;

    function set<K extends keyof Draft>(key: K, value: Draft[K]) {
        setDraft((d) => ({ ...d, [key]: value }));
    }

    async function save() {
        setBusy(true);
        setError(null);
        const payload: Record<string, unknown> = {
            name: draft.name,
            city: draft.city || null,
            address: draft.address || null,
            phone: draft.phone || null,
            email: draft.email || null,
            opens_at: draft.opens_at || null,
            closes_at: draft.closes_at || null,
            opening_days: draft.opening_days.length > 0 ? [...draft.opening_days].sort() : null,
            is_active: draft.is_active,
            order_number_prefix: draft.order_number_prefix || null,
            order_number_suffix: draft.order_number_suffix || null,
            standard_delay_hours: draft.standard_delay_hours === '' ? null : Number(draft.standard_delay_hours),
            express_delay_hours: draft.express_delay_hours === '' ? null : Number(draft.express_delay_hours),
            washer_step_enabled: draft.washer_step_enabled,
            sorter_step_enabled: draft.sorter_step_enabled,
        };
        try {
            if (isNew) {
                await platformApi.post('/agencies', { ...payload, pressing_id: Number(draft.pressing_id), code: draft.code });
            } else {
                await platformApi.patch(`/agencies/${row.id}`, payload);
            }
            onSaved();
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setBusy(false);
        }
    }

    const selectedPressing = pressings.find((p) => String(p.id) === draft.pressing_id);
    const country = row?.pressing?.country_code ?? selectedPressing?.country_code ?? null;
    const pressingName = row?.pressing?.name ?? selectedPressing?.name ?? null;
    const padding = row?.settings.order_number_padding ?? 4;
    const codeFormat = `${draft.order_number_prefix}(${'0'.repeat(padding)})${draft.order_number_suffix}`;
    const delayOptions = Array.from(new Set([12, 24, 48, 72, 96, ...(draft.standard_delay_hours ? [Number(draft.standard_delay_hours)] : [])])).sort((a, b) => a - b);
    const canSave = draft.name.trim() !== '' && (!isNew || (draft.pressing_id !== '' && draft.code.trim() !== ''));

    return (
        <aside className={cx(card, 'space-y-4 p-5 lg:sticky lg:top-6')}>
            <div className="flex items-start justify-between gap-2">
                <div>
                    <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">{isNew ? 'Nouvelle agence' : "Modifier l'agence"}</h2>
                    {row && <p className="text-xs text-ink-500 dark:text-ink-400">{row.name} · {row.code}</p>}
                </div>
                <button type="button" onClick={onClose} className={button('ghost', 'sm')} aria-label="Fermer">
                    <X aria-hidden="true" className="h-4 w-4" />
                </button>
            </div>
            {error && <Alert tone="error">{error}</Alert>}

            <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-ink-900 dark:text-white">Identité et rattachement</legend>
                <label className="block">
                    <span className={label}>Nom de l'agence *</span>
                    <input value={draft.name} onChange={(e) => set('name', e.target.value)} className={input} />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                        <span className={label}>Pressing</span>
                        <select value={draft.pressing_id} disabled={!isNew} onChange={(e) => set('pressing_id', e.target.value)} className={select}>
                            <option value="">—</option>
                            {pressings.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className={label}>Préfixe codes</span>
                        <input value={draft.order_number_prefix} onChange={(e) => set('order_number_prefix', e.target.value.toUpperCase())} className={input} />
                    </label>
                </div>
                {isNew && (
                    <label className="block">
                        <span className={label}>Code agence *</span>
                        <input value={draft.code} onChange={(e) => set('code', e.target.value.toUpperCase())} className={input} />
                    </label>
                )}
                <label className="block">
                    <span className={label}>Adresse</span>
                    <input value={draft.address} onChange={(e) => set('address', e.target.value)} className={input} />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                        <span className={label}>Ville</span>
                        <input value={draft.city} onChange={(e) => set('city', e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>Pays</span>
                        <input value={country ?? '—'} disabled className={input} title="Pays du pressing de rattachement" />
                    </label>
                </div>
            </fieldset>

            <fieldset className="space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
                <legend className="text-sm font-semibold text-ink-900 dark:text-white">Contacts et horaires</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="block">
                        <span className={label}>Téléphone</span>
                        <input value={draft.phone} onChange={(e) => set('phone', e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>E-mail</span>
                        <input type="email" value={draft.email} onChange={(e) => set('email', e.target.value)} className={input} />
                    </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className={label}>Ouverture</span>
                        <input type="time" value={draft.opens_at} onChange={(e) => set('opens_at', e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>Fermeture</span>
                        <input type="time" value={draft.closes_at} onChange={(e) => set('closes_at', e.target.value)} className={input} />
                    </label>
                </div>
                <div role="group" aria-label="Jours d'ouverture" className="flex flex-wrap gap-1.5">
                    {DAYS.map((day, index) => {
                        const iso = index + 1;
                        const on = draft.opening_days.includes(iso);
                        return (
                            <button
                                key={iso}
                                type="button"
                                aria-pressed={on}
                                onClick={() => set('opening_days', on ? draft.opening_days.filter((d) => d !== iso) : [...draft.opening_days, iso])}
                                className={cx(
                                    'h-8 w-8 rounded-lg text-xs font-bold',
                                    on ? 'bg-brand-700 text-white dark:bg-brand-400 dark:text-ink-950' : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
                                )}
                            >
                                {day}
                            </button>
                        );
                    })}
                </div>
            </fieldset>

            <fieldset className="space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
                <legend className="text-sm font-semibold text-ink-900 dark:text-white">Codes dépôt et délais</legend>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className={label}>Format code dépôt</span>
                        <input value={codeFormat} disabled className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>Délai par défaut</span>
                        <select value={draft.standard_delay_hours} onChange={(e) => set('standard_delay_hours', e.target.value)} className={select}>
                            <option value="">Catalogue</option>
                            {delayOptions.map((h) => (
                                <option key={h} value={String(h)}>{h} heures</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className={label}>Suffixe</span>
                        <input value={draft.order_number_suffix} onChange={(e) => set('order_number_suffix', e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>Délai express (h)</span>
                        <input type="number" min={0} value={draft.express_delay_hours} onChange={(e) => set('express_delay_hours', e.target.value)} className={input} />
                    </label>
                </div>
            </fieldset>

            <fieldset className="space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
                <legend className="text-sm font-semibold text-ink-900 dark:text-white">Workflow atelier</legend>
                <ol className="grid grid-cols-4 gap-1.5">
                    {[
                        { key: 'reception', name: 'Réception', on: true },
                        { key: 'washer', name: 'Laveur', on: draft.washer_step_enabled },
                        { key: 'sorter', name: 'Classeur', on: draft.sorter_step_enabled },
                        { key: 'ready', name: 'Prêt', on: true },
                    ].map((step) => (
                        <li
                            key={step.key}
                            className={cx(
                                'truncate rounded-lg px-2 py-1.5 text-center text-[11px] font-semibold',
                                step.on ? 'bg-brand-50 text-brand-800 dark:bg-brand-500/15 dark:text-brand-200' : 'bg-ink-100 text-ink-400 line-through dark:bg-ink-800 dark:text-ink-500',
                            )}
                        >
                            {step.name}
                        </li>
                    ))}
                </ol>
                <Toggle checked={draft.washer_step_enabled} onChange={(v) => set('washer_step_enabled', v)} label="Étape Laveur" />
                <Toggle checked={draft.sorter_step_enabled} onChange={(v) => set('sorter_step_enabled', v)} label="Étape Classeur" />
            </fieldset>

            <fieldset className="space-y-3 border-t border-ink-100 pt-4 dark:border-ink-800">
                <legend className="text-sm font-semibold text-ink-900 dark:text-white">Tarification et activation</legend>
                <div>
                    <span className={label}>Mode de tarification</span>
                    <p className="rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-sm text-ink-800 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
                        Par article · grille {pressingName ?? 'du pressing'}
                        {row && row.local_price_overrides > 0 ? ` · ${row.local_price_overrides} prix local(aux)` : ''}
                    </p>
                </div>
                <Toggle checked={draft.is_active} onChange={(v) => set('is_active', v)} label="Agence active" description="Autorise dépôts, atelier et encaissements." />
            </fieldset>

            <div className="flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-4 dark:border-ink-800">
                <button type="button" onClick={onClose} className={button('ghost', 'md')}>
                    Annuler
                </button>
                <button type="button" onClick={() => void save()} disabled={!canSave || busy} className={button('primary', 'md')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                    Enregistrer l'agence
                </button>
            </div>
        </aside>
    );
}

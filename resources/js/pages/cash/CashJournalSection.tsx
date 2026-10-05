import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileDown, FileSpreadsheet, ScrollText, Search } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import Pagination from '../../components/ui/Pagination';
import { Pill, type Tone } from '../../components/ui/StatusBadge';
import { button, card, cx, input, label as labelClass, sectionTitle } from '../../components/ui/styles';
import type { CashLedgerEntry, CashLedgerKind, Paginated } from '../../types';

const KIND_TONES: Record<CashLedgerKind, Tone> = { mouvement: 'sky', encaissement: 'emerald', cloture: 'amber' };

const PAYMENT_METHOD_KEYS: Record<string, string> = {
    espece: 'cash.method.espece',
    carte: 'cash.method.carte',
    flooz: 'payment.flooz',
    tmoney: 'payment.tmoney',
};

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/**
 * « Journal de caisse » (écran Centre de caisse, Figma) : table filtrable/paginée qui
 * unifie mouvements manuels, encaissements et clôtures (voir CashLedgerService) —
 * remplace les deux listes simples « Mouvements récents »/« Clôtures récentes ».
 */
export default function CashJournalSection({ agencyId }: { agencyId: number }) {
    const { t } = useI18n();
    const { money, dateTime } = useFormat();

    const [entries, setEntries] = useState<CashLedgerEntry[]>([]);
    const [meta, setMeta] = useState<Pick<Paginated<unknown>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [page, setPage] = useState(1);
    const [type, setType] = useState('');
    const [status, setStatus] = useState('');
    const [methodFilter, setMethodFilter] = useState('');
    const [search, setSearch] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

    function buildParams(extra: Record<string, string> = {}): URLSearchParams {
        const params = new URLSearchParams({ agency_id: String(agencyId), ...extra });
        if (type) params.set('type', type);
        if (status) params.set('status', status);
        if (methodFilter) params.set('method', methodFilter);
        if (search) params.set('search', search);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        return params;
    }

    useEffect(() => {
        setLoading(true);
        const params = buildParams({ page: String(page), per_page: '10' });
        api
            .get<Paginated<CashLedgerEntry>>(`/cash/ledger?${params}`)
            .then((res) => {
                setEntries(res.data);
                setMeta({ current_page: res.current_page, last_page: res.last_page, total: res.total });
            })
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [agencyId, type, status, methodFilter, search, from, to, page]);

    useEffect(() => setPage(1), [agencyId, type, status, methodFilter, search, from, to]);

    function categoryLabel(entry: CashLedgerEntry): string {
        if (entry.kind === 'mouvement') return t(`cash.movementCategory.${entry.category}`);
        if (entry.kind === 'encaissement') return t(PAYMENT_METHOD_KEYS[entry.category] ?? entry.category);
        return t('cash.ledger.kind.cloture');
    }

    function statusLabel(status: string): string {
        const key = `cash.ledger.status.${status}`;
        return t(key) === key ? status : t(key);
    }

    async function exportAs(kind: 'pdf' | 'excel') {
        setExporting(kind);
        try {
            const params = buildParams({
                from: from || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
                to: to || new Date().toISOString().slice(0, 10),
            });
            const blob = await api.blob(`/cash/ledger/export/${kind}?${params}`);
            downloadBlob(blob, `journal-caisse.${kind === 'pdf' ? 'pdf' : 'xlsx'}`);
        } finally {
            setExporting(null);
        }
    }

    return (
        <section className={cx(card, 'overflow-hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
                <div>
                    <h2 className={sectionTitle}>{t('cash.ledger.title')}</h2>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('cash.ledger.subtitle', { count: meta.total })}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void exportAs('pdf')} disabled={exporting !== null} className={button('secondary', 'sm')}>
                        {exporting === 'pdf' ? <Spinner className="h-4 w-4" /> : <FileDown aria-hidden="true" className="h-4 w-4" />}
                        {t('cash.ledger.exportPdf')}
                    </button>
                    <button type="button" onClick={() => void exportAs('excel')} disabled={exporting !== null} className={button('secondary', 'sm')}>
                        {exporting === 'excel' ? <Spinner className="h-4 w-4" /> : <FileSpreadsheet aria-hidden="true" className="h-4 w-4" />}
                        {t('cash.ledger.exportExcel')}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-end gap-3 px-5 pt-4">
                <label className="block min-w-[200px] flex-1 basis-full sm:basis-auto">
                    <span className={labelClass}>{t('cash.ledger.search')}</span>
                    <div className="relative">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} className={cx(input, 'pl-9')} placeholder={t('cash.ledger.searchPlaceholder')} />
                    </div>
                </label>
                <label className="block basis-full sm:basis-auto">
                    <span className={labelClass}>{t('cash.ledger.filterType')}</span>
                    <select value={type} onChange={(e) => setType(e.target.value)} className={cx(input, 'sm:w-44')}>
                        <option value="">{t('cash.ledger.allTypes')}</option>
                        <option value="mouvement">{t('cash.ledger.kind.mouvement')}</option>
                        <option value="encaissement">{t('cash.ledger.kind.encaissement')}</option>
                        <option value="cloture">{t('cash.ledger.kind.cloture')}</option>
                    </select>
                </label>
                <label className="block basis-full sm:basis-auto">
                    <span className={labelClass}>{t('cash.ledger.filterStatus')}</span>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className={cx(input, 'sm:w-40')}>
                        <option value="">{t('cash.ledger.allStatuses')}</option>
                        <option value="valide">{statusLabel('valide')}</option>
                        <option value="en_attente">{statusLabel('en_attente')}</option>
                        <option value="complete">{statusLabel('complete')}</option>
                        <option value="echoue">{statusLabel('echoue')}</option>
                        <option value="rembourse">{statusLabel('rembourse')}</option>
                        <option value="conforme">{statusLabel('conforme')}</option>
                        <option value="ecart">{statusLabel('ecart')}</option>
                    </select>
                </label>
                <label className="block basis-full sm:basis-auto">
                    <span className={labelClass}>{t('cash.ledger.filterMethod')}</span>
                    <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)} className={cx(input, 'sm:w-40')}>
                        <option value="">{t('cash.ledger.allMethods')}</option>
                        <option value="espece">{t('cash.method.espece')}</option>
                        <option value="carte">{t('cash.method.carte')}</option>
                        <option value="flooz">{t('payment.flooz')}</option>
                        <option value="tmoney">{t('payment.tmoney')}</option>
                    </select>
                </label>
                <label className="block basis-full sm:basis-auto">
                    <span className={labelClass}>{t('cash.ledger.filters.from')}</span>
                    <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={cx(input, 'sm:w-40')} />
                </label>
                <label className="block basis-full sm:basis-auto">
                    <span className={labelClass}>{t('cash.ledger.filters.to')}</span>
                    <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={cx(input, 'sm:w-40')} />
                </label>
            </div>

            <div className="mt-4">
                {loading ? (
                    <LoadingState />
                ) : entries.length === 0 ? (
                    <EmptyState icon={ScrollText} title={t('cash.ledger.none')} compact />
                ) : (
                    <div className="overflow-x-auto">
                        <div className="min-w-[820px]">
                            <div
                                role="row"
                                className="flex items-center gap-4 border-b border-ink-200/80 bg-ink-50 px-5 py-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400"
                            >
                                <span className="w-36 shrink-0">{t('cash.ledger.table.date')}</span>
                                <span className="w-28 shrink-0">{t('cash.ledger.table.type')}</span>
                                <span className="flex-1">{t('cash.ledger.table.reference')}</span>
                                <span className="w-32 shrink-0">{t('cash.ledger.table.agent')}</span>
                                <span className="w-32 shrink-0 text-right">{t('cash.ledger.table.amount')}</span>
                                <span className="w-28 shrink-0">{t('cash.ledger.table.status')}</span>
                            </div>
                            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                                {entries.map((entry, index) => {
                                    const row = (
                                        <>
                                            <p className="w-36 shrink-0 text-sm text-ink-600 dark:text-ink-350">{dateTime(entry.date)}</p>
                                            <div className="w-28 shrink-0">
                                                <Pill tone={KIND_TONES[entry.kind]}>{t(`cash.ledger.kind.${entry.kind}`)}</Pill>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium text-ink-900 dark:text-white">{entry.reference ?? categoryLabel(entry)}</p>
                                                <p className="truncate text-xs text-ink-500 dark:text-ink-400">{categoryLabel(entry)}</p>
                                            </div>
                                            <p className="w-32 shrink-0 truncate text-sm text-ink-600 dark:text-ink-350">{entry.agent_name ?? '—'}</p>
                                            <p
                                                className={cx(
                                                    'w-32 shrink-0 text-right font-display text-sm font-bold tabular-nums',
                                                    entry.direction === '-' ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400',
                                                )}
                                            >
                                                {entry.direction === '-' ? '-' : entry.direction === '+' ? '+' : ''}
                                                {money(entry.amount)}
                                            </p>
                                            <div className="w-28 shrink-0">
                                                <Pill tone="neutral">{statusLabel(entry.status)}</Pill>
                                            </div>
                                        </>
                                    );

                                    return (
                                        <li key={`${entry.kind}-${entry.source_id}-${index}`}>
                                            {entry.movement_id ? (
                                                <Link
                                                    to={`/cash/movements/${entry.movement_id}`}
                                                    className="flex items-center gap-4 px-5 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-800/60"
                                                >
                                                    {row}
                                                </Link>
                                            ) : (
                                                <div className="flex items-center gap-4 px-5 py-3">{row}</div>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    </div>
                )}
                <Pagination meta={meta} onPageChange={setPage} />
            </div>
        </section>
    );
}

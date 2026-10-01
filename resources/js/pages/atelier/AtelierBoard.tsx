import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Pencil, Search, UserRound, Workflow, X, Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { elapsedLabel, useFormat } from '../../lib/format';
import PageHeader, { Avatar } from '../../components/ui/PageHeader';
import { Pill } from '../../components/ui/StatusBadge';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Timeline, type TimelineEntry } from '../../components/ui/Timeline';
import { button, card, cx, iconButton, input, label as labelClass, select, sectionTitle, textLink } from '../../components/ui/styles';
import type { AtelierBoardResponse, AtelierCard, AtelierColumn, AtelierStaffMember, Order, OrderPriority, OrderStatus } from '../../types';

const COLUMNS: AtelierColumn[] = ['attente', 'cours', 'traites', 'classes'];
const PRIORITIES: OrderPriority[] = ['urgent', 'haute', 'normale'];

function columnForStatus(status: OrderStatus): AtelierColumn | null {
    switch (status) {
        case 'recu':
        case 'trie':
            return 'attente';
        case 'en_traitement':
            return 'cours';
        case 'controle_qualite':
            return 'traites';
        case 'pret':
            return 'classes';
        default:
            return null;
    }
}

function nextColumn(column: AtelierColumn | null): AtelierColumn | null {
    if (!column) return null;
    const index = COLUMNS.indexOf(column);
    return index >= 0 && index < COLUMNS.length - 1 ? COLUMNS[index + 1] : null;
}

function priorityTone(priority: OrderPriority): 'rose' | 'amber' | 'neutral' {
    if (priority === 'urgent') return 'rose';
    if (priority === 'haute') return 'amber';
    return 'neutral';
}

export default function AtelierBoard() {
    const { t } = useI18n();
    const { dateTime } = useFormat();
    const { user, activeAgencyId } = useAuth();
    const agencyId = user?.agency_id ?? activeAgencyId;

    const [board, setBoard] = useState<AtelierBoardResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [staff, setStaff] = useState<AtelierStaffMember[]>([]);
    const [search, setSearch] = useState('');
    const [priorityFilter, setPriorityFilter] = useState<OrderPriority | ''>('');
    const [responsibleFilter, setResponsibleFilter] = useState<number | ''>('');

    const [searchParams] = useSearchParams();
    const [selectedId, setSelectedId] = useState<number | null>(() => {
        const param = searchParams.get('order');
        return param ? Number(param) : null;
    });
    const [detailOrder, setDetailOrder] = useState<Order | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [actionBusy, setActionBusy] = useState(false);
    const [editingResponsables, setEditingResponsables] = useState(false);
    const [washerDraft, setWasherDraft] = useState<number | ''>('');
    const [sorterDraft, setSorterDraft] = useState<number | ''>('');

    function loadBoard() {
        if (!agencyId) {
            setBoard(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        setLoadError(null);
        const params = new URLSearchParams({ agency_id: String(agencyId) });
        if (search) params.set('q', search);
        if (priorityFilter) params.set('priority', priorityFilter);
        if (responsibleFilter) params.set('responsible_id', String(responsibleFilter));
        api
            .get<AtelierBoardResponse>(`/atelier/board?${params}`)
            .then(setBoard)
            .catch((err) => setLoadError(err instanceof ApiError ? err.message : t('common.error')))
            .finally(() => setLoading(false));
    }

    useEffect(loadBoard, [agencyId, priorityFilter, responsibleFilter]);

    useEffect(() => {
        const timeout = setTimeout(loadBoard, 250);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    useEffect(() => {
        if (!agencyId) {
            setStaff([]);
            return;
        }
        api
            .get<AtelierStaffMember[]>(`/atelier/staff?agency_id=${agencyId}`)
            .then(setStaff)
            .catch(() => setStaff([]));
    }, [agencyId]);

    function loadDetail(id: number) {
        setDetailLoading(true);
        api
            .get<Order>(`/orders/${id}`)
            .then(setDetailOrder)
            .finally(() => setDetailLoading(false));
    }

    useEffect(() => {
        if (selectedId === null) {
            setDetailOrder(null);
            setEditingResponsables(false);
            return;
        }
        loadDetail(selectedId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedId]);

    useEffect(() => {
        if (detailOrder) {
            setWasherDraft(detailOrder.washer_id ?? '');
            setSorterDraft(detailOrder.sorter_id ?? '');
        }
    }, [detailOrder]);

    const cardsByColumn = useMemo(() => {
        const grouped: Record<AtelierColumn, AtelierCard[]> = { attente: [], cours: [], traites: [], classes: [] };
        board?.orders.forEach((order) => grouped[order.column].push(order));
        return grouped;
    }, [board]);

    const detailColumn = detailOrder ? columnForStatus(detailOrder.status) : null;
    const detailNextColumn = nextColumn(detailColumn);
    const detailIsLate =
        detailOrder !== null &&
        detailOrder.promised_at !== null &&
        new Date(detailOrder.promised_at) < new Date() &&
        !['pret', 'livre', 'annule'].includes(detailOrder.status);

    const workshopTimeline = useMemo<TimelineEntry[]>(() => {
        if (!detailOrder) return [];
        const entries: TimelineEntry[] = detailOrder.items.flatMap(
            (item) =>
                item.status_histories?.map((h) => ({
                    id: `history-${h.id}`,
                    label: t('order.timeline.itemStatus', { item: item.service?.name ?? t('order.item'), status: t(`status.${h.to_status}`) }),
                    detail: h.notes ?? undefined,
                    at: h.changed_at,
                    actor: h.actor?.name ?? null,
                })) ?? [],
        );
        entries.push({ id: 'order-created', label: t('order.timeline.created'), at: detailOrder.created_at, actor: detailOrder.creator?.name ?? null });
        return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    }, [detailOrder, t]);

    async function advance(id: number) {
        setActionBusy(true);
        try {
            await api.post(`/atelier/orders/${id}/advance`);
            loadBoard();
            if (selectedId === id) loadDetail(id);
        } catch (err) {
            setLoadError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setActionBusy(false);
        }
    }

    async function changePriority(id: number, priority: OrderPriority) {
        await api.patch(`/atelier/orders/${id}/priority`, { priority });
        loadBoard();
        if (selectedId === id) loadDetail(id);
    }

    async function saveResponsables(id: number) {
        setActionBusy(true);
        try {
            await api.patch(`/atelier/orders/${id}/responsables`, {
                washer_id: washerDraft || null,
                sorter_id: sorterDraft || null,
            });
            setEditingResponsables(false);
            loadBoard();
            loadDetail(id);
        } catch (err) {
            setLoadError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setActionBusy(false);
        }
    }

    function itemsSummaryLabel(summary: AtelierCard['items_summary']) {
        return summary.unit === 'kg' ? `${summary.value} kg` : t('order.itemsCount', { count: summary.value });
    }

    function timingLabel(entry: AtelierCard) {
        const elapsed = elapsedLabel(entry.last_change_at);
        if (entry.is_late) return t('atelier.card.late', { elapsed });
        switch (entry.column) {
            case 'attente':
                return t('atelier.card.since', { elapsed });
            case 'cours':
                return t('atelier.card.inProgress', { elapsed });
            case 'traites':
                return t('atelier.card.processedAgo', { elapsed });
            case 'classes':
                return t('atelier.card.readySince', { elapsed });
        }
    }

    function responsibleFor(entry: AtelierCard) {
        return entry.column === 'attente' || entry.column === 'cours' ? entry.washer : entry.sorter;
    }

    return (
        <div className="space-y-6">
            <PageHeader title={t('atelier.title')} subtitle={t('atelier.subtitle')} icon={Workflow} />

            {!agencyId ? (
                <div className={card}>
                    <EmptyState icon={Workflow} title={t('atelier.selectAgency')} description={t('atelier.selectAgencyHint')} />
                </div>
            ) : (
                <div className={cx('grid items-start gap-6', selectedId !== null && 'lg:grid-cols-[minmax(0,1fr)_380px]')}>
                    <div className="min-w-0 space-y-4">
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="relative min-w-[220px] flex-1">
                                <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder={t('atelier.search')}
                                    className={cx(input, 'pl-10')}
                                />
                            </div>
                            <select
                                value={priorityFilter}
                                onChange={(e) => setPriorityFilter(e.target.value as OrderPriority | '')}
                                className={cx(select, 'w-auto sm:w-48')}
                            >
                                <option value="">{t('atelier.filters.allPriorities')}</option>
                                {PRIORITIES.map((p) => (
                                    <option key={p} value={p}>
                                        {t(`atelier.priority.${p}`)}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={responsibleFilter}
                                onChange={(e) => setResponsibleFilter(e.target.value ? Number(e.target.value) : '')}
                                className={cx(select, 'w-auto sm:w-48')}
                            >
                                <option value="">{t('atelier.filters.allResponsibles')}</option>
                                {staff.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {loadError && <Alert tone="error">{loadError}</Alert>}

                        {board && (
                            <div className={cx(card, 'space-y-2 p-5')}>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="font-semibold text-ink-900 dark:text-white">
                                        {t('atelier.capacity.title')} · {board.active_count}/{board.capacity}
                                    </span>
                                    <span className="text-ink-600 dark:text-ink-350">
                                        {board.capacity > 0 ? Math.round((board.active_count / board.capacity) * 100) : 0}%
                                    </span>
                                </div>
                                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                                    <div
                                        className={cx(
                                            'h-full rounded-full transition-all',
                                            board.active_count / board.capacity >= 1
                                                ? 'bg-red-500'
                                                : board.active_count / board.capacity >= 0.8
                                                  ? 'bg-amber-500'
                                                  : 'bg-emerald-500',
                                        )}
                                        style={{ width: `${Math.min(100, board.capacity > 0 ? (board.active_count / board.capacity) * 100 : 0)}%` }}
                                    />
                                </div>
                                <p className="text-xs text-ink-500 dark:text-ink-400">
                                    {board.active_count / board.capacity >= 1
                                        ? t('atelier.capacity.critical')
                                        : board.active_count / board.capacity >= 0.8
                                          ? t('atelier.capacity.high')
                                          : t('atelier.capacity.controlled')}
                                    {' · '}
                                    {t('atelier.capacity.freeSlots', { count: Math.max(0, board.capacity - board.active_count) })}
                                </p>
                            </div>
                        )}

                        {loading ? (
                            <LoadingState />
                        ) : board && board.orders.length === 0 ? (
                            <div className={card}>
                                <EmptyState icon={Workflow} title={t('atelier.noResults')} />
                            </div>
                        ) : (
                            board && (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                    {COLUMNS.map((col) => (
                                        <div key={col} className={cx(card, 'flex min-h-[200px] flex-col overflow-hidden')}>
                                            <div className="flex items-center justify-between border-b border-ink-200/80 px-4 py-3 dark:border-ink-800">
                                                <span className="text-sm font-bold text-ink-900 dark:text-white">{t(`atelier.column.${col}`)}</span>
                                                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-bold text-ink-700 dark:bg-ink-800 dark:text-ink-200">
                                                    {cardsByColumn[col].length}
                                                </span>
                                            </div>
                                            <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
                                                {cardsByColumn[col].length === 0 ? (
                                                    <p className="px-1 py-6 text-center text-xs text-ink-500 dark:text-ink-400">{t('atelier.column.empty')}</p>
                                                ) : (
                                                    cardsByColumn[col].map((o) => {
                                                        const responsible = responsibleFor(o);
                                                        return (
                                                            <button
                                                                key={o.id}
                                                                type="button"
                                                                onClick={() => setSelectedId(o.id)}
                                                                aria-pressed={selectedId === o.id}
                                                                className={cx(
                                                                    'w-full rounded-xl border p-3 text-left text-sm transition hover:shadow-md',
                                                                    o.is_late
                                                                        ? 'border-amber-300 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/5'
                                                                        : selectedId === o.id
                                                                          ? 'border-brand-400 bg-brand-50/70 dark:border-brand-400/40 dark:bg-brand-400/10'
                                                                          : 'border-ink-200 bg-white hover:bg-ink-50 dark:border-ink-700 dark:bg-ink-900 dark:hover:bg-ink-800/60',
                                                                )}
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="truncate font-display font-bold text-ink-900 dark:text-white">
                                                                        {t('order.number')}
                                                                        {o.order_number}
                                                                    </span>
                                                                    <Pill tone={priorityTone(o.priority ?? 'normale')}>{t(`atelier.priority.${o.priority ?? 'normale'}`)}</Pill>
                                                                </div>
                                                                <p className="truncate font-semibold text-ink-900 dark:text-ink-50">
                                                                    {o.client?.first_name} {o.client?.last_name}
                                                                </p>
                                                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-600 dark:text-ink-350">
                                                                    {o.is_express ? (
                                                                        <Pill tone="accent" icon={Zap}>
                                                                            {t('order.expressShort')}
                                                                        </Pill>
                                                                    ) : (
                                                                        <Pill tone="neutral">{t('order.standard')}</Pill>
                                                                    )}
                                                                    <span>{itemsSummaryLabel(o.items_summary)}</span>
                                                                </div>
                                                                {o.promised_at && <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{dateTime(o.promised_at)}</p>}
                                                                <p className={cx('mt-1 text-xs font-medium', o.is_late ? 'text-amber-700 dark:text-amber-300' : 'text-ink-500 dark:text-ink-400')}>
                                                                    {o.is_late && <AlertTriangle aria-hidden="true" className="mr-1 inline h-3 w-3" />}
                                                                    {timingLabel(o)}
                                                                </p>
                                                                <div className="mt-2 flex items-center gap-1.5 text-xs text-ink-600 dark:text-ink-350">
                                                                    {responsible ? (
                                                                        <>
                                                                            <Avatar firstName={responsible.name.split(' ')[0]} lastName={responsible.name.split(' ').slice(1).join(' ')} size="sm" />
                                                                            <span className="truncate">{responsible.name}</span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <UserRound aria-hidden="true" className="h-4 w-4 text-ink-400" />
                                                                            <span>{t('atelier.card.notAssigned')}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )
                        )}
                    </div>

                    {selectedId !== null && (
                        <aside aria-label={t('atelier.detail.title')} className={cx(card, 'animate-fade-in overflow-hidden lg:sticky lg:top-20')}>
                            {detailLoading || !detailOrder ? (
                                <LoadingState />
                            ) : (
                                <>
                                    <div className="relative border-b border-ink-200/80 p-5 dark:border-ink-800">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(null)}
                                            aria-label={t('common.close')}
                                            className={cx(iconButton, 'absolute right-3 top-3')}
                                        >
                                            <X aria-hidden="true" className="h-5 w-5" />
                                        </button>
                                        <div className="flex flex-wrap items-center gap-2 pr-10">
                                            <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">
                                                {t('order.number')}
                                                {detailOrder.order_number}
                                            </h2>
                                            <select
                                                value={detailOrder.priority ?? 'normale'}
                                                onChange={(e) => void changePriority(detailOrder.id, e.target.value as OrderPriority)}
                                                className={cx(select, 'h-7 w-auto px-2 py-0 text-xs font-semibold')}
                                            >
                                                {PRIORITIES.map((p) => (
                                                    <option key={p} value={p}>
                                                        {t(`atelier.priority.${p}`)}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <p className="mt-1 font-semibold text-ink-800 dark:text-ink-100">
                                            {detailOrder.client?.first_name} {detailOrder.client?.last_name}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-600 dark:text-ink-350">
                                            {detailOrder.is_express ? (
                                                <Pill tone="accent" icon={Zap}>
                                                    {t('order.expressShort')}
                                                </Pill>
                                            ) : (
                                                <Pill tone="neutral">{t('order.standard')}</Pill>
                                            )}
                                            <span>{t('order.itemsCount', { count: detailOrder.items.reduce((sum, i) => sum + i.quantity, 0) })}</span>
                                            {detailOrder.promised_at && <span>· {dateTime(detailOrder.promised_at)}</span>}
                                        </div>
                                        {detailIsLate && (
                                            <div className="mt-3">
                                                <Alert tone="warning">{t('atelier.detail.lateAlert', { elapsed: elapsedLabel(detailOrder.promised_at as string) })}</Alert>
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-2 border-b border-ink-200/80 p-5 dark:border-ink-800">
                                        <h3 className={cx(sectionTitle, 'flex items-center justify-between text-sm')}>
                                            {t('atelier.detail.articles')}
                                            <span className="text-xs font-normal text-ink-500 dark:text-ink-400">
                                                {t('atelier.detail.articlesTotal', { count: detailOrder.items.reduce((sum, i) => sum + i.quantity, 0) })}
                                            </span>
                                        </h3>
                                        <ul className="space-y-1 text-sm text-ink-700 dark:text-ink-200">
                                            {detailOrder.items.map((item) => (
                                                <li key={item.id} className="flex items-center justify-between gap-2">
                                                    <span className="truncate">{item.service?.name ?? t('order.item')}</span>
                                                    <span className="shrink-0 font-semibold tabular-nums">{item.weight_kg != null ? `${item.weight_kg} kg` : `× ${item.quantity}`}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    {detailOrder.notes && (
                                        <div className="space-y-1.5 border-b border-ink-200/80 p-5 dark:border-ink-800">
                                            <h3 className={cx(sectionTitle, 'text-sm')}>{t('atelier.detail.remarks')}</h3>
                                            <p className="whitespace-pre-line text-sm text-ink-700 dark:text-ink-200">{detailOrder.notes}</p>
                                        </div>
                                    )}

                                    <div className="space-y-3 border-b border-ink-200/80 p-5 dark:border-ink-800">
                                        <div className="flex items-center justify-between">
                                            <h3 className={cx(sectionTitle, 'text-sm')}>{t('atelier.detail.responsables')}</h3>
                                            {!editingResponsables && (
                                                <button type="button" onClick={() => setEditingResponsables(true)} className={cx(textLink, 'inline-flex items-center gap-1 text-xs')}>
                                                    <Pencil aria-hidden="true" className="h-3 w-3" />
                                                    {t('atelier.detail.editResponsables')}
                                                </button>
                                            )}
                                        </div>

                                        {editingResponsables ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <label className={labelClass}>{t('atelier.detail.washer')}</label>
                                                    <select value={washerDraft} onChange={(e) => setWasherDraft(e.target.value ? Number(e.target.value) : '')} className={select}>
                                                        <option value="">{t('atelier.detail.unassigned')}</option>
                                                        {staff.map((s) => (
                                                            <option key={s.id} value={s.id}>
                                                                {s.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className={labelClass}>{t('atelier.detail.sorter')}</label>
                                                    <select value={sorterDraft} onChange={(e) => setSorterDraft(e.target.value ? Number(e.target.value) : '')} className={select}>
                                                        <option value="">{t('atelier.detail.unassigned')}</option>
                                                        {staff.map((s) => (
                                                            <option key={s.id} value={s.id}>
                                                                {s.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button type="button" disabled={actionBusy} onClick={() => void saveResponsables(detailOrder.id)} className={button('primary', 'sm')}>
                                                        {actionBusy && <Spinner className="h-3.5 w-3.5" />}
                                                        {t('atelier.detail.saveResponsables')}
                                                    </button>
                                                    <button type="button" onClick={() => setEditingResponsables(false)} className={button('ghost', 'sm')}>
                                                        {t('atelier.detail.cancel')}
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <dl className="space-y-2 text-sm">
                                                <div className="flex items-center justify-between">
                                                    <dt className="text-ink-500 dark:text-ink-400">{t('atelier.detail.washer')}</dt>
                                                    <dd className="font-medium text-ink-800 dark:text-ink-100">{detailOrder.washer?.name ?? t('atelier.card.notAssigned')}</dd>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <dt className="text-ink-500 dark:text-ink-400">{t('atelier.detail.sorter')}</dt>
                                                    <dd className="font-medium text-ink-800 dark:text-ink-100">{detailOrder.sorter?.name ?? t('atelier.card.notAssigned')}</dd>
                                                </div>
                                            </dl>
                                        )}
                                    </div>

                                    <div className="space-y-2 border-b border-ink-200/80 p-5 dark:border-ink-800">
                                        <h3 className={cx(sectionTitle, 'text-sm')}>{t('order.timeline.title')}</h3>
                                        <Timeline entries={workshopTimeline} emptyLabel={t('order.timeline.empty')} />
                                    </div>

                                    <div className="space-y-3 p-5">
                                        {detailNextColumn && (
                                            <button
                                                type="button"
                                                disabled={actionBusy}
                                                onClick={() => void advance(detailOrder.id)}
                                                className={cx(button('primary', 'md'), 'w-full justify-center')}
                                            >
                                                {actionBusy ? <Spinner className="h-4 w-4" /> : <ArrowRight aria-hidden="true" className="h-4 w-4" />}
                                                {t('atelier.detail.advance', { column: t(`atelier.column.${detailNextColumn}`) })}
                                            </button>
                                        )}
                                        <p className="text-center text-xs text-ink-500 dark:text-ink-400">{t('atelier.detail.advanceHint')}</p>
                                        <Link to={`/orders/${detailOrder.id}`} className={cx(textLink, 'block text-center text-sm')}>
                                            {t('atelier.detail.openOrder')}
                                        </Link>
                                    </div>
                                </>
                            )}
                        </aside>
                    )}
                </div>
            )}
        </div>
    );
}

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState } from '../components/ui/Feedback';
import Pagination from '../components/ui/Pagination';
import { Pill } from '../components/ui/StatusBadge';
import { button, card, cardPadded, cx, input, inputSm, label, select, sectionTitle } from '../components/ui/styles';
import {
    Boxes,
    Building2,
    History,
    PackageMinus,
    PackagePlus,
    Plus,
    Truck,
    TriangleAlert,
} from 'lucide-react';
import type { Paginated, StockLevel, StockMovement, StockMovementReason, StockMovementType, Supplier } from '../types';

export default function StockPage() {
    const { user, activeAgencyId } = useAuth();
    const { t } = useI18n();
    const agencyId = user?.agency_id ?? activeAgencyId;
    // Un utilisateur local a une agence imposée côté API (champ "prohibited") ; seul un
    // rôle global (agency_id null) doit préciser l'agence visée dans le corps de la requête.
    const requestAgencyId = user?.agency_id ? undefined : (agencyId ?? undefined);

    const [levels, setLevels] = useState<StockLevel[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [movements, setMovements] = useState<StockMovement[]>([]);
    const [movementsMeta, setMovementsMeta] = useState<Pick<Paginated<StockMovement>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [movementsPage, setMovementsPage] = useState(1);
    const [loading, setLoading] = useState(true);

    function reload() {
        if (!agencyId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        Promise.all([
            api.get<StockLevel[]>(`/stock?agency_id=${agencyId}`),
            api.get<Supplier[]>(`/suppliers?agency_id=${agencyId}`),
            api.get<Paginated<StockMovement>>(`/stock-movements?agency_id=${agencyId}&per_page=10&page=${movementsPage}`),
        ])
            .then(([levelsRes, suppliersRes, movementsRes]) => {
                setLevels(levelsRes);
                setSuppliers(suppliersRes);
                setMovements(movementsRes.data);
                setMovementsMeta({ current_page: movementsRes.current_page, last_page: movementsRes.last_page, total: movementsRes.total });
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [agencyId, movementsPage]);

    function handleMovementRecorded() {
        if (movementsPage === 1) {
            reload();
        } else {
            setMovementsPage(1);
        }
    }

    if (!agencyId) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('stock.title')} subtitle={t('stock.subtitle')} icon={Boxes} />
                <div className={cardPadded}>
                    <EmptyState icon={Building2} title={t('stock.selectAgency')} description={t('stock.selectAgencyHint')} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader title={t('stock.title')} subtitle={t('stock.subtitle')} icon={Boxes} />

            {loading ? (
                <LoadingState />
            ) : (
                <>
                    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                        <StockLevelsPanel levels={levels} />

                        <div className="space-y-6">
                            <MovementForm requestAgencyId={requestAgencyId} levels={levels} suppliers={suppliers} onRecorded={handleMovementRecorded} />
                            <SuppliersPanel agencyId={agencyId} suppliers={suppliers} onCreated={reload} />
                        </div>
                    </div>

                    <MovementHistoryPanel movements={movements} meta={movementsMeta} onPageChange={setMovementsPage} />
                </>
            )}
        </div>
    );
}

function StockLevelsPanel({ levels }: { levels: StockLevel[] }) {
    const { t } = useI18n();

    return (
        <section aria-labelledby="stock-levels-heading" className={cx(card, 'overflow-hidden')}>
            <h2 id="stock-levels-heading" className={cx(sectionTitle, 'flex items-center gap-2 px-5 pb-3 pt-5')}>
                <Boxes aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('stock.levels')}
            </h2>

            {levels.length === 0 ? (
                <EmptyState compact icon={Boxes} title={t('stock.noItems')} />
            ) : (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                    {levels.map((item) => (
                        <li key={item.stock_item_id} className="flex items-center justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{item.name}</p>
                                {item.category && <p className="text-xs text-ink-600 dark:text-ink-350">{item.category}</p>}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                {item.is_low_stock && (
                                    <Pill tone="rose" icon={TriangleAlert}>
                                        {t('stock.lowStock')}
                                    </Pill>
                                )}
                                <span className="font-display font-bold tabular-nums text-ink-900 dark:text-white">
                                    {item.quantity_on_hand} <span className="text-xs font-medium text-ink-600 dark:text-ink-350">{t(`stock.unit.${item.unit}`)}</span>
                                </span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

const REASONS_BY_TYPE: Record<StockMovementType, StockMovementReason[]> = {
    entree: ['livraison', 'ajustement'],
    sortie: ['consommation', 'perte', 'ajustement'],
};

function MovementForm({
    requestAgencyId,
    levels,
    suppliers,
    onRecorded,
}: {
    requestAgencyId: number | undefined;
    levels: StockLevel[];
    suppliers: Supplier[];
    onRecorded: () => void;
}) {
    const { t } = useI18n();
    const [stockItemId, setStockItemId] = useState<number | ''>('');
    const [type, setType] = useState<StockMovementType>('entree');
    const [quantity, setQuantity] = useState(1);
    const [supplierId, setSupplierId] = useState<number | ''>('');
    const [reason, setReason] = useState<StockMovementReason>('livraison');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const availableReasons = REASONS_BY_TYPE[type];

    function changeType(next: StockMovementType) {
        setType(next);
        setReason(REASONS_BY_TYPE[next][0]);
    }

    async function submit() {
        if (!stockItemId) return;
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            await api.post('/stock-movements', {
                agency_id: requestAgencyId,
                stock_item_id: stockItemId,
                type,
                quantity,
                supplier_id: type === 'entree' && supplierId ? supplierId : null,
                reason,
                notes: notes || null,
            });
            setFeedback(t('stock.movementRecorded'));
            setQuantity(1);
            setNotes('');
            onRecorded();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section aria-labelledby="movement-form-heading" className={cx(cardPadded, 'space-y-4')}>
            <h2 id="movement-form-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                <Truck aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('stock.recordMovement')}
            </h2>

            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <fieldset>
                <legend className={label}>{t('stock.type')}</legend>
                <div className="grid grid-cols-2 gap-2">
                    {(['entree', 'sortie'] as const).map((value) => {
                        const checked = type === value;
                        const Icon = value === 'entree' ? PackagePlus : PackageMinus;
                        return (
                            <label
                                key={value}
                                className={cx(
                                    'flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-2 text-sm font-semibold transition duration-150',
                                    'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/25',
                                    checked
                                        ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-300 dark:bg-brand-400/10 dark:text-brand-200'
                                        : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 dark:hover:border-ink-600',
                                )}
                            >
                                <input
                                    type="radio"
                                    name="movement-type"
                                    value={value}
                                    checked={checked}
                                    onChange={() => changeType(value)}
                                    className="sr-only"
                                />
                                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                                {t(`stock.type.${value}`)}
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            <label className="block">
                <span className={label}>{t('order.item')}</span>
                <select value={stockItemId} onChange={(e) => setStockItemId(e.target.value ? Number(e.target.value) : '')} className={select}>
                    <option value="">—</option>
                    {levels.map((item) => (
                        <option key={item.stock_item_id} value={item.stock_item_id}>
                            {item.name} ({item.quantity_on_hand} {t(`stock.unit.${item.unit}`)})
                        </option>
                    ))}
                </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className={label}>{t('common.quantity')}</span>
                    <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} className={input} />
                </label>
                <label className="block">
                    <span className={label}>{t('stock.reason')}</span>
                    <select value={reason} onChange={(e) => setReason(e.target.value as StockMovementReason)} className={select}>
                        {availableReasons.map((r) => (
                            <option key={r} value={r}>
                                {t(`stock.reason.${r}`)}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {type === 'entree' && (
                <label className="block">
                    <span className={label}>{t('stock.supplierOptional')}</span>
                    <select value={supplierId} onChange={(e) => setSupplierId(e.target.value ? Number(e.target.value) : '')} className={select}>
                        <option value="">—</option>
                        {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                                {supplier.name}
                            </option>
                        ))}
                    </select>
                </label>
            )}

            <label className="block">
                <span className={label}>{t('common.notes')}</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
            </label>

            <button type="button" onClick={() => void submit()} disabled={!stockItemId || busy} className={button('primary', 'md', 'w-full')}>
                {type === 'entree' ? <PackagePlus aria-hidden="true" className="h-4 w-4" /> : <PackageMinus aria-hidden="true" className="h-4 w-4" />}
                {t('stock.recordMovement')}
            </button>
        </section>
    );
}

function SuppliersPanel({ agencyId, suppliers, onCreated }: { agencyId: number; suppliers: Supplier[]; onCreated: () => void }) {
    const { t } = useI18n();
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function createSupplier() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/suppliers', { agency_id: agencyId, name, phone: phone || null });
            setName('');
            setPhone('');
            onCreated();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section aria-labelledby="suppliers-heading" className={cx(cardPadded, 'space-y-4')}>
            <h2 id="suppliers-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                <Truck aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('stock.suppliers')}
            </h2>

            {suppliers.length === 0 ? (
                <EmptyState compact icon={Truck} title={t('stock.noSuppliers')} />
            ) : (
                <ul className="space-y-1.5 text-sm">
                    {suppliers.map((supplier) => (
                        <li key={supplier.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-950/50">
                            <span className="font-medium text-ink-900 dark:text-ink-50">{supplier.name}</span>
                            {supplier.phone && <span className="text-ink-600 dark:text-ink-350">{supplier.phone}</span>}
                        </li>
                    ))}
                </ul>
            )}

            <div className="space-y-2 border-t border-ink-200/80 pt-4 dark:border-ink-800">
                {error && <Alert tone="error">{error}</Alert>}
                <div className="flex flex-wrap gap-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('stock.supplierName')} className={cx(inputSm, 'flex-1')} />
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t('client.phone')} className={cx(inputSm, 'w-36')} />
                    <button type="button" onClick={() => void createSupplier()} disabled={!name || busy} className={button('secondary', 'sm')}>
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        {t('common.create')}
                    </button>
                </div>
            </div>
        </section>
    );
}

function MovementHistoryPanel({
    movements,
    meta,
    onPageChange,
}: {
    movements: StockMovement[];
    meta: Pick<Paginated<StockMovement>, 'current_page' | 'last_page' | 'total'>;
    onPageChange: (page: number) => void;
}) {
    const { t } = useI18n();
    const { dateTime } = useFormat();

    return (
        <section aria-labelledby="stock-history-heading" className={cx(card, 'overflow-hidden')}>
            <h2 id="stock-history-heading" className={cx(sectionTitle, 'flex items-center gap-2 px-5 pb-3 pt-5')}>
                <History aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('stock.history')}
            </h2>

            {movements.length === 0 ? (
                <EmptyState compact icon={History} title={t('stock.noMovements')} />
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-ink-50 text-xs uppercase tracking-wider text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">
                            <tr>
                                <th scope="col" className="px-5 py-2.5 font-semibold">
                                    {t('order.item')}
                                </th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">
                                    {t('stock.type')}
                                </th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">
                                    {t('common.quantity')}
                                </th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">
                                    {t('stock.reason')}
                                </th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">
                                    {t('common.date')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                            {movements.map((movement) => (
                                <tr key={movement.id}>
                                    <td className="px-5 py-2.5 font-medium text-ink-900 dark:text-ink-50">{movement.stock_item?.name}</td>
                                    <td className="px-5 py-2.5">
                                        <Pill tone={movement.type === 'entree' ? 'emerald' : 'amber'}>{t(`stock.type.${movement.type}`)}</Pill>
                                    </td>
                                    <td className="px-5 py-2.5 tabular-nums">{movement.quantity}</td>
                                    <td className="px-5 py-2.5">{t(`stock.reason.${movement.reason}`)}</td>
                                    <td className="px-5 py-2.5 text-ink-600 dark:text-ink-350">{dateTime(movement.occurred_at)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <Pagination meta={meta} onPageChange={onPageChange} />
        </section>
    );
}

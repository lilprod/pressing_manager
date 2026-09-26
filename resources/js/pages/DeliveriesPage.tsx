import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import { hasPermission } from '../lib/permissions';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState } from '../components/ui/Feedback';
import StatusBadge, { Pill } from '../components/ui/StatusBadge';
import SignaturePad from '../components/SignaturePad';
import { button, card, cardPadded, cx, input, inputSm, label, select, sectionTitle } from '../components/ui/styles';
import {
    Building2,
    CircleCheck,
    Image as ImageIcon,
    MapPin,
    Plus,
    RotateCcw,
    Truck,
    TriangleAlert,
    UserRound,
} from 'lucide-react';
import type { Delivery, DeliveryStatus, DeliveryZone, Order, Paginated, User } from '../types';

const STATUS_FILTERS: DeliveryStatus[] = ['a_planifier', 'en_cours', 'livree', 'echouee'];

export default function DeliveriesPage() {
    const { user, activeAgencyId } = useAuth();
    const { t } = useI18n();
    const agencyId = user?.agency_id ?? activeAgencyId;
    const canManage = hasPermission(user, 'deliveries.manage');
    const canFulfill = hasPermission(user, 'deliveries.fulfill');

    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    const [zones, setZones] = useState<DeliveryZone[]>([]);
    const [readyOrders, setReadyOrders] = useState<Order[]>([]);
    const [livreurs, setLivreurs] = useState<User[]>([]);
    const [mineOnly, setMineOnly] = useState(canFulfill && !canManage);
    const [statusFilter, setStatusFilter] = useState<DeliveryStatus | ''>('');
    const [loading, setLoading] = useState(true);

    function reload() {
        if (!agencyId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const params = new URLSearchParams({ agency_id: String(agencyId) });
        if (mineOnly) params.set('mine', '1');
        if (statusFilter) params.set('status', statusFilter);

        Promise.all([
            api.get<Delivery[]>(`/deliveries?${params}`),
            api.get<DeliveryZone[]>(`/delivery-zones?agency_id=${agencyId}`),
            canManage
                ? api.get<Paginated<Order>>(`/orders?agency_id=${agencyId}&status=pret&per_page=50`)
                : Promise.resolve<Paginated<Order>>({ data: [], current_page: 1, last_page: 1, total: 0 }),
            canManage ? api.get<User[]>(`/users?role=livreur&agency_id=${agencyId}`) : Promise.resolve<User[]>([]),
        ])
            .then(([deliveriesRes, zonesRes, ordersRes, livreursRes]) => {
                setDeliveries(deliveriesRes);
                setZones(zonesRes);
                setReadyOrders(ordersRes.data);
                setLivreurs(livreursRes);
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [agencyId, mineOnly, statusFilter]);

    if (!agencyId) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('delivery.title')} subtitle={t('delivery.subtitle')} icon={Truck} />
                <div className={cardPadded}>
                    <EmptyState icon={Building2} title={t('delivery.selectAgency')} description={t('delivery.selectAgencyHint')} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader title={t('delivery.title')} subtitle={t('delivery.subtitle')} icon={Truck} />

            {loading ? (
                <LoadingState />
            ) : (
                <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                    <DeliveriesListPanel
                        deliveries={deliveries}
                        canManage={canManage}
                        canFulfill={canFulfill}
                        currentUserId={user?.id ?? null}
                        mineOnly={mineOnly}
                        onToggleMine={canFulfill ? () => setMineOnly((v) => !v) : undefined}
                        statusFilter={statusFilter}
                        onStatusFilter={setStatusFilter}
                        livreurs={livreurs}
                        onChanged={reload}
                    />

                    {canManage && (
                        <div className="space-y-6">
                            <NewDeliveryPanel orders={readyOrders} zones={zones} livreurs={livreurs} onCreated={reload} />
                            <ZonesPanel agencyId={agencyId} zones={zones} onCreated={reload} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function DeliveriesListPanel({
    deliveries,
    canManage,
    canFulfill,
    currentUserId,
    mineOnly,
    onToggleMine,
    statusFilter,
    onStatusFilter,
    livreurs,
    onChanged,
}: {
    deliveries: Delivery[];
    canManage: boolean;
    canFulfill: boolean;
    currentUserId: number | null;
    mineOnly: boolean;
    onToggleMine?: () => void;
    statusFilter: DeliveryStatus | '';
    onStatusFilter: (status: DeliveryStatus | '') => void;
    livreurs: User[];
    onChanged: () => void;
}) {
    const { t } = useI18n();

    const filterClass = (active: boolean) =>
        cx(
            'inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold transition duration-150 active:scale-95',
            active
                ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-950'
                : 'bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700',
        );

    return (
        <section aria-labelledby="deliveries-list-heading" className={cx(card, 'overflow-hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-5">
                <h2 id="deliveries-list-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                    <Truck aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                    {t('delivery.list')}
                </h2>
                {onToggleMine && (
                    <button type="button" onClick={onToggleMine} aria-pressed={mineOnly} className={filterClass(mineOnly)}>
                        {mineOnly ? t('delivery.mine') : t('delivery.all')}
                    </button>
                )}
            </div>

            <div role="group" aria-label={t('delivery.list')} className="scrollbar-none flex gap-2 overflow-x-auto px-5 pb-3">
                <button type="button" aria-pressed={statusFilter === ''} onClick={() => onStatusFilter('')} className={filterClass(statusFilter === '')}>
                    {t('delivery.all')}
                </button>
                {STATUS_FILTERS.map((s) => (
                    <button key={s} type="button" aria-pressed={statusFilter === s} onClick={() => onStatusFilter(s)} className={filterClass(statusFilter === s)}>
                        {t(`delivery.status.${s}`)}
                    </button>
                ))}
            </div>

            {deliveries.length === 0 ? (
                <EmptyState compact icon={Truck} title={t('delivery.noDeliveries')} />
            ) : (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                    {deliveries.map((delivery) => (
                        <DeliveryRow
                            key={delivery.id}
                            delivery={delivery}
                            canManage={canManage}
                            canFulfill={canFulfill}
                            currentUserId={currentUserId}
                            livreurs={livreurs}
                            onChanged={onChanged}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

function DeliveryRow({
    delivery,
    canManage,
    canFulfill,
    currentUserId,
    livreurs,
    onChanged,
}: {
    delivery: Delivery;
    canManage: boolean;
    canFulfill: boolean;
    currentUserId: number | null;
    livreurs: User[];
    onChanged: () => void;
}) {
    const { t } = useI18n();
    const { money } = useFormat();
    const [expanded, setExpanded] = useState<'assign' | 'complete' | 'fail' | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const isAssignedToMe = delivery.livreur_id === currentUserId;
    const canAct = canManage || isAssignedToMe;
    const canAssign = canManage && delivery.status === 'a_planifier';
    const canStart = canFulfill && canAct && delivery.status === 'a_planifier' && delivery.livreur_id !== null;
    const canComplete = canFulfill && canAct && delivery.status === 'en_cours';
    const canFail = canFulfill && canAct && delivery.status === 'en_cours';
    const canReschedule = canFulfill && canAct && delivery.status === 'echouee';

    async function start() {
        setBusy(true);
        setError(null);
        try {
            await api.post(`/deliveries/${delivery.id}/status`, { status: 'en_cours' });
            onChanged();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    async function reschedule() {
        setBusy(true);
        setError(null);
        try {
            await api.post(`/deliveries/${delivery.id}/status`, { status: 'a_planifier' });
            onChanged();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    async function viewProof(kind: 'photo' | 'signature') {
        setError(null);
        try {
            const blob = await api.blob(`/deliveries/${delivery.id}/${kind}`);
            window.open(URL.createObjectURL(blob), '_blank');
        } catch {
            setError(t('common.error'));
        }
    }

    return (
        <li className="space-y-3 px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate font-semibold text-ink-900 dark:text-ink-50">
                        {delivery.order?.client ? `${delivery.order.client.first_name} ${delivery.order.client.last_name}` : `#${delivery.order_id}`}
                    </p>
                    <p className="truncate text-sm text-ink-600 dark:text-ink-350">{delivery.address}</p>
                    {delivery.livreur && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-600 dark:text-ink-350">
                            <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
                            {delivery.livreur.name}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <StatusBadge kind="delivery" status={delivery.status} />
                    <span className="font-display text-sm font-bold text-ink-900 dark:text-white">{money(delivery.fee)}</span>
                </div>
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            {!canAct && canFulfill && delivery.status !== 'livree' && (
                <p className="text-xs text-ink-500 dark:text-ink-400">{t('delivery.notAssignedToYou')}</p>
            )}

            <div className="flex flex-wrap gap-2">
                {canAssign && expanded !== 'assign' && (
                    <button type="button" onClick={() => setExpanded('assign')} className={button('secondary', 'sm')}>
                        <UserRound aria-hidden="true" className="h-4 w-4" />
                        {t('delivery.assign')}
                    </button>
                )}
                {canStart && (
                    <button type="button" disabled={busy} onClick={() => void start()} className={button('secondary', 'sm')}>
                        {t('delivery.start')}
                    </button>
                )}
                {canComplete && expanded !== 'complete' && (
                    <button type="button" onClick={() => setExpanded('complete')} className={button('success', 'sm')}>
                        <CircleCheck aria-hidden="true" className="h-4 w-4" />
                        {t('delivery.complete')}
                    </button>
                )}
                {canFail && expanded !== 'fail' && (
                    <button type="button" onClick={() => setExpanded('fail')} className={button('dangerGhost', 'sm')}>
                        <TriangleAlert aria-hidden="true" className="h-4 w-4" />
                        {t('delivery.fail')}
                    </button>
                )}
                {canReschedule && (
                    <button type="button" disabled={busy} onClick={() => void reschedule()} className={button('secondary', 'sm')}>
                        <RotateCcw aria-hidden="true" className="h-4 w-4" />
                        {t('delivery.reschedule')}
                    </button>
                )}
                {delivery.status === 'livree' && delivery.proof_photo_path && (
                    <button type="button" onClick={() => void viewProof('photo')} className={button('ghost', 'sm')}>
                        <ImageIcon aria-hidden="true" className="h-4 w-4" />
                        {t('delivery.photo')}
                    </button>
                )}
                {delivery.status === 'livree' && delivery.signature_path && (
                    <button type="button" onClick={() => void viewProof('signature')} className={button('ghost', 'sm')}>
                        <ImageIcon aria-hidden="true" className="h-4 w-4" />
                        {t('delivery.signature')}
                    </button>
                )}
            </div>

            {expanded === 'assign' && (
                <AssignForm
                    deliveryId={delivery.id}
                    livreurs={livreurs}
                    onDone={() => {
                        setExpanded(null);
                        onChanged();
                    }}
                    onCancel={() => setExpanded(null)}
                />
            )}
            {expanded === 'complete' && (
                <CompleteForm
                    deliveryId={delivery.id}
                    onDone={() => {
                        setExpanded(null);
                        onChanged();
                    }}
                    onCancel={() => setExpanded(null)}
                />
            )}
            {expanded === 'fail' && (
                <FailForm
                    deliveryId={delivery.id}
                    onDone={() => {
                        setExpanded(null);
                        onChanged();
                    }}
                    onCancel={() => setExpanded(null)}
                />
            )}
        </li>
    );
}

function AssignForm({
    deliveryId,
    livreurs,
    onDone,
    onCancel,
}: {
    deliveryId: number;
    livreurs: User[];
    onDone: () => void;
    onCancel: () => void;
}) {
    const { t } = useI18n();
    const [livreurId, setLivreurId] = useState<number | ''>('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        if (!livreurId) return;
        setBusy(true);
        setError(null);
        try {
            await api.post(`/deliveries/${deliveryId}/assign`, { livreur_id: livreurId });
            onDone();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/50">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
                <select value={livreurId} onChange={(e) => setLivreurId(e.target.value ? Number(e.target.value) : '')} className={cx(inputSm, 'flex-1')}>
                    <option value="">{t('delivery.assignTo')}</option>
                    {livreurs.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.name}
                        </option>
                    ))}
                </select>
                <button type="button" disabled={!livreurId || busy} onClick={() => void submit()} className={button('primary', 'sm')}>
                    {t('delivery.assign')}
                </button>
                <button type="button" onClick={onCancel} className={button('ghost', 'sm')}>
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    );
}

function CompleteForm({ deliveryId, onDone, onCancel }: { deliveryId: number; onDone: () => void; onCancel: () => void }) {
    const { t } = useI18n();
    const [photo, setPhoto] = useState<File | null>(null);
    const [signature, setSignature] = useState<Blob | null>(null);
    const [latitude, setLatitude] = useState<number | ''>('');
    const [longitude, setLongitude] = useState<number | ''>('');
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    function captureGps() {
        setGpsError(null);
        if (!navigator.geolocation) {
            setGpsError(t('delivery.gpsDenied'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLatitude(Number(pos.coords.latitude.toFixed(6)));
                setLongitude(Number(pos.coords.longitude.toFixed(6)));
            },
            () => setGpsError(t('delivery.gpsDenied')),
            { enableHighAccuracy: true, timeout: 10000 },
        );
    }

    async function submit() {
        if (!photo || !signature || latitude === '' || longitude === '') return;
        setBusy(true);
        setError(null);
        try {
            const formData = new FormData();
            formData.append('photo', photo);
            formData.append('signature', signature, 'signature.png');
            formData.append('latitude', String(latitude));
            formData.append('longitude', String(longitude));
            if (notes) formData.append('notes', notes);
            await api.postForm(`/deliveries/${deliveryId}/complete`, formData);
            onDone();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-3 rounded-xl bg-ink-50 p-4 dark:bg-ink-950/50">
            {error && <Alert tone="error">{error}</Alert>}

            <label className="block">
                <span className={label}>{t('delivery.photo')}</span>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className={cx(inputSm, 'h-auto py-2')} />
            </label>

            <div>
                <span className={label}>{t('delivery.signature')}</span>
                <SignaturePad onChange={setSignature} />
            </div>

            <div className="space-y-1.5">
                <span className={label}>{t('delivery.gps')}</span>
                {gpsError && <Alert tone="warning">{gpsError}</Alert>}
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={captureGps} className={button('secondary', 'sm')}>
                        <MapPin aria-hidden="true" className="h-4 w-4" />
                        {t('delivery.gpsCapture')}
                    </button>
                    {latitude !== '' && longitude !== '' && (
                        <Pill tone="emerald" icon={CircleCheck}>
                            {t('delivery.gpsCaptured')}
                        </Pill>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="number"
                        step="0.000001"
                        placeholder={t('delivery.latitude')}
                        value={latitude}
                        onChange={(e) => setLatitude(e.target.value ? Number(e.target.value) : '')}
                        className={inputSm}
                    />
                    <input
                        type="number"
                        step="0.000001"
                        placeholder={t('delivery.longitude')}
                        value={longitude}
                        onChange={(e) => setLongitude(e.target.value ? Number(e.target.value) : '')}
                        className={inputSm}
                    />
                </div>
            </div>

            <label className="block">
                <span className={label}>{t('common.notes')}</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
            </label>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!photo || !signature || latitude === '' || longitude === '' || busy}
                    onClick={() => void submit()}
                    className={button('success', 'sm')}
                >
                    <CircleCheck aria-hidden="true" className="h-4 w-4" />
                    {t('delivery.complete')}
                </button>
                <button type="button" onClick={onCancel} className={button('ghost', 'sm')}>
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    );
}

function FailForm({ deliveryId, onDone, onCancel }: { deliveryId: number; onDone: () => void; onCancel: () => void }) {
    const { t } = useI18n();
    const [reason, setReason] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        if (!reason) return;
        setBusy(true);
        setError(null);
        try {
            await api.post(`/deliveries/${deliveryId}/fail`, { reason });
            onDone();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-2 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/50">
            {error && <Alert tone="error">{error}</Alert>}
            <label className="block">
                <span className={label}>{t('delivery.failReason')}</span>
                <input value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
            </label>
            <div className="flex flex-wrap gap-2">
                <button type="button" disabled={!reason || busy} onClick={() => void submit()} className={button('danger', 'sm')}>
                    {t('delivery.fail')}
                </button>
                <button type="button" onClick={onCancel} className={button('ghost', 'sm')}>
                    {t('common.cancel')}
                </button>
            </div>
        </div>
    );
}

function NewDeliveryPanel({
    orders,
    zones,
    livreurs,
    onCreated,
}: {
    orders: Order[];
    zones: DeliveryZone[];
    livreurs: User[];
    onCreated: () => void;
}) {
    const { t } = useI18n();
    const [orderId, setOrderId] = useState<number | ''>('');
    const [address, setAddress] = useState('');
    const [zoneId, setZoneId] = useState<number | ''>('');
    const [livreurId, setLivreurId] = useState<number | ''>('');
    const [fee, setFee] = useState<number | ''>('');
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        if (!orderId || !address) return;
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            await api.post('/deliveries', {
                order_id: orderId,
                address,
                delivery_zone_id: zoneId || null,
                livreur_id: livreurId || null,
                fee: !zoneId && fee !== '' ? fee : undefined,
            });
            setFeedback(t('delivery.created'));
            setOrderId('');
            setAddress('');
            setZoneId('');
            setLivreurId('');
            setFee('');
            onCreated();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section aria-labelledby="new-delivery-heading" className={cx(cardPadded, 'space-y-4')}>
            <h2 id="new-delivery-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                <Truck aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('delivery.new')}
            </h2>

            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <label className="block">
                <span className={label}>{t('delivery.order')}</span>
                <select value={orderId} onChange={(e) => setOrderId(e.target.value ? Number(e.target.value) : '')} className={select}>
                    <option value="">{t('delivery.pickOrder')}</option>
                    {orders.map((order) => (
                        <option key={order.id} value={order.id}>
                            #{order.order_number} — {order.client ? `${order.client.first_name} ${order.client.last_name}` : ''}
                        </option>
                    ))}
                </select>
            </label>

            <label className="block">
                <span className={label}>{t('delivery.address')}</span>
                <input value={address} onChange={(e) => setAddress(e.target.value)} className={input} />
            </label>

            <label className="block">
                <span className={label}>{t('delivery.zoneOptional')}</span>
                <select value={zoneId} onChange={(e) => setZoneId(e.target.value ? Number(e.target.value) : '')} className={select}>
                    <option value="">{t('delivery.zoneNone')}</option>
                    {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>
                            {zone.name} ({zone.fee})
                        </option>
                    ))}
                </select>
            </label>

            {!zoneId && (
                <label className="block">
                    <span className={label}>{t('delivery.fee')}</span>
                    <input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value ? Number(e.target.value) : '')} className={input} />
                </label>
            )}

            <label className="block">
                <span className={label}>{t('delivery.livreurOptional')}</span>
                <select value={livreurId} onChange={(e) => setLivreurId(e.target.value ? Number(e.target.value) : '')} className={select}>
                    <option value="">—</option>
                    {livreurs.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.name}
                        </option>
                    ))}
                </select>
            </label>

            <button type="button" onClick={() => void submit()} disabled={!orderId || !address || busy} className={button('primary', 'md', 'w-full')}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t('delivery.create')}
            </button>
        </section>
    );
}

function ZonesPanel({ agencyId, zones, onCreated }: { agencyId: number; zones: DeliveryZone[]; onCreated: () => void }) {
    const { t } = useI18n();
    const { money } = useFormat();
    const [name, setName] = useState('');
    const [fee, setFee] = useState(500);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function createZone() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/delivery-zones', { agency_id: agencyId, name, fee });
            setName('');
            setFee(500);
            onCreated();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section aria-labelledby="zones-heading" className={cx(cardPadded, 'space-y-4')}>
            <h2 id="zones-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                <MapPin aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('delivery.zones')}
            </h2>

            {zones.length === 0 ? (
                <EmptyState compact icon={MapPin} title={t('delivery.noZones')} />
            ) : (
                <ul className="space-y-1.5 text-sm">
                    {zones.map((zone) => (
                        <li key={zone.id} className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-950/50">
                            <span className="font-medium text-ink-900 dark:text-ink-50">{zone.name}</span>
                            <span className="text-ink-600 dark:text-ink-350">{money(zone.fee)}</span>
                        </li>
                    ))}
                </ul>
            )}

            <div className="space-y-2 border-t border-ink-200/80 pt-4 dark:border-ink-800">
                {error && <Alert tone="error">{error}</Alert>}
                <div className="flex flex-wrap gap-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('delivery.zoneName')} className={cx(inputSm, 'flex-1')} />
                    <input type="number" min={0} value={fee} onChange={(e) => setFee(Number(e.target.value))} className={cx(inputSm, 'w-28')} />
                    <button type="button" onClick={() => void createZone()} disabled={!name || busy} className={button('secondary', 'sm')}>
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        {t('common.create')}
                    </button>
                </div>
            </div>
        </section>
    );
}

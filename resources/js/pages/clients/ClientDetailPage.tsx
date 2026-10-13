import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Archive, Award, Banknote, CircleDollarSign, Clock, FileQuestion, Mail, MapPin, MessageCircle, Pencil, Phone, Plus, Shirt, ShoppingBag, Sparkles, StickyNote, Trash2 } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { useFormat } from '../../lib/format';
import { Avatar } from '../../components/ui/PageHeader';
import StatusBadge, { Pill } from '../../components/ui/StatusBadge';
import { Alert, EmptyState, LoadingState } from '../../components/ui/Feedback';
import { StatCard, trend } from '../../components/ui/Metrics';
import { Timeline, type TimelineEntry } from '../../components/ui/Timeline';
import { button, card, cardPadded, cx, input, sectionTitle, textLink } from '../../components/ui/styles';
import type { ClientDetail, ClientNote, Order, Paginated } from '../../types';

export default function ClientDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { t } = useI18n();
    const { money, date, dateTime } = useFormat();

    const [client, setClient] = useState<ClientDetail | null>(null);
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [notes, setNotes] = useState<ClientNote[]>([]);
    const [noteDraft, setNoteDraft] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const noteRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (!id) return;
        setLoading(true);
        api
            .get<ClientDetail>(`/clients/${id}`)
            .then(setClient)
            .catch((err) => {
                if (err instanceof ApiError && err.status === 404) setNotFound(true);
            })
            .finally(() => setLoading(false));
        api
            .get<Paginated<Order>>(`/orders?client_id=${id}&per_page=10`)
            .then((res) => setOrders(res.data))
            .catch(() => setOrders([]));
        api.get<ClientNote[]>(`/clients/${id}/notes`).then(setNotes).catch(() => setNotes([]));
    }, [id]);

    async function addNote() {
        if (!client || !noteDraft.trim()) return;
        setSavingNote(true);
        try {
            const note = await api.post<ClientNote>(`/clients/${client.id}/notes`, { body: noteDraft.trim() });
            setNotes((current) => [note, ...current]);
            setNoteDraft('');
        } catch (err) {
            setActionError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setSavingNote(false);
        }
    }

    const timeline = useMemo<TimelineEntry[]>(() => {
        if (!client) return [];
        const depositEntries: TimelineEntry[] = orders.map((order) => ({
            id: `order-${order.id}`,
            label: t('client.timeline.deposit', { number: String(order.order_number) }),
            at: order.created_at,
        }));
        const pickupEntries: TimelineEntry[] = client.recent_pickups.map((pickup) => ({
            id: `pickup-${pickup.id}`,
            label: t('client.timeline.pickup', { name: pickup.recipient_name }),
            detail: pickup.order ? `${t('order.number')}${pickup.order.order_number}` : undefined,
            at: pickup.processed_at,
            actor: pickup.processor?.name ?? null,
        }));
        return [...depositEntries, ...pickupEntries].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    }, [client, orders, t]);

    async function toggleActive() {
        if (!client) return;
        setActionError(null);
        const updated = await api.patch<ClientDetail>(`/clients/${client.id}`, { is_active: !client.is_active });
        setClient({ ...client, ...updated });
    }

    async function deleteClient() {
        if (!client) return;
        setActionError(null);
        try {
            await api.delete(`/clients/${client.id}`);
            navigate('/clients');
        } catch (err) {
            setActionError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    const backLink = (
        <Link to="/clients" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            {t('client.backToList')}
        </Link>
    );

    if (loading) return <LoadingState />;

    if (notFound || !client) {
        return (
            <div className="space-y-4">
                {backLink}
                <div role="alert" className={card}>
                    <EmptyState icon={FileQuestion} title={t('client.notFound')} />
                </div>
            </div>
        );
    }

    const contactHref =
        client.contact_preference === 'email' && client.email
            ? `mailto:${client.email}`
            : client.contact_preference === 'whatsapp'
              ? `https://wa.me/${client.phone.replace(/\D/g, '')}`
              : client.contact_preference === 'sms'
                ? `sms:${client.phone}`
                : `tel:${client.phone}`;
    const loyalty = client.loyalty;

    return (
        <div className="space-y-6">
            {backLink}

            <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-center gap-4">
                    <Avatar firstName={client.first_name} lastName={client.last_name} size="lg" />
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">
                                {client.first_name} {client.last_name}
                            </h1>
                            {client.is_active ? <Pill tone="emerald">{t('client.activeStatus')}</Pill> : <Pill tone="rose">{t('client.inactive')}</Pill>}
                            {loyalty.current_tier && <Pill tone="accent">{t('client.detail.tierLevel', { name: loyalty.current_tier.name })}</Pill>}
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-700 dark:text-ink-200">
                            <span className="inline-flex items-center gap-1.5">
                                <Phone aria-hidden="true" className="h-4 w-4" />
                                {client.phone}
                            </span>
                            {client.email && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Mail aria-hidden="true" className="h-4 w-4" />
                                    {client.email}
                                </span>
                            )}
                            {client.agency && (
                                <span className="inline-flex items-center gap-1.5 font-semibold">
                                    <MapPin aria-hidden="true" className="h-4 w-4" />
                                    {client.agency.name}
                                </span>
                            )}
                            <span className="text-ink-500 dark:text-ink-400">{client.client_code}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2">
                    <a href={contactHref} target={contactHref.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className={button('secondary', 'md')}>
                        <Phone aria-hidden="true" className="h-4 w-4" />
                        {t('client.detail.contact')}
                    </a>
                    <button type="button" onClick={() => noteRef.current?.focus()} className={button('secondary', 'md')}>
                        <StickyNote aria-hidden="true" className="h-4 w-4" />
                        {t('client.detail.addNote')}
                    </button>
                    <Link to={`/?client=${client.id}`} className={button('primary', 'md')}>
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        {t('dashboard.newDeposit')}
                    </Link>
                </div>
            </header>

            {actionError && <Alert tone="error">{actionError}</Alert>}

            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-4">
                <StatCard
                    label={t('client.stats.lifetimeValue')}
                    value={money(client.lifetime_value)}
                    icon={Banknote}
                    tone="brand"
                    hint={t('client.detail.since', { date: date(client.created_at) })}
                />
                <StatCard
                    label={t('client.stats.depositsCount')}
                    value={client.deposits_count}
                    icon={ShoppingBag}
                    tone="sky"
                    hint={t('client.detail.perMonth', { count: client.orders_per_month ?? 0 })}
                />
                <StatCard
                    label={t('client.stats.averageBasket')}
                    value={money(client.average_basket)}
                    icon={CircleDollarSign}
                    tone="emerald"
                    {...(client.basket_trend !== null ? trend(client.basket_trend, t('client.detail.basketTrend')) : { hint: t('client.detail.basketTrendNone') })}
                />
                <StatCard label={t('order.balanceDue.title')} value={money(client.balance_due)} icon={Banknote} tone="amber" />
            </div>

            <section className="grid grid-cols-1 overflow-hidden rounded-2xl bg-brand-950 text-white lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                <div className="space-y-4 p-6">
                    <div className="flex items-center justify-between gap-3">
                        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent-300">
                            <Award aria-hidden="true" className="h-4 w-4" />
                            {t('client.detail.loyaltyTitle')}
                        </p>
                        {loyalty.current_tier && <span className="rounded-full bg-accent-400 px-2.5 py-0.5 text-xs font-bold text-ink-950">{loyalty.current_tier.name}</span>}
                    </div>
                    <div>
                        <p className="font-display text-4xl font-bold tabular-nums">{loyalty.points.toLocaleString()}</p>
                        <p className="text-sm text-brand-100/80">
                            {loyalty.points_value !== null
                                ? t('client.detail.pointsWithValue', { value: money(loyalty.points_value) })
                                : t('client.detail.pointsAvailable')}
                        </p>
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-semibold">
                            <span>{loyalty.current_tier?.name ?? '—'}</span>
                            <span className="text-accent-300">
                                {loyalty.next_tier ? t('client.detail.nextTier', { name: loyalty.next_tier.name, amount: money(loyalty.next_tier.remaining) }) : t('client.detail.topTier')}
                            </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white/15">
                            <div className="h-full rounded-full bg-accent-400" style={{ width: `${loyalty.progress}%` }} />
                        </div>
                        <p className="text-xs text-brand-100/80">{t('client.detail.progress', { percent: loyalty.progress, spend: money(loyalty.spend_12m) })}</p>
                    </div>
                </div>
                <div className="space-y-3 bg-brand-900 p-6">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="font-display font-bold">{t('client.detail.pointsHistory')}</h2>
                            <p className="text-xs text-brand-100/80">{t('client.detail.pointsHistorySubtitle')}</p>
                        </div>
                        <Link to="/loyalty" className="text-xs font-semibold text-accent-300 hover:underline">
                            {t('client.detail.viewAll')}
                        </Link>
                    </div>
                    {loyalty.movements.length === 0 ? (
                        <p className="rounded-xl bg-white/5 p-4 text-sm text-brand-100/80">{t('loyalty.movements.empty')}</p>
                    ) : (
                        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {loyalty.movements.map((m) => (
                                <li key={m.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-ink-900">
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-semibold">{t(`loyalty.movements.reason.${m.reason}`)}</span>
                                        <span className="block text-xs text-ink-500">{dateTime(m.created_at)}</span>
                                    </span>
                                    <span className={cx('shrink-0 font-display font-bold tabular-nums', m.points >= 0 ? 'text-emerald-700' : 'text-red-700')}>
                                        {m.points >= 0 ? '+' : ''}
                                        {m.points}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {loyalty.point_value_fcfa !== null && (
                        <p className="text-xs text-brand-100/80">{t('client.detail.pointValueRule', { value: money(loyalty.point_value_fcfa) })}</p>
                    )}
                </div>
            </section>

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-6">
                    <section className={cx(cardPadded, 'space-y-3')}>
                        <h2 className={cx(sectionTitle, 'text-sm')}>{t('client.timeline.title')}</h2>
                        <Timeline entries={timeline} emptyLabel={t('order.noOrders')} />
                    </section>

                    <section className={cx(card, 'overflow-hidden')}>
                        <div className="flex items-center justify-between gap-3 px-5 py-4">
                            <h2 className={cx(sectionTitle, 'text-sm')}>{t('client.recentOrders.title')}</h2>
                            <Link to={`/orders?client_id=${client.id}`} className={cx(textLink, 'text-sm')}>
                                {t('client.detail.allOrders', { count: client.deposits_count })}
                            </Link>
                        </div>
                        {orders.length === 0 ? (
                            <EmptyState icon={ShoppingBag} title={t('order.noOrders')} compact />
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[620px] text-sm">
                                    <thead className="bg-ink-50 text-left text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:bg-ink-950/40 dark:text-ink-400">
                                        <tr>
                                            <th className="px-5 py-2.5">{t('client.detail.order')}</th>
                                            <th className="px-3 py-2.5">{t('common.date')}</th>
                                            <th className="px-3 py-2.5">{t('client.detail.articles')}</th>
                                            <th className="px-3 py-2.5 text-right">{t('client.detail.amount')}</th>
                                            <th className="px-5 py-2.5">{t('client.table.status')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                        {orders.map((order) => (
                                            <tr key={order.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/50">
                                                <td className="whitespace-nowrap px-5 py-3 font-semibold text-ink-900 dark:text-ink-50">
                                                    <Link to={`/orders/${order.id}`} className="hover:underline">
                                                        {t('order.number')}
                                                        {order.order_number}
                                                    </Link>
                                                </td>
                                                <td className="whitespace-nowrap px-3 py-3 text-ink-700 dark:text-ink-200">{date(order.created_at)}</td>
                                                <td className="whitespace-nowrap px-3 py-3 text-ink-700 dark:text-ink-200">
                                                    {[order.pieces_count ? t('client.detail.pieces', { count: order.pieces_count }) : null, order.weight_kg_total ? `${order.weight_kg_total} kg` : null]
                                                        .filter(Boolean)
                                                        .join(' · ') || '—'}
                                                </td>
                                                <td className="px-3 py-3 text-right font-bold tabular-nums text-ink-900 dark:text-white">{money(order.total_amount)}</td>
                                                <td className="px-5 py-3">
                                                    <StatusBadge kind="order" status={order.status} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </div>

                <div className="min-w-0 space-y-6">
                    <section className={cx(cardPadded, 'space-y-3')}>
                        <div className="flex items-center justify-between">
                            <h2 className={cx(sectionTitle, 'text-sm')}>{t('client.detail.preferences')}</h2>
                            <Link to={`/clients/${client.id}/edit`} aria-label={t('common.edit')} className="text-ink-500 hover:text-ink-900 dark:hover:text-white">
                                <Pencil aria-hidden="true" className="h-4 w-4" />
                            </Link>
                        </div>
                        <dl className="space-y-3 text-sm">
                            <Preference icon={MessageCircle} label={t('client.contactPreference')} value={client.contact_preference ? t(`client.contactPreference.${client.contact_preference}`) : null} empty={t('client.detail.notSet')} />
                            <Preference
                                icon={Clock}
                                label={t('client.detail.pickupSlot')}
                                value={client.preferences.pickup_slot ? t(`client.detail.slot.${client.preferences.pickup_slot}`) : null}
                                empty={t('client.detail.notEnoughHistory')}
                            />
                            <Preference icon={Sparkles} label={t('client.detail.favoriteTreatment')} value={client.preferences.favorite_treatment} empty={t('client.detail.notEnoughHistory')} />
                            <Preference icon={Shirt} label={t('client.careInstructions')} value={client.care_instructions ?? null} empty={t('client.detail.notSet')} />
                        </dl>
                    </section>

                    <section className={cx(cardPadded, 'space-y-3')}>
                        <div className="flex items-center justify-between">
                            <h2 className={cx(sectionTitle, 'text-sm')}>{t('client.section.notes')}</h2>
                            <Pill tone="neutral">{t('client.detail.notesCount', { count: notes.length })}</Pill>
                        </div>
                        {client.notes && <p className="whitespace-pre-line rounded-xl bg-accent-50 p-3 text-sm text-ink-800 dark:bg-accent-400/10 dark:text-ink-100">{client.notes}</p>}
                        {notes.map((note) => (
                            <div key={note.id} className="rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
                                <p className="whitespace-pre-line text-sm text-ink-800 dark:text-ink-100">{note.body}</p>
                                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                                    {note.author?.name ?? t('order.audit.systemActor')} · {dateTime(note.created_at)}
                                </p>
                            </div>
                        ))}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                void addNote();
                            }}
                            className="space-y-2"
                        >
                            <label htmlFor="client-note" className="sr-only">
                                {t('client.detail.addNote')}
                            </label>
                            <textarea
                                id="client-note"
                                ref={noteRef}
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                rows={2}
                                placeholder={t('client.notesPlaceholder')}
                                className={cx(input, 'h-auto py-2.5')}
                            />
                            <button type="submit" disabled={!noteDraft.trim() || savingNote} className={button('secondary', 'sm')}>
                                {t('client.detail.addNote')}
                            </button>
                        </form>
                    </section>

                    <section className={cx(cardPadded, 'space-y-3')}>
                        <h2 className={cx(sectionTitle, 'text-sm')}>{t('client.detail.account')}</h2>
                        <dl className="space-y-2.5 text-sm">
                            <div className="flex justify-between gap-3">
                                <dt className="text-ink-600 dark:text-ink-350">{t('client.detail.clientSince')}</dt>
                                <dd className="font-semibold text-ink-900 dark:text-white">{date(client.created_at)}</dd>
                            </div>
                            <div className="flex justify-between gap-3">
                                <dt className="text-ink-600 dark:text-ink-350">{t('client.referenceAgency')}</dt>
                                <dd className="font-semibold text-ink-900 dark:text-white">{client.agency?.name ?? '—'}</dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <dt className="text-ink-600 dark:text-ink-350">{t('client.detail.marketingConsent')}</dt>
                                <dd>
                                    {client.sms_consent || client.email_consent ? (
                                        <Pill tone="emerald">{t('client.detail.consentGiven')}</Pill>
                                    ) : (
                                        <Pill tone="neutral">{t('client.detail.consentNone')}</Pill>
                                    )}
                                </dd>
                            </div>
                        </dl>
                        <div className="flex flex-wrap gap-2 border-t border-ink-200/80 pt-3 dark:border-ink-800">
                            <Link to={`/clients/${client.id}/edit`} className={button('secondary', 'sm')}>
                                <Pencil aria-hidden="true" className="h-4 w-4" />
                                {t('common.edit')}
                            </Link>
                            <button type="button" onClick={() => void toggleActive()} className={button('secondary', 'sm')}>
                                <Archive aria-hidden="true" className="h-4 w-4" />
                                {client.is_active ? t('client.detail.archive') : t('client.activate')}
                            </button>
                            {client.deposits_count === 0 && (
                                <button type="button" onClick={() => void deleteClient()} className={button('dangerGhost', 'sm')}>
                                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                                    {t('common.delete')}
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{t('client.detail.archiveHint')}</p>
                    </section>
                </div>
            </div>
        </div>
    );
}

function Preference({ icon: Icon, label, value, empty }: { icon: typeof Clock; label: string; value: string | null; empty: string }) {
    return (
        <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                <Icon aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
                <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</dt>
                <dd className={cx('font-semibold', value ? 'text-ink-900 dark:text-white' : 'text-ink-500 dark:text-ink-400')}>{value ?? empty}</dd>
            </div>
        </div>
    );
}

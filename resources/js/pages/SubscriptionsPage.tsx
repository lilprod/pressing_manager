import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import type { Client, CustomerSubscription, PaymentMethod, SubscriptionPlan } from '../types';
import { CalendarClock, CalendarDays, Crown, Gauge, Layers, Plus, RefreshCw, Search, Sparkles, UserSearch, X } from 'lucide-react';
import { useFormat } from '../lib/format';
import PaymentMethodPicker from '../components/PaymentMethodPicker';
import PageHeader, { Avatar } from '../components/ui/PageHeader';
import StatusBadge from '../components/ui/StatusBadge';
import { Alert, EmptyState } from '../components/ui/Feedback';
import { button, card, cardPadded, cx, input, inputLg, label, select, sectionTitle } from '../components/ui/styles';

export default function SubscriptionsPage() {
    const { t } = useI18n();
    const { money, date } = useFormat();
    const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
    const [clientQuery, setClientQuery] = useState('');
    const [clientResults, setClientResults] = useState<Client[]>([]);
    const [selectedClient, setSelectedClient] = useState<Client | null>(null);
    const [subscriptions, setSubscriptions] = useState<CustomerSubscription[]>([]);
    const [selectedPlanId, setSelectedPlanId] = useState<number | ''>('');
    const [method, setMethod] = useState<PaymentMethod>('espece');
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    useEffect(() => {
        api.get<SubscriptionPlan[]>('/subscription-plans').then(setPlans);
    }, []);

    useEffect(() => {
        if (clientQuery.trim().length < 2) return;
        const timeout = setTimeout(() => {
            api.get<{ data: Client[] }>(`/clients?search=${encodeURIComponent(clientQuery)}`).then((res) => setClientResults(res.data));
        }, 300);
        return () => clearTimeout(timeout);
    }, [clientQuery]);

    function loadSubscriptions(clientId: number) {
        api.get<CustomerSubscription[]>(`/customer-subscriptions?client_id=${clientId}`).then(setSubscriptions);
    }

    async function subscribe() {
        if (!selectedClient || !selectedPlanId) return;
        setError(null);
        setFeedback(null);
        try {
            await api.post('/customer-subscriptions', {
                client_id: selectedClient.id,
                subscription_plan_id: selectedPlanId,
                method,
            });
            setFeedback(t('subscription.subscribed'));
            loadSubscriptions(selectedClient.id);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    async function renew(subscription: CustomerSubscription) {
        setError(null);
        setFeedback(null);
        try {
            await api.post(`/customer-subscriptions/${subscription.id}/renew`, { method });
            setFeedback(t('subscription.renewed'));
            if (selectedClient) loadSubscriptions(selectedClient.id);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader title={t('subscription.title')} subtitle={t('subscription.subtitle')} icon={Crown} />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
                <section aria-labelledby="sub-clients-heading" className={cx(cardPadded, 'space-y-5')}>
                    <h2 id="sub-clients-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                        <UserSearch aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                        {t('subscription.clientSection')}
                    </h2>

                    {error && <Alert tone="error">{error}</Alert>}
                    {feedback && <Alert tone="success">{feedback}</Alert>}

                    <label htmlFor="sub-client-search" className="sr-only">
                        {t('client.search')}
                    </label>
                    <div className="relative">
                        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                        <input
                            id="sub-client-search"
                            type="search"
                            value={clientQuery}
                            onChange={(e) => setClientQuery(e.target.value)}
                            placeholder={t('client.search')}
                            className={cx(inputLg, 'pl-12')}
                        />
                    </div>

                    {!selectedClient && clientResults.length > 0 && (
                        <ul className="animate-fade-in divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200 dark:divide-ink-800 dark:border-ink-700">
                            {clientResults.map((client) => (
                                <li key={client.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedClient(client);
                                            loadSubscriptions(client.id);
                                        }}
                                        className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-brand-50 dark:hover:bg-brand-400/10"
                                    >
                                        <Avatar firstName={client.first_name} lastName={client.last_name} size="sm" />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-semibold text-ink-900 dark:text-ink-50">
                                                {client.first_name} {client.last_name}
                                            </span>
                                            <span className="block text-sm text-ink-600 dark:text-ink-350">{client.phone}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    {!selectedClient && clientResults.length === 0 && (
                        <EmptyState compact icon={UserSearch} title={t('subscription.pickClient')} description={t('subscription.pickClientHint')} />
                    )}

                    {selectedClient && (
                        <div className="animate-fade-in space-y-5">
                            <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-400/25 dark:bg-brand-400/5">
                                <Avatar firstName={selectedClient.first_name} lastName={selectedClient.last_name} />
                                <span className="min-w-0 flex-1 truncate font-semibold text-ink-900 dark:text-ink-50">
                                    {selectedClient.first_name} {selectedClient.last_name}
                                </span>
                                <button type="button" onClick={() => setSelectedClient(null)} className={button('secondary', 'sm')}>
                                    <X aria-hidden="true" className="h-4 w-4" />
                                    {t('common.cancel')}
                                </button>
                            </div>

                            <ul className="space-y-3">
                                {subscriptions.length === 0 && (
                                    <li className="rounded-xl border border-dashed border-ink-300 dark:border-ink-700">
                                        <EmptyState compact icon={Sparkles} title={t('subscription.none')} />
                                    </li>
                                )}
                                {subscriptions.map((sub) => {
                                    const usage = sub.plan.quota_amount > 0 ? Math.min(1, sub.quota_used / sub.plan.quota_amount) : 0;
                                    return (
                                        <li key={sub.id} className="space-y-3 rounded-xl border border-ink-200 p-4 dark:border-ink-700">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <p className="font-display font-bold text-ink-900 dark:text-ink-50">{sub.plan.name}</p>
                                                <StatusBadge kind="subscription" status={sub.status} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="inline-flex items-center gap-1.5 text-ink-600 dark:text-ink-350">
                                                        <Gauge aria-hidden="true" className="h-4 w-4" />
                                                        {t('subscription.quotaUsed')}
                                                    </span>
                                                    <span className="font-semibold tabular-nums text-ink-900 dark:text-ink-50">
                                                        {sub.quota_used} / {sub.plan.quota_amount} {t(`subscription.quotaType.${sub.plan.quota_type}`)}
                                                    </span>
                                                </div>
                                                <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                                                    <div
                                                        className={cx('h-full rounded-full transition-all', usage >= 0.9 ? 'bg-red-500' : usage >= 0.7 ? 'bg-amber-500' : 'bg-brand-500 dark:bg-brand-400')}
                                                        style={{ width: `${usage * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <span className="inline-flex items-center gap-1.5 text-sm text-ink-600 dark:text-ink-350">
                                                    <CalendarDays aria-hidden="true" className="h-4 w-4" />
                                                    {t('subscription.expiresAt')} {date(sub.expires_at)}
                                                </span>
                                                <button type="button" onClick={() => void renew(sub)} className={button('secondary', 'sm')}>
                                                    <RefreshCw aria-hidden="true" className="h-4 w-4" />
                                                    {t('subscription.renew')}
                                                </button>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>

                            <div className="space-y-4 rounded-xl bg-ink-50 p-4 dark:bg-ink-950/50">
                                <div>
                                    <label htmlFor="sub-plan" className={label}>
                                        {t('subscription.newPlan')}
                                    </label>
                                    <select
                                        id="sub-plan"
                                        value={selectedPlanId}
                                        onChange={(e) => setSelectedPlanId(e.target.value ? Number(e.target.value) : '')}
                                        className={select}
                                    >
                                        <option value="">—</option>
                                        {plans.map((plan) => (
                                            <option key={plan.id} value={plan.id}>
                                                {plan.name} — {money(plan.price)}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <PaymentMethodPicker name="subscription-method" value={method} onChange={setMethod} />
                                <button type="button" onClick={() => void subscribe()} disabled={!selectedPlanId} className={button('primary', 'md', 'w-full')}>
                                    <Crown aria-hidden="true" className="h-4 w-4" />
                                    {t('subscription.subscribe')}
                                </button>
                            </div>
                        </div>
                    )}
                </section>

                <PlanManagement plans={plans} onCreated={(plan) => setPlans((current) => [...current, plan])} />
            </div>
        </div>
    );
}

function PlanManagement({ plans, onCreated }: { plans: SubscriptionPlan[]; onCreated: (plan: SubscriptionPlan) => void }) {
    const { t } = useI18n();
    const { money } = useFormat();
    const [name, setName] = useState('');
    const [quotaType, setQuotaType] = useState<'kg' | 'articles'>('kg');
    const [quotaAmount, setQuotaAmount] = useState(10);
    const [price, setPrice] = useState(5000);
    const [durationDays, setDurationDays] = useState(30);
    const [error, setError] = useState<string | null>(null);

    async function createPlan() {
        setError(null);
        try {
            const plan = await api.post<SubscriptionPlan>('/subscription-plans', {
                name,
                quota_type: quotaType,
                quota_amount: quotaAmount,
                price,
                duration_days: durationDays,
            });
            onCreated(plan);
            setName('');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    return (
        <section aria-labelledby="plans-heading" className={cx(card, 'overflow-hidden')}>
            <div className="space-y-4 p-5 sm:p-6">
                <h2 id="plans-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                    <Layers aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                    {t('subscription.plans')}
                </h2>

                {plans.length === 0 ? (
                    <EmptyState compact icon={Layers} title={t('subscription.noPlans')} />
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2">
                        {plans.map((plan) => (
                            <li
                                key={plan.id}
                                className="relative overflow-hidden rounded-xl border border-ink-200 bg-gradient-to-br from-white to-brand-50/60 p-4 dark:border-ink-700 dark:from-ink-900 dark:to-brand-400/5"
                            >
                                <p className="pr-6 font-display font-bold text-ink-900 dark:text-ink-50">{plan.name}</p>
                                <Crown aria-hidden="true" className="absolute right-3 top-3.5 h-4 w-4 text-accent-600 dark:text-accent-300" />
                                <p className="mt-2 font-display text-xl font-extrabold tabular-nums text-brand-700 dark:text-brand-300">{money(plan.price)}</p>
                                <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-600 dark:text-ink-350">
                                    <span className="inline-flex items-center gap-1">
                                        <Gauge aria-hidden="true" className="h-3.5 w-3.5" />
                                        {plan.quota_amount} {t(`subscription.quotaType.${plan.quota_type}`)}
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                                        {t('license.days', { days: plan.duration_days })}
                                    </span>
                                </p>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="space-y-4 border-t border-ink-200/80 bg-ink-50/70 p-5 sm:p-6 dark:border-ink-800 dark:bg-ink-950/40">
                <h3 className={cx(sectionTitle, 'flex items-center gap-2 text-sm')}>
                    <Plus aria-hidden="true" className="h-4 w-4 text-brand-700 dark:text-brand-300" />
                    {t('subscription.createPlan')}
                </h3>
                {error && <Alert tone="error">{error}</Alert>}
                <label className="block">
                    <span className={label}>{t('subscription.planName')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className={label}>{t('subscription.quotaType')}</span>
                        <select value={quotaType} onChange={(e) => setQuotaType(e.target.value as 'kg' | 'articles')} className={select}>
                            <option value="kg">{t('subscription.quotaType.kg')}</option>
                            <option value="articles">{t('subscription.quotaType.articles')}</option>
                        </select>
                    </label>
                    <label className="block">
                        <span className={label}>{t('subscription.quotaAmount')}</span>
                        <input type="number" min={1} value={quotaAmount} onChange={(e) => setQuotaAmount(Number(e.target.value))} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('subscription.duration')}</span>
                        <input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('subscription.price')}</span>
                        <input type="number" min={0} value={price} onChange={(e) => setPrice(Number(e.target.value))} className={input} />
                    </label>
                </div>
                <button type="button" onClick={() => void createPlan()} disabled={!name} className={button('primary', 'md', 'w-full sm:w-auto')}>
                    <Plus aria-hidden="true" className="h-4 w-4" />
                    {t('common.create')}
                </button>
            </div>
        </section>
    );
}

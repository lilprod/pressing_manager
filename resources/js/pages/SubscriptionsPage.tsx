import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import type { Client, CustomerSubscription, PaymentMethod, SubscriptionPlan } from '../types';

export default function SubscriptionsPage() {
    const { t } = useI18n();
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
            setFeedback(t('subscription.subscribe'));
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
            setFeedback(t('subscription.renew'));
            if (selectedClient) loadSubscriptions(selectedClient.id);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    return (
        <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
            <div className="space-y-4">
                <h1 className="text-xl font-semibold">{t('subscription.title')}</h1>

                {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                {feedback && <p role="status" className="text-sm text-green-700 dark:text-green-400">{feedback}</p>}

                <label htmlFor="sub-client-search" className="sr-only">
                    {t('client.search')}
                </label>
                <input
                    id="sub-client-search"
                    type="search"
                    value={clientQuery}
                    onChange={(e) => setClientQuery(e.target.value)}
                    placeholder={t('client.search')}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                />

                {!selectedClient && clientResults.length > 0 && (
                    <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                        {clientResults.map((client) => (
                            <li key={client.id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedClient(client);
                                        loadSubscriptions(client.id);
                                    }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                    {client.first_name} {client.last_name} — {client.phone}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                {selectedClient && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600">
                            <span>
                                {selectedClient.first_name} {selectedClient.last_name}
                            </span>
                            <button type="button" onClick={() => setSelectedClient(null)} className="text-sm text-indigo-600 dark:text-indigo-400">
                                {t('common.cancel')}
                            </button>
                        </div>

                        <ul className="space-y-2">
                            {subscriptions.length === 0 && <li className="text-sm text-slate-600 dark:text-slate-400">{t('subscription.none')}</li>}
                            {subscriptions.map((sub) => (
                                <li key={sub.id} className="space-y-1 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
                                    <p className="font-medium">{sub.plan.name}</p>
                                    <p>
                                        {t('common.status')}: {sub.status} — {t('subscription.expiresAt')}{' '}
                                        {new Date(sub.expires_at).toLocaleDateString()}
                                    </p>
                                    <p>
                                        {t('subscription.quotaUsed')}: {sub.quota_used} / {sub.plan.quota_amount}{' '}
                                        {t(`subscription.quotaType.${sub.plan.quota_type}`)}
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => void renew(sub)}
                                        className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:border-indigo-500 dark:border-slate-600"
                                    >
                                        {t('subscription.renew')}
                                    </button>
                                </li>
                            ))}
                        </ul>

                        <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                            <label className="block text-sm">
                                {t('subscription.newPlan')}
                                <select
                                    value={selectedPlanId}
                                    onChange={(e) => setSelectedPlanId(e.target.value ? Number(e.target.value) : '')}
                                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                                >
                                    <option value="">—</option>
                                    {plans.map((plan) => (
                                        <option key={plan.id} value={plan.id}>
                                            {plan.name} — {plan.price} FCFA
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block text-sm">
                                {t('payment.method')}
                                <select
                                    value={method}
                                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                                >
                                    <option value="espece">{t('payment.cash')}</option>
                                    <option value="carte">{t('payment.card')}</option>
                                    <option value="flooz">{t('payment.flooz')}</option>
                                    <option value="tmoney">{t('payment.tmoney')}</option>
                                </select>
                            </label>
                            <button
                                type="button"
                                onClick={() => void subscribe()}
                                disabled={!selectedPlanId}
                                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                            >
                                {t('subscription.subscribe')}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <PlanManagement plans={plans} onCreated={(plan) => setPlans((current) => [...current, plan])} />
        </div>
    );
}

function PlanManagement({ plans, onCreated }: { plans: SubscriptionPlan[]; onCreated: (plan: SubscriptionPlan) => void }) {
    const { t } = useI18n();
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
        <section aria-labelledby="plans-heading" className="space-y-3">
            <h2 id="plans-heading" className="font-medium">
                {t('subscription.plans')}
            </h2>

            <ul className="space-y-1 text-sm">
                {plans.map((plan) => (
                    <li key={plan.id} className="rounded-md border border-slate-200 p-2 dark:border-slate-700">
                        {plan.name} — {plan.quota_amount} {t(`subscription.quotaType.${plan.quota_type}`)} / {plan.duration_days}j — {plan.price} FCFA
                    </li>
                ))}
            </ul>

            <div className="space-y-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
                {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
                <label className="block text-sm">
                    {t('subscription.planName')}
                    <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                    />
                </label>
                <div className="grid grid-cols-2 gap-2">
                    <label className="text-sm">
                        {t('subscription.quotaType')}
                        <select
                            value={quotaType}
                            onChange={(e) => setQuotaType(e.target.value as 'kg' | 'articles')}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                        >
                            <option value="kg">{t('subscription.quotaType.kg')}</option>
                            <option value="articles">{t('subscription.quotaType.articles')}</option>
                        </select>
                    </label>
                    <label className="text-sm">
                        {t('subscription.quotaAmount')}
                        <input
                            type="number"
                            min={1}
                            value={quotaAmount}
                            onChange={(e) => setQuotaAmount(Number(e.target.value))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                        />
                    </label>
                    <label className="text-sm">
                        {t('subscription.duration')}
                        <input
                            type="number"
                            min={1}
                            value={durationDays}
                            onChange={(e) => setDurationDays(Number(e.target.value))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                        />
                    </label>
                    <label className="text-sm">
                        {t('subscription.price')}
                        <input
                            type="number"
                            min={0}
                            value={price}
                            onChange={(e) => setPrice(Number(e.target.value))}
                            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                        />
                    </label>
                </div>
                <button
                    type="button"
                    onClick={() => void createPlan()}
                    disabled={!name}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                    {t('common.create')}
                </button>
            </div>
        </section>
    );
}

import { useEffect, useState, type FormEvent } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useLicense } from '../contexts/LicenseContext';
import { api, ApiError } from '../lib/api';
import type { LicensePlanConfig, PaymentMethod } from '../types';

export default function LicenseRenewalForm() {
    const { t } = useI18n();
    const { refresh } = useLicense();
    const [plans, setPlans] = useState<Record<string, LicensePlanConfig>>({});
    const [plan, setPlan] = useState('');
    const [method, setMethod] = useState<PaymentMethod>('espece');
    const [externalReference, setExternalReference] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        api.get<Record<string, LicensePlanConfig>>('/license/plans').then((data) => {
            setPlans(data);
            const [first] = Object.keys(data);
            if (first) setPlan(first);
        });
    }, []);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setSuccess(false);
        try {
            await api.post('/license/renew', {
                plan,
                method,
                external_reference: externalReference || null,
            });
            setSuccess(true);
            await refresh();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            {success && <p role="status" className="text-sm text-green-700 dark:text-green-400">{t('license.renewed')}</p>}

            <label className="block text-sm">
                {t('license.plan')}
                <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 dark:border-slate-600 dark:bg-slate-900"
                >
                    {Object.entries(plans).map(([slug, config]) => (
                        <option key={slug} value={slug}>
                            {slug} — {config.price} FCFA / {config.days}j
                        </option>
                    ))}
                </select>
            </label>

            <label className="block text-sm">
                {t('payment.method')}
                <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 dark:border-slate-600 dark:bg-slate-900"
                >
                    <option value="espece">{t('payment.cash')}</option>
                    <option value="carte">{t('payment.card')}</option>
                    <option value="flooz">{t('payment.flooz')}</option>
                    <option value="tmoney">{t('payment.tmoney')}</option>
                </select>
            </label>

            <label className="block text-sm">
                {t('payment.externalReference')}
                <input
                    type="text"
                    value={externalReference}
                    onChange={(e) => setExternalReference(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 dark:border-slate-600 dark:bg-slate-900"
                />
            </label>

            <button
                type="submit"
                disabled={busy || !plan}
                className="w-full rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
                {t('license.renew')}
            </button>
        </form>
    );
}

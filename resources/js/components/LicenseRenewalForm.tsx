import { useEffect, useState, type FormEvent } from 'react';
import { CalendarClock, Check, RefreshCw } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { useLicense } from '../contexts/LicenseContext';
import { api, ApiError } from '../lib/api';
import { useFormat } from '../lib/format';
import type { LicensePlanConfig, PaymentMethod } from '../types';
import PaymentMethodPicker from './PaymentMethodPicker';
import { Alert, Spinner } from './ui/Feedback';
import { button, cx, input, label } from './ui/styles';

export default function LicenseRenewalForm() {
    const { t } = useI18n();
    const { money } = useFormat();
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

    function planLabel(slug: string): string {
        const key = `license.planName.${slug}`;
        const translated = t(key);
        return translated === key ? slug : translated;
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-5">
            {error && <Alert tone="error">{error}</Alert>}
            {success && <Alert tone="success">{t('license.renewed')}</Alert>}

            <fieldset>
                <legend className={label}>{t('license.plan')}</legend>
                <div className="grid gap-2.5 sm:grid-cols-3">
                    {Object.entries(plans).map(([slug, config]) => {
                        const checked = plan === slug;
                        return (
                            <label
                                key={slug}
                                className={cx(
                                    'relative flex cursor-pointer flex-col gap-1 rounded-xl border-2 p-3.5 transition duration-150',
                                    'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/25',
                                    checked
                                        ? 'border-brand-600 bg-brand-50 dark:border-brand-300 dark:bg-brand-400/10'
                                        : 'border-ink-200 bg-white hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:hover:border-ink-600',
                                )}
                            >
                                <input
                                    type="radio"
                                    name="license-plan"
                                    value={slug}
                                    checked={checked}
                                    onChange={() => setPlan(slug)}
                                    className="sr-only"
                                />
                                {checked && (
                                    <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white dark:bg-brand-300 dark:text-ink-950">
                                        <Check aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={3} />
                                    </span>
                                )}
                                <span className="text-sm font-semibold capitalize text-ink-900 dark:text-ink-50">{planLabel(slug)}</span>
                                <span className="font-display text-lg font-bold tabular-nums text-ink-900 dark:text-white">{money(config.price)}</span>
                                <span className="inline-flex items-center gap-1 text-xs text-ink-600 dark:text-ink-350">
                                    <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
                                    {t('license.days', { days: config.days })}
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            <PaymentMethodPicker name="license-method" value={method} onChange={setMethod} />

            <div>
                <label htmlFor="license-external-ref" className={label}>
                    {t('payment.externalReference')}
                </label>
                <input
                    id="license-external-ref"
                    type="text"
                    value={externalReference}
                    onChange={(e) => setExternalReference(e.target.value)}
                    className={input}
                />
            </div>

            <button type="submit" disabled={busy || !plan} className={button('primary', 'lg', 'w-full')}>
                {busy ? <Spinner className="h-5 w-5" /> : <RefreshCw aria-hidden="true" className="h-5 w-5" />}
                {t('license.renew')}
            </button>
        </form>
    );
}

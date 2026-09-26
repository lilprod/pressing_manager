import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useLicense } from '../contexts/LicenseContext';
import { hasPermission } from '../lib/permissions';
import { api } from '../lib/api';
import LicenseRenewalForm from '../components/LicenseRenewalForm';
import type { LicensePayment } from '../types';
import { CalendarDays, CircleAlert, History, KeyRound, Layers, RefreshCw } from 'lucide-react';
import { useFormat } from '../lib/format';
import PageHeader from '../components/ui/PageHeader';
import StatusBadge, { statusTone } from '../components/ui/StatusBadge';
import { EmptyState, LoadingState } from '../components/ui/Feedback';
import { card, cardPadded, cx, sectionTitle } from '../components/ui/styles';

export default function LicensePage() {
    const { user } = useAuth();
    const { license, loading } = useLicense();
    const { t } = useI18n();
    const { money, date } = useFormat();
    const [history, setHistory] = useState<LicensePayment[]>([]);
    const canManage = hasPermission(user, 'licenses.manage');

    useEffect(() => {
        if (canManage) {
            api.get<LicensePayment[]>('/license/history').then(setHistory).catch(() => setHistory([]));
        }
    }, [canManage]);

    if (loading) {
        return <LoadingState />;
    }

    if (!license) {
        return (
            <div role="alert" className={card}>
                <EmptyState icon={CircleAlert} title={t('common.error')} />
            </div>
        );
    }

    const tone = statusTone('license', license.status);
    const ringColor =
        tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
    // Jauge : jours restants rapportés à une année (plafonnée), pour une lecture visuelle rapide.
    const ratio = Math.max(0, Math.min(1, license.days_remaining / 365));
    const circumference = 2 * Math.PI * 42;

    return (
        <div className="space-y-6">
            <PageHeader title={t('license.title')} subtitle={t('license.subtitle')} icon={KeyRound} />

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
                <div className="space-y-6">
                    <section aria-labelledby="license-status-heading" className={cardPadded}>
                        <div className="flex items-center justify-between gap-2">
                            <h2 id="license-status-heading" className={sectionTitle}>
                                {t('license.current')}
                            </h2>
                            <StatusBadge kind="license" status={license.status} size="md" />
                        </div>

                        <div className="mt-6 flex flex-wrap items-center gap-6">
                            <div className="relative h-32 w-32 shrink-0">
                                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
                                    <circle cx="50" cy="50" r="42" fill="none" strokeWidth="9" className="stroke-ink-100 dark:stroke-ink-800" />
                                    <circle
                                        cx="50"
                                        cy="50"
                                        r="42"
                                        fill="none"
                                        strokeWidth="9"
                                        strokeLinecap="round"
                                        stroke="currentColor"
                                        strokeDasharray={circumference}
                                        strokeDashoffset={circumference * (1 - ratio)}
                                        className={cx('transition-all duration-700', ringColor)}
                                    />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="font-display text-3xl font-extrabold tabular-nums text-ink-900 dark:text-white">{license.days_remaining}</span>
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-600 dark:text-ink-350">{t('license.daysShort')}</span>
                                </div>
                            </div>

                            <dl className="min-w-[12rem] flex-1 space-y-3 text-sm">
                                <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-3 dark:border-ink-800">
                                    <dt className="inline-flex items-center gap-2 text-ink-600 dark:text-ink-350">
                                        <Layers aria-hidden="true" className="h-4 w-4" />
                                        {t('license.plan')}
                                    </dt>
                                    <dd className="font-semibold capitalize text-ink-900 dark:text-ink-50">{license.plan}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-3 dark:border-ink-800">
                                    <dt className="inline-flex items-center gap-2 text-ink-600 dark:text-ink-350">
                                        <CalendarDays aria-hidden="true" className="h-4 w-4" />
                                        {t('license.expiresAt')}
                                    </dt>
                                    <dd className="font-semibold text-ink-900 dark:text-ink-50">{date(license.expires_at)}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="inline-flex items-center gap-2 text-ink-600 dark:text-ink-350">
                                        <RefreshCw aria-hidden="true" className="h-4 w-4" />
                                        {t('license.daysRemaining')}
                                    </dt>
                                    <dd className="font-semibold tabular-nums text-ink-900 dark:text-ink-50">{license.days_remaining}</dd>
                                </div>
                            </dl>
                        </div>
                    </section>

                    {canManage && history.length > 0 && (
                        <section aria-labelledby="history-heading" className={cx(card, 'overflow-hidden')}>
                            <h2 id="history-heading" className={cx(sectionTitle, 'flex items-center gap-2 px-5 pb-3 pt-5')}>
                                <History aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                                {t('license.history')}
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-ink-50 text-xs uppercase tracking-wider text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">
                                        <tr>
                                            <th scope="col" className="px-5 py-2.5 font-semibold">
                                                {t('payment.amount')}
                                            </th>
                                            <th scope="col" className="px-5 py-2.5 font-semibold">
                                                {t('payment.method')}
                                            </th>
                                            <th scope="col" className="px-5 py-2.5 font-semibold">
                                                {t('license.expiresAt')}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                                        {history.map((payment) => (
                                            <tr key={payment.id} className="transition hover:bg-ink-50/60 dark:hover:bg-ink-800/40">
                                                <td className="whitespace-nowrap px-5 py-3 font-semibold tabular-nums text-ink-900 dark:text-ink-50">{money(payment.amount)}</td>
                                                <td className="px-5 py-3 text-ink-700 dark:text-ink-300">{t(PAYMENT_METHOD_KEYS[payment.method])}</td>
                                                <td className="whitespace-nowrap px-5 py-3 text-ink-700 dark:text-ink-300">{date(payment.new_expires_at)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}
                </div>

                {canManage && (
                    <section aria-labelledby="renew-heading" className={cardPadded}>
                        <h2 id="renew-heading" className={cx(sectionTitle, 'mb-5 flex items-center gap-2')}>
                            <RefreshCw aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                            {t('license.renew')}
                        </h2>
                        <LicenseRenewalForm />
                    </section>
                )}
            </div>
        </div>
    );
}

const PAYMENT_METHOD_KEYS: Record<LicensePayment['method'], string> = {
    espece: 'payment.cash',
    carte: 'payment.card',
    flooz: 'payment.flooz',
    tmoney: 'payment.tmoney',
};

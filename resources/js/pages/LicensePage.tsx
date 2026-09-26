import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useLicense } from '../contexts/LicenseContext';
import { hasPermission } from '../lib/permissions';
import { api } from '../lib/api';
import LicenseRenewalForm from '../components/LicenseRenewalForm';
import type { LicensePayment } from '../types';

export default function LicensePage() {
    const { user } = useAuth();
    const { license, loading } = useLicense();
    const { t } = useI18n();
    const [history, setHistory] = useState<LicensePayment[]>([]);
    const canManage = hasPermission(user, 'licenses.manage');

    useEffect(() => {
        if (canManage) {
            api.get<LicensePayment[]>('/license/history').then(setHistory).catch(() => setHistory([]));
        }
    }, [canManage]);

    if (loading) {
        return <p>{t('common.loading')}</p>;
    }

    if (!license) {
        return <p role="alert">{t('common.error')}</p>;
    }

    return (
        <div className="max-w-xl space-y-6">
            <h1 className="text-xl font-semibold">{t('license.title')}</h1>

            <dl className="grid grid-cols-2 gap-2 rounded-md border border-slate-200 p-4 text-sm dark:border-slate-700">
                <dt className="font-medium">{t('common.status')}</dt>
                <dd>{t(`license.status.${license.status}`)}</dd>
                <dt className="font-medium">{t('license.plan')}</dt>
                <dd>{license.plan}</dd>
                <dt className="font-medium">{t('license.expiresAt')}</dt>
                <dd>{new Date(license.expires_at).toLocaleDateString()}</dd>
                <dt className="font-medium">{t('license.daysRemaining')}</dt>
                <dd>{license.days_remaining}</dd>
            </dl>

            {canManage && (
                <section aria-labelledby="renew-heading" className="space-y-2 rounded-md border border-slate-200 p-4 dark:border-slate-700">
                    <h2 id="renew-heading" className="font-medium">
                        {t('license.renew')}
                    </h2>
                    <LicenseRenewalForm />
                </section>
            )}

            {canManage && history.length > 0 && (
                <section aria-labelledby="history-heading" className="space-y-2">
                    <h2 id="history-heading" className="font-medium">
                        {t('license.history')}
                    </h2>
                    <table className="w-full text-left text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="py-1">{t('payment.amount')}</th>
                                <th>{t('payment.method')}</th>
                                <th>{t('license.expiresAt')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map((payment) => (
                                <tr key={payment.id} className="border-b border-slate-100 dark:border-slate-800">
                                    <td className="py-1">{payment.amount} FCFA</td>
                                    <td>{payment.method}</td>
                                    <td>{new Date(payment.new_expires_at).toLocaleDateString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </section>
            )}
        </div>
    );
}

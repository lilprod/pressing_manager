import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { hasPermission } from '../lib/permissions';
import LicenseRenewalForm from './LicenseRenewalForm';

export default function LicenseBlockedScreen() {
    const { user, logout } = useAuth();
    const { t } = useI18n();
    const canRenew = hasPermission(user, 'licenses.manage');

    return (
        <div className="flex min-h-screen items-center justify-center px-4">
            <div className="w-full max-w-md space-y-4 rounded-xl border border-red-300 bg-white p-6 shadow-sm dark:border-red-800 dark:bg-slate-800">
                <h1 className="text-xl font-semibold text-red-700 dark:text-red-400">{t('license.blockedTitle')}</h1>
                <p role="alert">{t('license.blockedMessage')}</p>

                {canRenew ? (
                    <LicenseRenewalForm />
                ) : (
                    <p className="text-sm text-slate-600 dark:text-slate-400">{t('license.blockedNoPermission')}</p>
                )}

                <button type="button" onClick={() => void logout()} className="text-sm text-slate-500 underline dark:text-slate-400">
                    {t('nav.logout')}
                </button>
            </div>
        </div>
    );
}

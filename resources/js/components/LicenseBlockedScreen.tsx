import { Lock, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { hasPermission } from '../lib/permissions';
import LicenseRenewalForm from './LicenseRenewalForm';
import BrandMark from './BrandMark';
import { Alert } from './ui/Feedback';
import { button, card } from './ui/styles';

export default function LicenseBlockedScreen() {
    const { user, logout } = useAuth();
    const { t } = useI18n();
    const canRenew = hasPermission(user, 'licenses.manage');

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-ink-50 px-4 py-10 dark:bg-ink-950">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-rose-100/70 to-transparent dark:from-rose-500/10"
            />

            <div className="relative w-full max-w-md space-y-6">
                <div className="flex justify-center">
                    <BrandMark />
                </div>

                <div className={`${card} overflow-hidden`}>
                    <div className="flex flex-col items-center gap-3 border-b border-ink-200/80 bg-rose-50/60 px-6 pb-6 pt-8 text-center dark:border-ink-800 dark:bg-rose-400/5">
                        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-700 text-white shadow-lg shadow-rose-700/25 dark:bg-rose-400 dark:text-ink-950 dark:shadow-none">
                            <Lock aria-hidden="true" className="h-7 w-7" />
                        </span>
                        <h1 className="font-display text-xl font-bold text-rose-800 dark:text-rose-300">{t('license.blockedTitle')}</h1>
                        <p role="alert" className="text-sm text-ink-700 dark:text-ink-300">
                            {t('license.blockedMessage')}
                        </p>
                    </div>

                    <div className="space-y-5 p-6">
                        {canRenew ? <LicenseRenewalForm /> : <Alert tone="info">{t('license.blockedNoPermission')}</Alert>}

                        <button type="button" onClick={() => void logout()} className={button('ghost', 'md', 'w-full')}>
                            <LogOut aria-hidden="true" className="h-4 w-4" />
                            {t('nav.logout')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

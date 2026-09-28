import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, TriangleAlert, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useI18n } from '../contexts/I18nContext';

export default function PasswordExpiryBanner() {
    const { user } = useAuth();
    const { settings } = useSettings();
    const { t } = useI18n();
    const [dismissed, setDismissed] = useState(false);

    if (dismissed || !user || !settings || !user.password_expires_at || user.password_expired) {
        return null;
    }

    const daysRemaining = Math.ceil((new Date(user.password_expires_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    if (daysRemaining > settings.password_expiry_warning_days) {
        return null;
    }

    return (
        <div role="alert" className="bg-amber-600 text-white">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-center text-sm font-medium sm:px-6">
                <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>{t('profile.passwordExpiryWarning', { days: Math.max(daysRemaining, 0) })}</span>
                <Link
                    to="/profile"
                    className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 font-semibold text-white underline-offset-2 ring-1 ring-inset ring-white/30 transition hover:bg-white/25 hover:underline"
                >
                    {t('profile.changePassword')}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    aria-label={t('common.close')}
                    className="rounded-lg p-1 text-white/80 transition hover:bg-white/15 hover:text-white"
                >
                    <X aria-hidden="true" className="h-4 w-4" />
                </button>
            </div>
        </div>
    );
}

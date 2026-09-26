import { Link } from 'react-router-dom';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { useLicense } from '../contexts/LicenseContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';

export default function LicenseBanner() {
    const { license } = useLicense();
    const { t } = useI18n();
    const { date } = useFormat();

    if (!license || license.status !== 'grace_period') {
        return null;
    }

    return (
        <div role="alert" className="bg-rose-700 text-white">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2.5 text-center text-sm font-medium sm:px-6">
                <ShieldAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span>{t('license.graceBanner', { date: date(license.grace_ends_at) })}</span>
                <Link
                    to="/license"
                    className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2.5 py-1 font-semibold text-white underline-offset-2 ring-1 ring-inset ring-white/30 transition hover:bg-white/25 hover:underline"
                >
                    {t('license.renew')}
                    <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                </Link>
            </div>
        </div>
    );
}

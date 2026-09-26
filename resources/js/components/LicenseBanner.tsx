import { Link } from 'react-router-dom';
import { useLicense } from '../contexts/LicenseContext';
import { useI18n } from '../contexts/I18nContext';

export default function LicenseBanner() {
    const { license } = useLicense();
    const { t } = useI18n();

    if (!license || license.status !== 'grace_period') {
        return null;
    }

    return (
        <div role="alert" className="bg-red-700 px-4 py-2 text-center text-sm font-medium text-white">
            {t('license.graceBanner', { date: new Date(license.grace_ends_at).toLocaleDateString() })}{' '}
            <Link to="/license" className="underline">
                {t('license.renew')}
            </Link>
        </div>
    );
}

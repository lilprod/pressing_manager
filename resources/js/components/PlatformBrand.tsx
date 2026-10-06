import { useSuperadminAuth } from '../contexts/SuperadminAuthContext';
import { BrandLogo } from './BrandMark';

/** Logo de la console superadmin : celui téléversé dans Paramètres, sinon le pictogramme par défaut. */
export function PlatformLogo({ className = '' }: { className?: string }) {
    const { logoUrl } = useSuperadminAuth();

    if (logoUrl) {
        return <img src={logoUrl} alt="" className={`object-contain ${className}`} />;
    }

    return <BrandLogo className={className} />;
}

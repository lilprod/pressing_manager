import { BrandLogo } from './BrandMark';
import { Spinner } from './ui/Feedback';

/** Écran d'attente affiché pendant la vérification de la session et de la licence. */
export default function SplashScreen() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-ink-50 dark:bg-ink-950">
            <BrandLogo className="h-14 w-14 animate-pulse" />
            <Spinner className="h-5 w-5 text-brand-600 dark:text-brand-300" />
        </div>
    );
}

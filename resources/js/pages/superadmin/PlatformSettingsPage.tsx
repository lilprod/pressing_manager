import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Mail, Palette, Phone, Settings as SettingsIcon, Upload } from 'lucide-react';
import { useSuperadminAuth } from '../../contexts/SuperadminAuthContext';
import { getPlatformToken, platformApi, PlatformApiError } from '../../lib/platformApi';
import { Alert, LoadingState, Spinner } from '../../components/ui/Feedback';
import { SectionCard } from '../../components/ui/Metrics';
import { button, cx, input, label } from '../../components/ui/styles';
import type { PlatformSetting } from '../../types';

/**
 * Phase 1 : identité de la console superadmin elle-même (logo/nom/couleurs/contacts)
 * — distincte du branding tenant (par pressing). Réservée au rôle superadmin côté
 * backend (UpdatePlatformSettingRequest) ; affichée en lecture seule aux autres
 * rôles transverses ici plutôt que masquée (évite une page vide sans explication).
 */
export default function PlatformSettingsPage() {
    const { user, refresh } = useSuperadminAuth();
    const canEdit = user?.platform_role?.slug === 'superadmin';
    const [settings, setSettings] = useState<PlatformSetting | null>(null);
    const [loading, setLoading] = useState(true);
    const logoInputRef = useRef<HTMLInputElement>(null);
    const faviconInputRef = useRef<HTMLInputElement>(null);

    const [appName, setAppName] = useState('');
    const [primaryColor, setPrimaryColor] = useState('');
    const [secondaryColor, setSecondaryColor] = useState('');
    const [supportEmail, setSupportEmail] = useState('');
    const [supportPhone, setSupportPhone] = useState('');
    const [legalEntityName, setLegalEntityName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    function load() {
        setLoading(true);
        platformApi
            .get<PlatformSetting>('/settings')
            .then((data) => {
                setSettings(data);
                setAppName(data.app_name);
                setPrimaryColor(data.primary_color ?? '');
                setSecondaryColor(data.secondary_color ?? '');
                setSupportEmail(data.support_email ?? '');
                setSupportPhone(data.support_phone ?? '');
                setLegalEntityName(data.legal_entity_name ?? '');
            })
            .finally(() => setLoading(false));
    }

    useEffect(load, []);

    async function save(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setSuccess(false);
        try {
            await platformApi.patch('/settings', {
                app_name: appName,
                primary_color: primaryColor || null,
                secondary_color: secondaryColor || null,
                support_email: supportEmail || null,
                support_phone: supportPhone || null,
                legal_entity_name: legalEntityName || null,
            });
            setSuccess(true);
            load();
            void refresh();
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setBusy(false);
        }
    }

    async function uploadAsset(field: 'logo' | 'favicon', file: File) {
        const formData = new FormData();
        formData.append(field, file);
        formData.append('_method', 'PATCH');
        setError(null);
        try {
            const response = await fetch('/api/platform/settings', {
                method: 'POST',
                headers: { Authorization: `Bearer ${getPlatformToken() ?? ''}` },
                body: formData,
            });
            if (!response.ok) throw new Error();
            load();
        } catch {
            setError("Le téléversement a échoué.");
        }
    }

    if (loading) return <LoadingState />;
    if (!settings) return null;

    return (
        <div className="max-w-2xl space-y-6">
            <header className="flex items-center gap-3.5">
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                    <SettingsIcon aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Paramètres de la console</h1>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Identité et contacts de la console superadmin elle-même.</p>
                </div>
            </header>

            <SectionCard id="platform-branding" title="Marque" subtitle="Nom affiché dans la barre latérale et sur la page de connexion.">
                <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-3">
                        {settings.logo_url ? (
                            <img src={settings.logo_url} alt="Logo" className="h-12 w-12 rounded-xl object-contain ring-1 ring-ink-200 dark:ring-ink-700" />
                        ) : (
                            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-ink-100 text-xs text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                                —
                            </div>
                        )}
                        <button type="button" disabled={!canEdit} onClick={() => logoInputRef.current?.click()} className={button('secondary', 'sm')}>
                            <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                            Logo
                        </button>
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void uploadAsset('logo', file);
                            }}
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        {settings.favicon_url ? (
                            <img src={settings.favicon_url} alt="Favicon" className="h-8 w-8 rounded-lg object-contain ring-1 ring-ink-200 dark:ring-ink-700" />
                        ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-[10px] text-ink-500 dark:bg-ink-800 dark:text-ink-400">
                                —
                            </div>
                        )}
                        <button type="button" disabled={!canEdit} onClick={() => faviconInputRef.current?.click()} className={button('secondary', 'sm')}>
                            <Upload aria-hidden="true" className="h-3.5 w-3.5" />
                            Favicon
                        </button>
                        <input
                            ref={faviconInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void uploadAsset('favicon', file);
                            }}
                        />
                    </div>
                </div>

                <form onSubmit={save} className="mt-5 space-y-4">
                    {error && <Alert tone="error">{error}</Alert>}
                    {success && <Alert tone="success">Paramètres enregistrés.</Alert>}
                    {!canEdit && <Alert tone="info">Réservé au rôle Superadmin — lecture seule pour votre rôle.</Alert>}

                    <fieldset disabled={!canEdit} className="space-y-4">
                    <label className="block">
                        <span className={label}>Nom de l'application</span>
                        <input value={appName} onChange={(e) => setAppName(e.target.value)} className={input} />
                    </label>

                    <div className="grid grid-cols-2 gap-4">
                        <label className="block">
                            <span className={label}>Couleur primaire</span>
                            <span className="relative block">
                                <Palette aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                <input
                                    value={primaryColor}
                                    onChange={(e) => setPrimaryColor(e.target.value)}
                                    placeholder="#24483F"
                                    className={cx(input, 'pl-10')}
                                />
                            </span>
                        </label>
                        <label className="block">
                            <span className={label}>Couleur secondaire</span>
                            <input value={secondaryColor} onChange={(e) => setSecondaryColor(e.target.value)} placeholder="#C8A54B" className={input} />
                        </label>
                    </div>

                    <label className="block">
                        <span className={label}>Raison sociale (ADMIN)</span>
                        <input value={legalEntityName} onChange={(e) => setLegalEntityName(e.target.value)} className={input} />
                    </label>

                    <div className="grid grid-cols-2 gap-4">
                        <label className="block">
                            <span className={label}>E-mail support</span>
                            <span className="relative block">
                                <Mail aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                <input
                                    type="email"
                                    value={supportEmail}
                                    onChange={(e) => setSupportEmail(e.target.value)}
                                    className={cx(input, 'pl-10')}
                                />
                            </span>
                        </label>
                        <label className="block">
                            <span className={label}>Téléphone support</span>
                            <span className="relative block">
                                <Phone aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                                <input value={supportPhone} onChange={(e) => setSupportPhone(e.target.value)} className={cx(input, 'pl-10')} />
                            </span>
                        </label>
                    </div>

                    <button type="submit" disabled={busy} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : null}
                        Enregistrer
                    </button>
                    </fieldset>
                </form>
            </SectionCard>
        </div>
    );
}

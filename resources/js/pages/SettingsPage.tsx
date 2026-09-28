import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { api, ApiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { Alert, Spinner } from '../components/ui/Feedback';
import { button, cardPadded, cx, input, label, sectionTitle } from '../components/ui/styles';
import { ImageUp, Settings as SettingsIcon } from 'lucide-react';
import type { AppSettings } from '../types';

export default function SettingsPage() {
    const { t } = useI18n();
    const { settings, refresh } = useSettings();

    const [pressingName, setPressingName] = useState('');
    const [address, setAddress] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (settings) {
            setPressingName(settings.pressing_name ?? '');
            setAddress(settings.address ?? '');
        }
    }, [settings]);

    const logoPreview = logoFile ? URL.createObjectURL(logoFile) : settings?.logo_url;
    const faviconPreview = faviconFile ? URL.createObjectURL(faviconFile) : settings?.favicon_url;

    async function submit() {
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            const formData = new FormData();
            formData.append('pressing_name', pressingName);
            formData.append('address', address);
            if (logoFile) formData.append('logo', logoFile);
            if (faviconFile) formData.append('favicon', faviconFile);
            await api.postForm<AppSettings>('/settings', formData);
            setLogoFile(null);
            setFaviconFile(null);
            await refresh();
            setFeedback(t('settings.saved'));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} icon={SettingsIcon} />

            <div className={cx(cardPadded, 'max-w-2xl space-y-5')}>
                {error && <Alert tone="error">{error}</Alert>}
                {feedback && <Alert tone="success">{feedback}</Alert>}

                <div>
                    <h2 className={sectionTitle}>{t('settings.identity')}</h2>
                    <div className="mt-3 space-y-4">
                        <label className="block">
                            <span className={label}>{t('settings.pressingName')}</span>
                            <input value={pressingName} onChange={(e) => setPressingName(e.target.value)} className={cx(input, 'w-full')} />
                        </label>
                        <label className="block">
                            <span className={label}>{t('settings.address')}</span>
                            <input value={address} onChange={(e) => setAddress(e.target.value)} className={cx(input, 'w-full')} />
                        </label>
                    </div>
                </div>

                <div className="grid gap-5 border-t border-ink-200/80 pt-5 sm:grid-cols-2 dark:border-ink-800">
                    <ImagePicker
                        label={t('settings.logo')}
                        hint={t('settings.logoHint')}
                        preview={logoPreview}
                        onChange={setLogoFile}
                    />
                    <ImagePicker
                        label={t('settings.favicon')}
                        hint={t('settings.faviconHint')}
                        preview={faviconPreview}
                        onChange={setFaviconFile}
                    />
                </div>

                <div className="flex justify-end border-t border-ink-200/80 pt-5 dark:border-ink-800">
                    <button type="button" onClick={() => void submit()} disabled={busy} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : null}
                        {t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ImagePicker({
    label: fieldLabel,
    hint,
    preview,
    onChange,
}: {
    label: string;
    hint: string;
    preview?: string | null;
    onChange: (file: File | null) => void;
}) {
    return (
        <label className="block">
            <span className={label}>{fieldLabel}</span>
            <p className="mb-2 text-xs text-ink-600 dark:text-ink-350">{hint}</p>
            <div className="flex items-center gap-3">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-ink-300 bg-ink-50 dark:border-ink-700 dark:bg-ink-950/50">
                    {preview ? (
                        <img src={preview} alt="" className="h-full w-full object-cover" />
                    ) : (
                        <ImageUp aria-hidden="true" className="h-6 w-6 text-ink-400" />
                    )}
                </span>
                <input
                    type="file"
                    accept="image/*"
                    aria-label={fieldLabel}
                    onChange={(e) => onChange(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-ink-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-ink-800 hover:file:bg-ink-200 dark:text-ink-200 dark:file:bg-ink-800 dark:file:text-ink-100 dark:hover:file:bg-ink-700"
                />
            </div>
        </label>
    );
}

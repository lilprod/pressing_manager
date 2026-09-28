import { useEffect, useState } from 'react';
import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { api, ApiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { Alert, Spinner } from '../components/ui/Feedback';
import { button, cardPadded, cx, input, inputSm, label, sectionTitle } from '../components/ui/styles';
import { ImageUp, ShieldCheck, Settings as SettingsIcon } from 'lucide-react';
import type { AppSettings } from '../types';

export default function SettingsPage() {
    const { t } = useI18n();
    const { settings, refresh } = useSettings();

    const [pressingName, setPressingName] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [taxId, setTaxId] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);

    const [expiryEnabled, setExpiryEnabled] = useState(false);
    const [passwordExpiryDays, setPasswordExpiryDays] = useState(90);
    const [passwordExpiryWarningDays, setPasswordExpiryWarningDays] = useState(14);
    const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(30);
    const [passwordMinLength, setPasswordMinLength] = useState(8);
    const [requireUppercase, setRequireUppercase] = useState(true);
    const [requireNumber, setRequireNumber] = useState(true);
    const [requireSymbol, setRequireSymbol] = useState(false);

    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!settings) return;
        setPressingName(settings.pressing_name ?? '');
        setAddress(settings.address ?? '');
        setPhone(settings.phone ?? '');
        setEmail(settings.email ?? '');
        setTaxId(settings.tax_id ?? '');
        setExpiryEnabled(!!settings.password_expiry_days);
        setPasswordExpiryDays(settings.password_expiry_days || 90);
        setPasswordExpiryWarningDays(settings.password_expiry_warning_days ?? 14);
        setSessionTimeoutMinutes(settings.session_timeout_minutes ?? 30);
        setPasswordMinLength(settings.password_min_length);
        setRequireUppercase(settings.password_require_uppercase);
        setRequireNumber(settings.password_require_number);
        setRequireSymbol(settings.password_require_symbol);
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
            formData.append('phone', phone);
            formData.append('email', email);
            formData.append('tax_id', taxId);
            if (logoFile) formData.append('logo', logoFile);
            if (faviconFile) formData.append('favicon', faviconFile);

            formData.append('password_expiry_days', String(expiryEnabled ? passwordExpiryDays : 0));
            formData.append('password_expiry_warning_days', String(passwordExpiryWarningDays));
            formData.append('session_timeout_minutes', String(sessionTimeoutMinutes));
            formData.append('password_min_length', String(passwordMinLength));
            formData.append('password_require_uppercase', requireUppercase ? '1' : '0');
            formData.append('password_require_number', requireNumber ? '1' : '0');
            formData.append('password_require_symbol', requireSymbol ? '1' : '0');

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
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>{t('settings.phone')}</span>
                                <input value={phone} onChange={(e) => setPhone(e.target.value)} className={cx(input, 'w-full')} />
                            </label>
                            <label className="block">
                                <span className={label}>{t('settings.email')}</span>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={cx(input, 'w-full')} />
                            </label>
                        </div>
                        <label className="block">
                            <span className={label}>{t('settings.taxId')}</span>
                            <input value={taxId} onChange={(e) => setTaxId(e.target.value)} className={cx(input, 'w-full')} />
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

                <div className="border-t border-ink-200/80 pt-5 dark:border-ink-800">
                    <h2 className={cx(sectionTitle, 'flex items-center gap-2')}>
                        <ShieldCheck aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                        {t('settings.security')}
                    </h2>
                    <div className="mt-3 space-y-4">
                        <label className="block">
                            <span className={label}>{t('settings.sessionTimeout')}</span>
                            <p className="mb-1.5 text-xs text-ink-600 dark:text-ink-350">{t('settings.sessionTimeoutHint')}</p>
                            <input
                                type="number"
                                min={5}
                                max={1440}
                                value={sessionTimeoutMinutes}
                                onChange={(e) => setSessionTimeoutMinutes(Number(e.target.value))}
                                className={cx(inputSm, 'w-32')}
                            />
                        </label>

                        <div className="rounded-xl bg-ink-50 p-3.5 dark:bg-ink-950/50">
                            <Toggle checked={expiryEnabled} onChange={setExpiryEnabled} label={t('settings.passwordExpiryEnabled')} />
                            {expiryEnabled && (
                                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                                    <label className="block">
                                        <span className={label}>{t('settings.passwordExpiryDays')}</span>
                                        <input
                                            type="number"
                                            min={1}
                                            max={3650}
                                            value={passwordExpiryDays}
                                            onChange={(e) => setPasswordExpiryDays(Number(e.target.value))}
                                            className={cx(inputSm, 'w-32')}
                                        />
                                    </label>
                                    <label className="block">
                                        <span className={label}>{t('settings.passwordExpiryWarningDays')}</span>
                                        <p className="mb-1.5 text-xs text-ink-600 dark:text-ink-350">{t('settings.passwordExpiryWarningDaysHint')}</p>
                                        <input
                                            type="number"
                                            min={1}
                                            max={90}
                                            value={passwordExpiryWarningDays}
                                            onChange={(e) => setPasswordExpiryWarningDays(Number(e.target.value))}
                                            className={cx(inputSm, 'w-32')}
                                        />
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 rounded-xl bg-ink-50 p-3.5 dark:bg-ink-950/50">
                            <label className="block">
                                <span className={label}>{t('settings.passwordMinLength')}</span>
                                <input
                                    type="number"
                                    min={6}
                                    max={64}
                                    value={passwordMinLength}
                                    onChange={(e) => setPasswordMinLength(Number(e.target.value))}
                                    className={cx(inputSm, 'w-32')}
                                />
                            </label>
                            <Toggle checked={requireUppercase} onChange={setRequireUppercase} label={t('settings.passwordRequireUppercase')} />
                            <Toggle checked={requireNumber} onChange={setRequireNumber} label={t('settings.passwordRequireNumber')} />
                            <Toggle checked={requireSymbol} onChange={setRequireSymbol} label={t('settings.passwordRequireSymbol')} />
                        </div>
                    </div>
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

function Toggle({ checked, onChange, label: toggleLabel }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
    return (
        <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-sm font-medium text-ink-800 dark:text-ink-100">{toggleLabel}</span>
            <span className="relative inline-flex items-center">
                <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
                <span
                    aria-hidden="true"
                    className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-600 dark:bg-brand-400' : 'bg-ink-400 dark:bg-ink-500')}
                >
                    <span className={cx('absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
                </span>
            </span>
        </label>
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

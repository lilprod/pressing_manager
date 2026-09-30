import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CircleCheck, CircleDashed, Eye, FileText, ImageUp, Mail, MapPin, Phone, RotateCcw, Save } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useSettings } from '../../contexts/SettingsContext';
import { api, ApiError } from '../../lib/api';
import { brandingChecklist } from '../../lib/brandingChecklist';
import { BrandLogo } from '../../components/BrandMark';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { SectionCard } from '../../components/ui/Metrics';
import { Pill } from '../../components/ui/StatusBadge';
import { button, cx, input, label, textLink } from '../../components/ui/styles';
import type { AppSettings } from '../../types';

/* Écran « Branding du pressing » (Figma SPARK PRESSING, section 09, node 72:21182) :
 * identité (nom, logo, favicon), coordonnées reprises sur les documents, aperçu en
 * direct et checklist. La palette de couleurs personnalisable, le site web, le pied de
 * page des documents et les modèles de ticket/facture de la maquette n'ont pas de
 * champ en base : omis, voir CLAUDE.md §2. */

interface FormState {
    pressing_name: string;
    address: string;
    phone: string;
    email: string;
    tax_id: string;
}

function fromSettings(settings: AppSettings | null): FormState {
    return {
        pressing_name: settings?.pressing_name ?? '',
        address: settings?.address ?? '',
        phone: settings?.phone ?? '',
        email: settings?.email ?? '',
        tax_id: settings?.tax_id ?? '',
    };
}

export default function BrandingSettingsPage() {
    const { t } = useI18n();
    const { settings, refresh } = useSettings();
    const [form, setForm] = useState<FormState>(() => fromSettings(settings));
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    useEffect(() => setForm(fromSettings(settings)), [settings]);

    const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : settings?.logo_url ?? null), [logoFile, settings?.logo_url]);
    const faviconPreview = useMemo(() => (faviconFile ? URL.createObjectURL(faviconFile) : settings?.favicon_url ?? null), [faviconFile, settings?.favicon_url]);

    const saved = fromSettings(settings);
    const dirty = logoFile !== null || faviconFile !== null || (Object.keys(saved) as (keyof FormState)[]).some((k) => saved[k] !== form[k]);
    const checklist = brandingChecklist({ ...form, logo_url: logoPreview, favicon_url: faviconPreview });

    function set<K extends keyof FormState>(key: K, value: string) {
        setForm((f) => ({ ...f, [key]: value }));
        setFeedback(null);
    }

    function reset() {
        setForm(fromSettings(settings));
        setLogoFile(null);
        setFaviconFile(null);
        setError(null);
    }

    async function submit() {
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            const data = new FormData();
            (Object.keys(form) as (keyof FormState)[]).forEach((k) => data.append(k, form[k]));
            if (logoFile) data.append('logo', logoFile);
            if (faviconFile) data.append('favicon', faviconFile);
            await api.postForm<AppSettings>('/settings', data);
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
            <Link to="/settings" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                {t('settingsHub.back')}
            </Link>

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">{t('branding.title')}</h1>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('branding.subtitle')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={reset} disabled={!dirty || busy} className={button('secondary', 'md', 'h-10')}>
                        <RotateCcw aria-hidden="true" className="h-4 w-4" />
                        {t('branding.reset')}
                    </button>
                    <button type="button" onClick={() => void submit()} disabled={!dirty || busy} className={button('primary', 'md', 'h-10')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                        {t('common.save')}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200/80 bg-white px-4 py-3 text-sm dark:border-ink-800 dark:bg-ink-900">
                <Eye aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-500 dark:text-ink-350" />
                <p className="min-w-0 flex-1 text-ink-700 dark:text-ink-200">{t('branding.liveHint')}</p>
                {dirty ? <Pill tone="amber">{t('branding.unsaved')}</Pill> : <Pill tone="emerald">{t('branding.upToDate')}</Pill>}
            </div>

            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-6">
                    <SectionCard id="branding-identity" title={t('branding.identity')} subtitle={t('branding.identityHint')}>
                        <label className="block">
                            <span className={label}>{t('settings.pressingName')}</span>
                            <input value={form.pressing_name} onChange={(e) => set('pressing_name', e.target.value)} className={input} aria-describedby="name-help" />
                            <span id="name-help" className="mt-1.5 block text-xs text-ink-600 dark:text-ink-350">
                                {t('branding.nameHelp')}
                            </span>
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <ImageField label={t('settings.logo')} hint={t('settings.logoHint')} preview={logoPreview} file={logoFile} onChange={setLogoFile} />
                            <ImageField
                                label={t('settings.favicon')}
                                hint={t('settings.faviconHint')}
                                preview={faviconPreview}
                                file={faviconFile}
                                onChange={setFaviconFile}
                            />
                        </div>
                    </SectionCard>

                    <SectionCard id="branding-contacts" title={t('branding.contacts')} subtitle={t('branding.contactsHint')}>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <IconInput icon={Phone} label={t('settings.phone')} value={form.phone} onChange={(v) => set('phone', v)} type="tel" />
                            <IconInput icon={Mail} label={t('settings.email')} value={form.email} onChange={(v) => set('email', v)} type="email" />
                        </div>
                        <IconInput icon={MapPin} label={t('settings.address')} value={form.address} onChange={(v) => set('address', v)} />
                        <IconInput icon={FileText} label={t('settings.taxId')} value={form.tax_id} onChange={(v) => set('tax_id', v)} />
                    </SectionCard>
                </div>

                <div className="min-w-0 space-y-6 lg:sticky lg:top-24">
                    <SectionCard id="branding-preview" title={t('branding.preview')} subtitle={t('branding.previewHint')}>
                        <div className="space-y-4">
                            <div className="flex items-center gap-2.5 rounded-xl border border-ink-200/80 bg-ink-50 px-3 py-2.5 dark:border-ink-800 dark:bg-ink-950/40">
                                {logoPreview ? (
                                    <img src={logoPreview} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                                ) : (
                                    <BrandLogo />
                                )}
                                <div className="min-w-0 leading-tight">
                                    <p className="truncate font-display text-[15px] font-extrabold text-ink-900 dark:text-white">{form.pressing_name || t('app.title')}</p>
                                    <p className="text-[11px] font-medium text-ink-600 dark:text-ink-350">{t('app.tagline')}</p>
                                </div>
                                <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">{t('branding.previewApp')}</span>
                            </div>

                            <div className="mx-auto max-w-xs rounded-lg border border-dashed border-ink-300 bg-white p-4 font-mono text-xs text-ink-900 shadow-sm dark:border-ink-600">
                                <div className="flex items-center gap-2 border-b border-ink-900 pb-2">
                                    {logoPreview && <img src={logoPreview} alt="" className="h-8 w-8 object-cover" />}
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold">{form.pressing_name || t('app.title')}</p>
                                        {form.address && <p className="truncate">{form.address}</p>}
                                        {(form.phone || form.email) && <p className="truncate">{[form.phone, form.email].filter(Boolean).join(' — ')}</p>}
                                        {form.tax_id && (
                                            <p className="truncate">
                                                {t('settings.taxId')} : {form.tax_id}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <p className="pt-2 text-center text-[11px] text-ink-600">{t('branding.previewDocument')}</p>
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard id="branding-checklist" title={t('branding.checklist')} subtitle={t('branding.checklistHint')}>
                        <ul className="space-y-2.5">
                            {checklist.map((item) => (
                                <li key={item.key} className="flex items-center gap-2.5 text-sm">
                                    {item.done ? (
                                        <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300" />
                                    ) : (
                                        <CircleDashed aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
                                    )}
                                    <span className={item.done ? 'text-ink-900 dark:text-ink-50' : 'text-ink-600 dark:text-ink-350'}>
                                        {t(`branding.check.${item.key}`)}
                                    </span>
                                    <span className="sr-only">{item.done ? t('settingsHub.status.configured') : t('settingsHub.status.toComplete')}</span>
                                </li>
                            ))}
                        </ul>
                    </SectionCard>
                </div>
            </div>
        </div>
    );
}

function IconInput({
    icon: Icon,
    label: fieldLabel,
    value,
    onChange,
    type = 'text',
}: {
    icon: typeof Phone;
    label: string;
    value: string;
    onChange: (value: string) => void;
    type?: string;
}) {
    return (
        <label className="block">
            <span className={label}>{fieldLabel}</span>
            <span className="relative block">
                <Icon aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-350" />
                <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={cx(input, 'pl-10')} />
            </span>
        </label>
    );
}

function ImageField({
    label: fieldLabel,
    hint,
    preview,
    file,
    onChange,
}: {
    label: string;
    hint: string;
    preview: string | null;
    file: File | null;
    onChange: (file: File | null) => void;
}) {
    const { t } = useI18n();
    return (
        <div>
            <span className={label}>{fieldLabel}</span>
            <div className="flex items-center gap-3 rounded-xl border border-ink-200/80 p-3 dark:border-ink-800">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-ink-300 bg-ink-50 dark:border-ink-700 dark:bg-ink-950/50">
                    {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImageUp aria-hidden="true" className="h-5 w-5 text-ink-400" />}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink-900 dark:text-ink-50">{file?.name ?? (preview ? t('branding.currentFile') : t('branding.noFile'))}</span>
                    <span className="block text-xs text-ink-600 dark:text-ink-350">{hint}</span>
                </span>
                <label className={cx(button('secondary', 'sm'), 'cursor-pointer')}>
                    {t('branding.choose')}
                    <input type="file" accept="image/*" aria-label={fieldLabel} onChange={(e) => onChange(e.target.files?.[0] ?? null)} className="sr-only" />
                </label>
            </div>
        </div>
    );
}

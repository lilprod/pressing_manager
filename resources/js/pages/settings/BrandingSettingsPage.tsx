import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowLeft,
    CircleCheck,
    CircleDashed,
    Eye,
    FileText,
    Globe,
    History,
    ImageUp,
    Mail,
    MapPin,
    Phone,
    RotateCcw,
    ScrollText,
    Send,
} from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useSettings } from '../../contexts/SettingsContext';
import { api, ApiError } from '../../lib/api';
import { brandingChecklist } from '../../lib/brandingChecklist';
import { contrastRatio, meetsAA } from '../../lib/contrast';
import { useFormat } from '../../lib/format';
import { BrandLogo } from '../../components/BrandMark';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { SectionCard } from '../../components/ui/Metrics';
import { Pill } from '../../components/ui/StatusBadge';
import { button, cx, input, label, textLink } from '../../components/ui/styles';
import type { AppSettings, AppSettingVersion } from '../../types';

/* Écran « Branding du pressing » (Figma SPARK PRESSING, section 09, node 72:21182) :
 * workflow brouillon -> publication + versions restaurables (décision actée avec
 * l'utilisateur, voir CLAUDE.md « Branding — brouillon / publication + versions »).
 * Logo/favicon restent en enregistrement immédiat (pas de fichier en attente de
 * publication, voir SaveBrandingDraftRequest côté backend) — seuls les champs texte
 * passent par le brouillon. La palette n'affecte que l'aperçu de cette page, pas le
 * thème global de l'app (chantier CSS runtime distinct, hors scope). */

type DraftFields = Pick<
    AppSettings,
    | 'pressing_name'
    | 'address'
    | 'phone'
    | 'email'
    | 'tax_id'
    | 'website'
    | 'legal_notice'
    | 'primary_color'
    | 'secondary_color'
    | 'monogram'
    | 'ticket_footer'
    | 'ticket_conditions'
>;

function fromSettings(settings: AppSettings | null): DraftFields {
    return {
        pressing_name: settings?.pressing_name ?? '',
        address: settings?.address ?? '',
        phone: settings?.phone ?? '',
        email: settings?.email ?? '',
        tax_id: settings?.tax_id ?? '',
        website: settings?.website ?? '',
        legal_notice: settings?.legal_notice ?? '',
        primary_color: settings?.primary_color ?? '#24483F',
        secondary_color: settings?.secondary_color ?? '#C8A54B',
        monogram: settings?.monogram ?? '',
        ticket_footer: settings?.ticket_footer ?? '',
        ticket_conditions: settings?.ticket_conditions ?? '',
    };
}

export default function BrandingSettingsPage() {
    const { t } = useI18n();
    const { settings, refresh } = useSettings();
    const { dateTime } = useFormat();

    const [form, setForm] = useState<DraftFields>(() => {
        const draft = settings?.draft_data;
        return draft ? { ...fromSettings(settings), ...draft } : fromSettings(settings);
    });
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);
    const [draftSavedAt, setDraftSavedAt] = useState<string | null>(settings?.draft_saved_at ?? null);
    const [busy, setBusy] = useState(false);
    const [uploadingAsset, setUploadingAsset] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [versions, setVersions] = useState<AppSettingVersion[]>([]);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const draft = settings?.draft_data;
        setForm(draft ? { ...fromSettings(settings), ...draft } : fromSettings(settings));
        setDraftSavedAt(settings?.draft_saved_at ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [settings?.updated_at]);

    useEffect(() => {
        api
            .get<AppSettingVersion[]>('/settings/versions')
            .then(setVersions)
            .catch(() => setVersions([]));
    }, []);

    const logoPreview = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : settings?.logo_url ?? null), [logoFile, settings?.logo_url]);
    const faviconPreview = useMemo(() => (faviconFile ? URL.createObjectURL(faviconFile) : settings?.favicon_url ?? null), [faviconFile, settings?.favicon_url]);
    const checklist = brandingChecklist({ ...form, logo_url: logoPreview, favicon_url: faviconPreview });

    const hasPendingDraft = !!draftSavedAt;

    const contrast = contrastRatio(form.primary_color || '#000000', '#FFFFFF');
    const contrastOk = meetsAA(contrast);

    function set<K extends keyof DraftFields>(key: K, value: string) {
        setForm((f) => ({ ...f, [key]: value }));
        setFeedback(null);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void saveDraft({ ...form, [key]: value }), 800);
    }

    async function saveDraft(next: DraftFields) {
        try {
            const result = await api.patch<AppSettings>('/settings/draft', next);
            setDraftSavedAt(result.draft_saved_at);
        } catch {
            // Un brouillon raté n'est pas bloquant : la prochaine frappe relance l'enregistrement.
        }
    }

    async function discardDraft() {
        setBusy(true);
        setError(null);
        try {
            const result = await api.post<AppSettings>('/settings/draft/discard');
            setForm(fromSettings(result));
            setDraftSavedAt(null);
            await refresh();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    async function publish() {
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            const result = await api.post<AppSettings & { affected_agencies_count: number }>('/settings/publish');
            setForm(fromSettings(result));
            setDraftSavedAt(null);
            await refresh();
            const versionsList = await api.get<AppSettingVersion[]>('/settings/versions');
            setVersions(versionsList);
            setFeedback(t('branding.publish.success', { count: result.affected_agencies_count }));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    async function restoreVersion(versionId: number) {
        setBusy(true);
        setError(null);
        try {
            const result = await api.post<AppSettings>(`/settings/versions/${versionId}/restore`);
            setForm(fromSettings(result));
            setDraftSavedAt(null);
            await refresh();
            const versionsList = await api.get<AppSettingVersion[]>('/settings/versions');
            setVersions(versionsList);
            setFeedback(t('branding.versions.restored'));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    async function uploadAsset(field: 'logo' | 'favicon', file: File) {
        setUploadingAsset(true);
        setError(null);
        try {
            const data = new FormData();
            data.append(field, file);
            await api.postForm<AppSettings>('/settings', data);
            await refresh();
            if (field === 'logo') setLogoFile(null);
            else setFaviconFile(null);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setUploadingAsset(false);
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
                    <button type="button" onClick={() => void discardDraft()} disabled={!hasPendingDraft || busy} className={button('secondary', 'md', 'h-10')}>
                        <RotateCcw aria-hidden="true" className="h-4 w-4" />
                        {t('branding.reset')}
                    </button>
                    <button type="button" onClick={() => void publish()} disabled={!hasPendingDraft || busy} className={button('primary', 'md', 'h-10')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Send aria-hidden="true" className="h-4 w-4" />}
                        {t('branding.publish.action')}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-ink-200/80 bg-white px-4 py-3 text-sm dark:border-ink-800 dark:bg-ink-900">
                <Eye aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-500 dark:text-ink-350" />
                <p className="min-w-0 flex-1 text-ink-700 dark:text-ink-200">{t('branding.liveHint')}</p>
                {hasPendingDraft ? (
                    <Pill tone="amber">{t('branding.draftSavedAt', { time: dateTime(draftSavedAt!) })}</Pill>
                ) : (
                    <Pill tone="emerald">{t('branding.upToDate')}</Pill>
                )}
            </div>

            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                <div className="min-w-0 space-y-6">
                    <SectionCard id="branding-identity" title={t('branding.identity')} subtitle={t('branding.identityHint')}>
                        <label className="block">
                            <span className={label}>{t('settings.pressingName')}</span>
                            <input value={form.pressing_name ?? ''} onChange={(e) => set('pressing_name', e.target.value)} className={input} aria-describedby="name-help" />
                            <span id="name-help" className="mt-1.5 block text-xs text-ink-600 dark:text-ink-350">
                                {t('branding.nameHelp')}
                            </span>
                        </label>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <ImageField
                                label={t('settings.logo')}
                                hint={t('settings.logoHint')}
                                preview={logoPreview}
                                file={logoFile}
                                busy={uploadingAsset}
                                onChange={(file) => {
                                    setLogoFile(file);
                                    if (file) void uploadAsset('logo', file);
                                }}
                            />
                            <ImageField
                                label={t('settings.favicon')}
                                hint={t('settings.faviconHint')}
                                preview={faviconPreview}
                                file={faviconFile}
                                busy={uploadingAsset}
                                onChange={(file) => {
                                    setFaviconFile(file);
                                    if (file) void uploadAsset('favicon', file);
                                }}
                            />
                        </div>
                        <label className="block">
                            <span className={label}>{t('branding.monogram')}</span>
                            <input value={form.monogram ?? ''} maxLength={4} onChange={(e) => set('monogram', e.target.value.toUpperCase())} className={cx(input, 'w-32 uppercase')} />
                            <span className="mt-1.5 block text-xs text-ink-600 dark:text-ink-350">{t('branding.monogramHint')}</span>
                        </label>
                    </SectionCard>

                    <SectionCard id="branding-palette" title={t('branding.palette.title')} subtitle={t('branding.palette.hint')}>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <ColorField label={t('branding.palette.primary')} value={form.primary_color ?? '#24483F'} onChange={(v) => set('primary_color', v)} />
                            <ColorField label={t('branding.palette.secondary')} value={form.secondary_color ?? '#C8A54B'} onChange={(v) => set('secondary_color', v)} />
                        </div>
                        <p className="text-xs text-ink-600 dark:text-ink-350">
                            {contrastOk ? (
                                <Pill tone="emerald">{t('branding.palette.aaValid', { ratio: contrast.toFixed(1) })}</Pill>
                            ) : (
                                <Pill tone="amber">{t('branding.palette.aaWarning', { ratio: contrast.toFixed(1) })}</Pill>
                            )}
                        </p>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{t('branding.palette.scopeNote')}</p>
                    </SectionCard>

                    <SectionCard id="branding-contacts" title={t('branding.contacts')} subtitle={t('branding.contactsHint')}>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <IconInput icon={Phone} label={t('settings.phone')} value={form.phone ?? ''} onChange={(v) => set('phone', v)} type="tel" />
                            <IconInput icon={Mail} label={t('settings.email')} value={form.email ?? ''} onChange={(v) => set('email', v)} type="email" />
                        </div>
                        <IconInput icon={MapPin} label={t('settings.address')} value={form.address ?? ''} onChange={(v) => set('address', v)} />
                        <IconInput icon={FileText} label={t('settings.taxId')} value={form.tax_id ?? ''} onChange={(v) => set('tax_id', v)} />
                        <IconInput icon={Globe} label={t('branding.domain.website')} value={form.website ?? ''} onChange={(v) => set('website', v)} type="url" />
                        <label className="block">
                            <span className={label}>{t('branding.legalNotice')}</span>
                            <textarea
                                value={form.legal_notice ?? ''}
                                onChange={(e) => set('legal_notice', e.target.value)}
                                rows={2}
                                className={cx(input, 'min-h-0')}
                            />
                        </label>
                    </SectionCard>

                    <SectionCard id="branding-documents" title={t('branding.documents.title')} subtitle={t('branding.documents.hint')}>
                        <label className="block">
                            <span className={label}>{t('branding.documents.ticketFooter')}</span>
                            <input value={form.ticket_footer ?? ''} onChange={(e) => set('ticket_footer', e.target.value)} className={input} />
                        </label>
                        <label className="block">
                            <span className={label}>{t('branding.documents.ticketConditions')}</span>
                            <input value={form.ticket_conditions ?? ''} onChange={(e) => set('ticket_conditions', e.target.value)} className={input} />
                        </label>
                    </SectionCard>

                    <PublishImpactCard />
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
                                    <p className="truncate font-display text-[15px] font-extrabold text-ink-900 dark:text-white">{form.pressing_name || settings?.pressing_name}</p>
                                    <p className="text-[11px] font-medium text-ink-600 dark:text-ink-350">{t('app.tagline')}</p>
                                </div>
                                <span className="ml-auto text-[11px] font-semibold uppercase tracking-wide text-ink-500 dark:text-ink-400">{t('branding.previewApp')}</span>
                            </div>

                            <div className="mx-auto max-w-xs rounded-lg border border-dashed border-ink-300 bg-white p-4 font-mono text-xs text-ink-900 shadow-sm dark:border-ink-600">
                                <div className="flex items-center gap-2 border-b border-ink-900 pb-2">
                                    {logoPreview && <img src={logoPreview} alt="" className="h-8 w-8 object-cover" />}
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-bold">{form.pressing_name || settings?.pressing_name}</p>
                                        {form.address && <p className="truncate">{form.address}</p>}
                                        {(form.phone || form.email) && <p className="truncate">{[form.phone, form.email].filter(Boolean).join(' — ')}</p>}
                                        {form.tax_id && (
                                            <p className="truncate">
                                                {t('settings.taxId')} : {form.tax_id}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                {form.ticket_conditions && <p className="pt-2 text-[11px]">{form.ticket_conditions}</p>}
                                <p className="pt-2 text-center text-[11px] text-ink-600">{form.ticket_footer || t('branding.previewDocument')}</p>
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

                    <SectionCard id="branding-versions" title={t('branding.versions.title')} subtitle={t('branding.versions.hint')}>
                        {versions.length === 0 ? (
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t('branding.versions.none')}</p>
                        ) : (
                            <ul className="space-y-3">
                                {versions.map((v) => (
                                    <li key={v.id} className="flex items-center justify-between gap-3 border-b border-ink-100 pb-2.5 text-sm last:border-0 last:pb-0 dark:border-ink-800">
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-ink-900 dark:text-ink-50">{v.data.pressing_name}</p>
                                            <p className="text-xs text-ink-500 dark:text-ink-400">
                                                {dateTime(v.created_at)} — {v.published_by?.name ?? t('order.audit.systemActor')}
                                                {v.restored_from_version_id && ` · ${t('branding.versions.restoredTag')}`}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => void restoreVersion(v.id)}
                                            disabled={busy}
                                            className={button('ghost', 'sm')}
                                        >
                                            <History aria-hidden="true" className="h-3.5 w-3.5" />
                                            {t('branding.versions.restore')}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </SectionCard>
                </div>
            </div>
        </div>
    );
}

/** Texte informatif statique et honnête (pas de coche par canal fabriquée) : les 4
 * canaux lisent tous la même ligne app_settings, l'affirmation « touche N agences »
 * est donc vraie dès la publication, sans vérification canal par canal possible. */
function PublishImpactCard() {
    const { t } = useI18n();
    const { settings } = useSettings();
    const { date } = useFormat();

    return (
        <SectionCard id="branding-publish-impact" title={t('branding.publish.impactTitle')} subtitle={t('branding.publish.impactHint')}>
            <ul className="space-y-1.5 text-sm text-ink-700 dark:text-ink-200">
                <li className="flex items-center gap-2">
                    <CircleCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
                    {t('branding.publish.channel1')}
                </li>
                <li className="flex items-center gap-2">
                    <ScrollText aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-400" />
                    {t('branding.publish.channel2')}
                </li>
            </ul>
            <p className="text-xs text-ink-500 dark:text-ink-400">{t('branding.publish.versionNote')}</p>
            {settings?.updated_at && <p className="text-xs text-ink-400 dark:text-ink-500">{t('settingsHub.updatedAt', { date: date(settings.updated_at) })}</p>}
        </SectionCard>
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

function ColorField({ label: fieldLabel, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
    return (
        <label className="block">
            <span className={label}>{fieldLabel}</span>
            <span className="flex items-center gap-2">
                <input
                    type="color"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-ink-200/80 dark:border-ink-800"
                />
                <input value={value} onChange={(e) => onChange(e.target.value)} className={cx(input, 'font-mono uppercase')} maxLength={7} />
            </span>
        </label>
    );
}

function ImageField({
    label: fieldLabel,
    hint,
    preview,
    file,
    busy,
    onChange,
}: {
    label: string;
    hint: string;
    preview: string | null;
    file: File | null;
    busy: boolean;
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
                    {busy && <Spinner className="h-3.5 w-3.5" />}
                    {t('branding.choose')}
                    <input type="file" accept="image/*" aria-label={fieldLabel} disabled={busy} onChange={(e) => onChange(e.target.files?.[0] ?? null)} className="sr-only" />
                </label>
            </div>
        </div>
    );
}

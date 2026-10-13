import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowLeft, Award, Banknote, Bell, Building2, Clock, Copy, Download, Inbox, Info, Mail, MessageSquare, PackageCheck, RotateCcw, Save, Send, Truck, WashingMachine, XCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import { hasPermission } from '../lib/permissions';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState } from '../components/ui/Feedback';
import { ChipToggle, SectionCard } from '../components/ui/Metrics';
import StatusBadge, { Pill, TONES } from '../components/ui/StatusBadge';
import Pagination from '../components/ui/Pagination';
import Toggle from '../components/ui/Toggle';
import { button, card, cardPadded, cx, input, label, sectionTitle, textLink } from '../components/ui/styles';
import type { NotificationChannel, NotificationEvent, NotificationLog, NotificationSetting, NotificationTemplate, Paginated } from '../types';

/* Écran « Notifications » (capture Figma, audit du 2026-10-13) : statistiques réelles par
 * canal (30 jours), matrice évènement × canal, éditeur de modèles avec variables et
 * aperçu rendu sur le dernier dépôt réel, envoi de test, horaires silencieux,
 * consentement, vérification de la configuration d'envoi et journal exportable.
 * Omis : passerelle SMS réelle et WhatsApp (aucun fournisseur intégré — les SMS sont
 * simulés et journalisés), taux d'ouverture / rebonds (aucun suivi de lecture). */

const EVENT_ICONS: Record<NotificationEvent, typeof Truck> = {
    order_received: Inbox,
    order_processing: WashingMachine,
    order_ready: Bell,
    order_delayed: Clock,
    pickup_completed: PackageCheck,
    payment_received: Banknote,
    loyalty_points: Award,
    delivery_completed: Truck,
    delivery_failed: XCircle,
};

const EVENTS: NotificationEvent[] = [
    'order_received',
    'order_processing',
    'order_ready',
    'order_delayed',
    'pickup_completed',
    'payment_received',
    'loyalty_points',
    'delivery_completed',
    'delivery_failed',
];

interface NotificationStats {
    period_days: number;
    mail: Partial<Record<string, number>>;
    sms: Partial<Record<string, number>>;
    mail_driver: string | null;
    mail_from: string | null;
}

interface NotificationRules {
    notif_quiet_enabled: boolean;
    notif_quiet_start: string;
    notif_quiet_end: string;
    notif_require_consent: boolean;
    notif_unsubscribe_link: boolean;
}

export default function NotificationsPage() {
    const { user, activeAgencyId, agencies } = useAuth();
    const { t } = useI18n();
    const agencyId = user?.agency_id ?? activeAgencyId;
    const agencyName = user?.agency?.name ?? agencies.find((a) => a.id === agencyId)?.name ?? '—';

    const [settings, setSettings] = useState<NotificationSetting[]>([]);
    const [logs, setLogs] = useState<NotificationLog[]>([]);
    const [logsMeta, setLogsMeta] = useState<Pick<Paginated<NotificationLog>, 'current_page' | 'last_page' | 'total'>>({
        current_page: 1,
        last_page: 1,
        total: 0,
    });
    const [logsPage, setLogsPage] = useState(1);
    const [eventFilter, setEventFilter] = useState<NotificationEvent | ''>('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<NotificationStats | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<NotificationEvent>('order_ready');

    function reload() {
        if (!agencyId) {
            setLoading(false);
            return;
        }
        setError(null);
        const logsParams = new URLSearchParams({ agency_id: String(agencyId), per_page: '20', page: String(logsPage) });
        if (eventFilter) logsParams.set('event', eventFilter);

        Promise.all([
            api.get<NotificationSetting[]>(`/notification-settings?agency_id=${agencyId}`),
            api.get<Paginated<NotificationLog>>(`/notification-logs?${logsParams}`),
            api.get<NotificationStats>(`/notification-stats?agency_id=${agencyId}`),
        ])
            .then(([settingsRes, logsRes, statsRes]) => {
                setStats(statsRes);
                setSettings(settingsRes);
                setLogs(logsRes.data);
                setLogsMeta({ current_page: logsRes.current_page, last_page: logsRes.last_page, total: logsRes.total });
            })
            .catch((err) => setError(err instanceof ApiError ? err.message : t('common.error')))
            .finally(() => setLoading(false));
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(reload, [agencyId, eventFilter, logsPage]);

    function changeEventFilter(next: NotificationEvent | '') {
        setEventFilter(next);
        setLogsPage(1);
    }

    const backLink = hasPermission(user, 'agencies.manage') && (
        <Link to="/settings" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('settingsHub.back')}
        </Link>
    );

    if (!agencyId) {
        return (
            <div className="space-y-6">
                {backLink}
                <PageHeader title={t('notifications.title')} subtitle={t('notifications.subtitle')} icon={Bell} />
                <div className={cardPadded}>
                    <EmptyState icon={Building2} title={t('notifications.selectAgency')} description={t('notifications.selectAgencyHint')} />
                </div>
            </div>
        );
    }

    const emailCount = settings.filter((s) => s.channel_email).length;
    const smsCount = settings.filter((s) => s.channel_sms).length;

    return (
        <div className="space-y-6">
            {backLink}
            <PageHeader
                title={t('notifications.title')}
                subtitle={t('notifications.subtitle')}
                icon={Bell}
                actions={
                    <button type="button" onClick={() => document.getElementById('send-test')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className={button('secondary', 'md', 'h-10')}>
                        <Send aria-hidden="true" className="h-4 w-4" />
                        {t('notifications.test.send')}
                    </button>
                }
            />

            {error && <Alert tone="error">{error}</Alert>}

            {loading ? (
                <LoadingState />
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <ChannelCard
                            icon={MessageSquare}
                            title={t('notifications.card.smsTitle')}
                            description={t('notifications.card.smsHint')}
                            status={{ tone: 'amber', label: t('notifications.card.simulatedMode') }}
                            metrics={[
                                { value: String(stats?.sms.simulated ?? 0), label: t('notifications.card.simulated30') },
                                { value: String(stats?.sms.skipped ?? 0), label: t('notifications.card.skipped') },
                                { value: `${smsCount}/${settings.length}`, label: t('notifications.card.eventsOn') },
                            ]}
                        />
                        <ChannelCard
                            icon={Mail}
                            title={t('notifications.card.emailTitle')}
                            description={stats?.mail_from ? `${stats.mail_driver} · ${stats.mail_from}` : t('notifications.card.emailHint')}
                            status={emailCount > 0 ? { tone: 'emerald', label: t('notifications.card.active') } : { tone: 'neutral', label: t('notifications.card.off') }}
                            metrics={[
                                { value: deliveryRate(stats?.mail), label: t('notifications.card.delivered') },
                                { value: String(stats?.mail.sent ?? 0), label: t('notifications.card.sent30') },
                                { value: String(stats?.mail.failed ?? 0), label: t('notifications.card.failed') },
                            ]}
                        />
                        <div className={cx(cardPadded, 'space-y-2')}>
                            <div className="flex items-start justify-between gap-2">
                                <h2 className={sectionTitle}>{t('notifications.card.future')}</h2>
                                <Pill tone="neutral">{t('notifications.card.toIntegrate')}</Pill>
                            </div>
                            <p className="flex items-start gap-2 text-sm text-ink-600 dark:text-ink-350">
                                <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                                {t('notifications.card.futureHint')}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                        <div className="min-w-0 space-y-6">
                            <EventsMatrix agencyId={agencyId} agencyName={agencyName} settings={settings} onSaved={reload} selected={selectedEvent} onSelect={setSelectedEvent} />
                            <TemplateEditor key={selectedEvent} agencyId={agencyId} event={selectedEvent} onSent={reload} />
                        </div>
                        <div className="min-w-0 space-y-6">
                            <RulesCard agencyId={agencyId} />
                            <ProvidersCard agencyId={agencyId} />
                        </div>
                    </div>

                    <LogsPanel agencyId={agencyId} logs={logs} eventFilter={eventFilter} onEventFilter={changeEventFilter} meta={logsMeta} onPageChange={setLogsPage} />
                </>
            )}
        </div>
    );
}

function deliveryRate(counts?: Partial<Record<string, number>>): string {
    const sent = counts?.sent ?? 0;
    const failed = counts?.failed ?? 0;
    return sent + failed > 0 ? `${Math.round((sent / (sent + failed)) * 1000) / 10} %` : '—';
}

function ChannelCard({
    icon: Icon,
    title,
    description,
    status,
    metrics,
}: {
    icon: typeof Mail;
    title: string;
    description: string;
    status: { tone: 'emerald' | 'amber' | 'neutral'; label: string };
    metrics: { value: string; label: string }[];
}) {
    return (
        <div className={cx(cardPadded, 'space-y-4')}>
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                    <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', TONES.brand)}>
                        <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0">
                        <h2 className={sectionTitle}>{title}</h2>
                        <p className="truncate text-xs text-ink-600 dark:text-ink-350">{description}</p>
                    </div>
                </div>
                <Pill tone={status.tone}>{status.label}</Pill>
            </div>
            <dl className="grid grid-cols-3 gap-2 text-center">
                {metrics.map((m) => (
                    <div key={m.label}>
                        <dd className="font-display text-lg font-bold tabular-nums text-ink-900 dark:text-white">{m.value}</dd>
                        <dt className="text-[11px] text-ink-600 dark:text-ink-350">{m.label}</dt>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function TemplateEditor({ agencyId, event, onSent }: { agencyId: number; event: NotificationEvent; onSent: () => void }) {
    const { t } = useI18n();
    const [channel, setChannel] = useState<NotificationChannel>('sms');
    const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
    const [variables, setVariables] = useState<string[]>([]);
    const [name, setName] = useState('');
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [preview, setPreview] = useState<{ subject: string; body: string; length: number; sms_segments: number } | null>(null);
    const [recipient, setRecipient] = useState('');
    const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
    const bodyRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        api.get<{ templates: NotificationTemplate[]; variables: string[] }>(`/notification-templates?agency_id=${agencyId}`).then((res) => {
            setTemplates(res.templates);
            setVariables(res.variables);
        });
    }, [agencyId]);

    const current = templates.find((tpl) => tpl.event === event && tpl.channel === channel);

    useEffect(() => {
        if (!current) return;
        setName(current.name);
        setSubject(current.subject ?? '');
        setBody(current.body);
    }, [current]);

    useEffect(() => {
        if (!body) return;
        const timeout = setTimeout(() => {
            api.post<typeof preview>(`/notification-templates/preview?agency_id=${agencyId}`, { body, subject })
                .then(setPreview)
                .catch(() => setPreview(null));
        }, 400);
        return () => clearTimeout(timeout);
    }, [body, subject, agencyId]);

    function insertVariable(variable: string) {
        const el = bodyRef.current;
        const token = `{{${variable}}}`;
        if (!el) return setBody(body + token);
        const start = el.selectionStart ?? body.length;
        setBody(body.slice(0, start) + token + body.slice(el.selectionEnd ?? start));
    }

    async function act(action: () => Promise<void>, success: string) {
        setMessage(null);
        try {
            await action();
            setMessage({ tone: 'success', text: success });
        } catch (err) {
            setMessage({ tone: 'error', text: err instanceof ApiError ? err.message : t('common.error') });
        }
    }

    async function save() {
        const saved = await api.put<NotificationTemplate>(`/notification-templates?agency_id=${agencyId}`, { event, channel, name, subject: channel === 'mail' ? subject : null, body });
        setTemplates((list) => list.map((tpl) => (tpl.event === event && tpl.channel === channel ? saved : tpl)));
    }

    async function reset() {
        const restored = await api.delete<NotificationTemplate>(`/notification-templates?agency_id=${agencyId}&event=${event}&channel=${channel}`);
        setTemplates((list) => list.map((tpl) => (tpl.event === event && tpl.channel === channel ? restored : tpl)));
    }

    return (
        <SectionCard
            id="notification-template"
            title={t('notifications.template.title', { event: t(`notifications.event.${event}`) })}
            subtitle={current?.is_custom ? t('notifications.template.custom') : t('notifications.template.default')}
            headerExtra={
                <div className="flex gap-1">
                    {(['sms', 'mail'] as NotificationChannel[]).map((c) => (
                        <ChipToggle key={c} active={channel === c} onClick={() => setChannel(c)}>
                            {c === 'sms' ? t('notifications.channelSms') : t('notifications.channelEmail')}
                        </ChipToggle>
                    ))}
                </div>
            }
        >
            {message && <Alert tone={message.tone}>{message.text}</Alert>}
            <label className="block">
                <span className={label}>{t('notifications.template.name')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </label>
            {channel === 'mail' && (
                <label className="block">
                    <span className={label}>{t('notifications.template.subject')}</span>
                    <input value={subject} onChange={(e) => setSubject(e.target.value)} className={input} />
                </label>
            )}
            <label className="block">
                <span className={label}>{t('notifications.template.message')}</span>
                <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={cx(input, 'h-auto py-2.5')} />
            </label>
            {preview && channel === 'sms' && (
                <p className="text-xs text-ink-600 dark:text-ink-350">{t('notifications.template.length', { length: preview.length, segments: preview.sms_segments })}</p>
            )}
            <div>
                <p className="mb-1.5 text-xs font-semibold text-ink-600 dark:text-ink-350">{t('notifications.template.variables')}</p>
                <div className="flex flex-wrap gap-1.5">
                    {variables.map((v) => (
                        <button key={v} type="button" onClick={() => insertVariable(v)} className="rounded-full bg-brand-50 px-2.5 py-1 font-mono text-[11px] font-semibold text-brand-800 hover:bg-brand-100 dark:bg-brand-400/10 dark:text-brand-200">
                            {`{{${v}}}`}
                        </button>
                    ))}
                </div>
            </div>
            {preview && (
                <div className="rounded-2xl bg-ink-100 p-4 dark:bg-ink-950/60">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{t('notifications.template.preview')}</p>
                    <div className="max-w-sm rounded-xl bg-white p-3 text-sm text-ink-800 shadow-sm dark:bg-ink-800 dark:text-ink-100">
                        {channel === 'mail' && preview.subject && <p className="mb-1 font-semibold">{preview.subject}</p>}
                        <p className="whitespace-pre-line">{preview.body}</p>
                    </div>
                </div>
            )}
            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void act(save, t('notifications.template.saved'))} disabled={!body.trim() || !name.trim()} className={button('primary', 'sm')}>
                    <Save aria-hidden="true" className="h-4 w-4" />
                    {t('notifications.template.save')}
                </button>
                {current?.is_custom && (
                    <button type="button" onClick={() => void act(reset, t('notifications.template.resetDone'))} className={button('secondary', 'sm')}>
                        <RotateCcw aria-hidden="true" className="h-4 w-4" />
                        {t('notifications.template.reset')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => {
                        const other: NotificationChannel = channel === 'sms' ? 'mail' : 'sms';
                        setChannel(other);
                        setTimeout(() => setBody(body), 0);
                    }}
                    className={button('ghost', 'sm')}
                >
                    <Copy aria-hidden="true" className="h-4 w-4" />
                    {t('notifications.template.duplicate')}
                </button>
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-ink-200/80 pt-4 dark:border-ink-800">
                <label className="block min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className={label}>{channel === 'mail' ? t('notifications.test.email') : t('notifications.test.phone')}</span>
                    <input value={recipient} onChange={(e) => setRecipient(e.target.value)} className={input} />
                </label>
                <button
                    type="button"
                    id="send-test"
                    disabled={!recipient.trim() || !body.trim()}
                    onClick={() =>
                        void act(async () => {
                            await api.post(`/notifications/test?agency_id=${agencyId}`, { event, channel, recipient, subject: channel === 'mail' ? subject : null, body });
                            onSent();
                        }, channel === 'mail' ? t('notifications.test.sent') : t('notifications.test.simulated'))
                    }
                    className={button('secondary', 'md')}
                >
                    <Send aria-hidden="true" className="h-4 w-4" />
                    {t('notifications.test.send')}
                </button>
            </div>
        </SectionCard>
    );
}

function RulesCard({ agencyId }: { agencyId: number }) {
    const { t } = useI18n();
    const [rules, setRules] = useState<NotificationRules | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        api.get<NotificationRules>(`/notification-rules?agency_id=${agencyId}`).then(setRules).catch(() => setRules(null));
    }, [agencyId]);

    async function update(patch: Partial<NotificationRules>) {
        if (!rules) return;
        setError(null);
        const next = { ...rules, ...patch };
        setRules(next);
        try {
            await api.patch(`/notification-rules?agency_id=${agencyId}`, patch);
        } catch (err) {
            setRules(rules);
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    if (!rules) return null;

    return (
        <>
            <SectionCard id="notification-quiet" title={t('notifications.quiet.title')} subtitle={t('notifications.quiet.subtitle')}>
                {error && <Alert tone="error">{error}</Alert>}
                <Toggle checked={rules.notif_quiet_enabled} onChange={(v) => void update({ notif_quiet_enabled: v })} label={t('notifications.quiet.enable')} />
                <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                        <span className={label}>{t('notifications.quiet.start')}</span>
                        <input type="time" value={rules.notif_quiet_start} onChange={(e) => void update({ notif_quiet_start: e.target.value })} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('notifications.quiet.end')}</span>
                        <input type="time" value={rules.notif_quiet_end} onChange={(e) => void update({ notif_quiet_end: e.target.value })} className={input} />
                    </label>
                </div>
                <p className="text-xs text-ink-600 dark:text-ink-350">{t('notifications.quiet.hint')}</p>
            </SectionCard>
            <SectionCard id="notification-consent" title={t('notifications.consent.title')}>
                <Toggle checked={rules.notif_require_consent} onChange={(v) => void update({ notif_require_consent: v })} label={t('notifications.consent.require')} description={t('notifications.consent.requireHint')} />
                <Toggle checked={rules.notif_unsubscribe_link} onChange={(v) => void update({ notif_unsubscribe_link: v })} label={t('notifications.consent.unsubscribe')} description={t('notifications.consent.unsubscribeHint')} />
                <p className="flex items-start gap-2 text-xs text-ink-600 dark:text-ink-350">
                    <Info aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {t('notifications.consent.proofs')}
                </p>
            </SectionCard>
        </>
    );
}

function ProvidersCard({ agencyId }: { agencyId: number }) {
    const { t } = useI18n();
    const [result, setResult] = useState<{ mail: { ok: boolean; driver: string | null; from: string | null; delivers: boolean }; sms: { ok: boolean } } | null>(null);
    const [checking, setChecking] = useState(false);

    async function check() {
        setChecking(true);
        try {
            setResult(await api.post(`/notification-config/check?agency_id=${agencyId}`));
        } finally {
            setChecking(false);
        }
    }

    return (
        <SectionCard id="notification-providers" title={t('notifications.providers.title')}>
            <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                    <dt className="text-ink-600 dark:text-ink-350">{t('notifications.channelSms')}</dt>
                    <dd className="font-semibold text-ink-900 dark:text-white">{t('notifications.providers.smsNone')}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-ink-600 dark:text-ink-350">{t('notifications.channelEmail')}</dt>
                    <dd className="truncate font-semibold text-ink-900 dark:text-white">{result ? `${result.mail.driver ?? '—'} · ${result.mail.from ?? '—'}` : '—'}</dd>
                </div>
            </dl>
            {result && (
                <Alert tone={result.mail.ok && result.mail.delivers ? 'success' : 'warning'}>
                    {result.mail.ok && result.mail.delivers ? t('notifications.providers.mailOk') : t('notifications.providers.mailLogOnly')}
                </Alert>
            )}
            <button type="button" onClick={() => void check()} disabled={checking} className={button('secondary', 'sm', 'self-start')}>
                <Activity aria-hidden="true" className="h-4 w-4" />
                {t('notifications.providers.check')}
            </button>
        </SectionCard>
    );
}

function EventsMatrix({
    agencyId,
    agencyName,
    settings,
    onSaved,
    selected,
    onSelect,
}: {
    agencyId: number;
    agencyName: string;
    settings: NotificationSetting[];
    onSaved: () => void;
    selected: NotificationEvent;
    onSelect: (event: NotificationEvent) => void;
}) {
    const { t } = useI18n();
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    async function toggle(setting: NotificationSetting, field: 'channel_email' | 'channel_sms') {
        const key = `${setting.event}-${field}`;
        setBusyKey(key);
        setError(null);
        setFeedback(null);
        try {
            await api.post('/notification-settings', {
                agency_id: agencyId,
                event: setting.event,
                channel_email: field === 'channel_email' ? !setting.channel_email : setting.channel_email,
                channel_sms: field === 'channel_sms' ? !setting.channel_sms : setting.channel_sms,
            });
            setFeedback(t('notifications.saved'));
            onSaved();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusyKey(null);
        }
    }

    return (
        <SectionCard
            id="notification-settings-heading"
            flush
            title={t('notifications.settings')}
            subtitle={t('notifications.settingsHint')}
            headerExtra={
                <Pill tone="neutral" icon={Building2}>
                    {agencyName}
                </Pill>
            }
        >
            {(error || feedback) && (
                <div className="px-5 pb-3 sm:px-6">
                    {error && <Alert tone="error">{error}</Alert>}
                    {feedback && <Alert tone="success">{feedback}</Alert>}
                </div>
            )}
            <div className="relative overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="border-y border-ink-200/80 bg-ink-50 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                        <tr>
                            <th scope="col" className="px-5 py-2.5 sm:px-6">{t('notifications.event')}</th>
                            <th scope="col" className="w-28 px-4 py-2.5 text-center">{t('notifications.channelSms')}</th>
                            <th scope="col" className="w-28 px-4 py-2.5 text-center">{t('notifications.channelEmail')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                        {settings.map((setting) => {
                            const Icon = EVENT_ICONS[setting.event];
                            const eventLabel = t(`notifications.event.${setting.event}`);
                            return (
                                <tr key={setting.event} className={cx(selected === setting.event && 'bg-brand-50/60 dark:bg-brand-400/5')}>
                                    <td className="px-5 py-3 sm:px-6">
                                        <button type="button" onClick={() => onSelect(setting.event)} className="flex items-center gap-3 text-left" aria-label={t('notifications.template.edit', { event: eventLabel })}>
                                            <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', TONES.brand)}>
                                                <Icon aria-hidden="true" className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-ink-900 dark:text-ink-50">{eventLabel}</p>
                                                <p className="text-xs text-ink-600 dark:text-ink-350">{t(`notifications.eventHint.${setting.event}`)}</p>
                                            </div>
                                        </button>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-center">
                                            <Toggle
                                                checked={setting.channel_sms}
                                                disabled={busyKey !== null}
                                                onChange={() => void toggle(setting, 'channel_sms')}
                                                label={<span className="sr-only">{`${t('notifications.channelSms')} — ${eventLabel}`}</span>}
                                            />
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex justify-center">
                                            <Toggle
                                                checked={setting.channel_email}
                                                disabled={busyKey !== null}
                                                onChange={() => void toggle(setting, 'channel_email')}
                                                label={<span className="sr-only">{`${t('notifications.channelEmail')} — ${eventLabel}`}</span>}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </SectionCard>
    );
}

function LogsPanel({
    agencyId,
    logs,
    eventFilter,
    onEventFilter,
    meta,
    onPageChange,
}: {
    agencyId: number;
    logs: NotificationLog[];
    eventFilter: NotificationEvent | '';
    onEventFilter: (event: NotificationEvent | '') => void;
    meta: Pick<Paginated<NotificationLog>, 'current_page' | 'last_page' | 'total'>;
    onPageChange: (page: number) => void;
}) {
    const { t } = useI18n();
    const { dateTime } = useFormat();

    return (
        <section aria-labelledby="notification-logs-heading" className={cx(card, 'overflow-hidden')}>
            <div className="space-y-3 px-5 pb-3 pt-5 sm:px-6 sm:pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 id="notification-logs-heading" className={sectionTitle}>
                            {t('notifications.history')}
                        </h2>
                        <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('notifications.historyHint')}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            void api.blob(`/notification-logs/export?agency_id=${agencyId}${eventFilter ? `&event=${eventFilter}` : ''}`).then((blob) => {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = 'notifications.csv';
                                a.click();
                                URL.revokeObjectURL(url);
                            })
                        }
                        className={button('secondary', 'sm')}
                    >
                        <Download aria-hidden="true" className="h-4 w-4" />
                        {t('notifications.exportLogs')}
                    </button>
                </div>
                <div role="group" aria-label={t('notifications.event')} className="scrollbar-none -mx-5 flex gap-2 overflow-x-auto px-5 sm:mx-0 sm:flex-wrap sm:px-0">
                    <ChipToggle active={eventFilter === ''} onClick={() => onEventFilter('')}>
                        {t('notifications.all')}
                    </ChipToggle>
                    {EVENTS.map((event) => (
                        <ChipToggle key={event} active={eventFilter === event} onClick={() => onEventFilter(event)}>
                            {t(`notifications.event.${event}`)}
                        </ChipToggle>
                    ))}
                </div>
            </div>

            {logs.length === 0 ? (
                <EmptyState compact icon={MessageSquare} title={t('notifications.noLogs')} />
            ) : (
                <div className="relative overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-sm">
                        <thead className="border-y border-ink-200/80 bg-ink-50 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:border-ink-800 dark:bg-ink-950/40 dark:text-ink-400">
                            <tr>
                                <th scope="col" className="px-5 py-2.5 sm:px-6">{t('notifications.event')}</th>
                                <th scope="col" className="px-4 py-2.5">{t('notifications.channel')}</th>
                                <th scope="col" className="px-4 py-2.5">{t('notifications.recipient')}</th>
                                <th scope="col" className="px-4 py-2.5">{t('common.date')}</th>
                                <th scope="col" className="px-5 py-2.5 sm:px-6">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td className="px-5 py-3 font-medium text-ink-900 sm:px-6 dark:text-ink-50">{t(`notifications.event.${log.event}`)}</td>
                                    <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                                        <span className="inline-flex items-center gap-1.5">
                                            {log.channel === 'mail' ? (
                                                <Mail aria-hidden="true" className="h-4 w-4 text-ink-500" />
                                            ) : (
                                                <MessageSquare aria-hidden="true" className="h-4 w-4 text-ink-500" />
                                            )}
                                            {log.channel === 'mail' ? t('notifications.channelEmail') : t('notifications.channelSms')}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-ink-600 dark:text-ink-350">{log.recipient}</td>
                                    <td className="whitespace-nowrap px-4 py-3 text-ink-600 dark:text-ink-350">{dateTime(log.sent_at)}</td>
                                    <td className="px-5 py-3 sm:px-6">
                                        <StatusBadge kind="notification" status={log.status} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <Pagination meta={meta} onPageChange={onPageChange} />
        </section>
    );
}

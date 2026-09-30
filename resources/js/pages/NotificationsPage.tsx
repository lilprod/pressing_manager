import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, Building2, Info, Mail, MessageSquare, Truck, XCircle } from 'lucide-react';
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
import { card, cardPadded, cx, sectionTitle, textLink } from '../components/ui/styles';
import type { NotificationEvent, NotificationLog, NotificationSetting, Paginated } from '../types';

/* Écran « Notifications » (Figma SPARK PRESSING, section 09, node 72:21413) : état des
 * canaux, matrice évènement × canal (réglages par agence) et journal des envois.
 * Omis faute de backend (voir CLAUDE.md §2) : envoi de test, éditeur de modèles de
 * message et variables, aperçu SMS, heures calmes, options d'envoi, configuration du
 * fournisseur SMS, mesures agrégées par canal, export du journal, 4 évènements
 * supplémentaires de la maquette. */

const EVENT_ICONS: Record<NotificationEvent, typeof Truck> = {
    order_ready: Bell,
    delivery_completed: Truck,
    delivery_failed: XCircle,
};

const EVENTS: NotificationEvent[] = ['order_ready', 'delivery_completed', 'delivery_failed'];

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
        ])
            .then(([settingsRes, logsRes]) => {
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
            <PageHeader title={t('notifications.title')} subtitle={t('notifications.subtitle')} icon={Bell} />

            {error && <Alert tone="error">{error}</Alert>}

            {loading ? (
                <LoadingState />
            ) : (
                <>
                    <div className="grid gap-4 md:grid-cols-3">
                        <ChannelCard
                            icon={Mail}
                            title={t('notifications.channelEmail')}
                            description={t('notifications.card.emailHint')}
                            status={emailCount > 0 ? { tone: 'emerald', label: t('notifications.card.active') } : { tone: 'neutral', label: t('notifications.card.off') }}
                            value={`${emailCount}/${settings.length}`}
                            valueLabel={t('notifications.card.eventsOn')}
                        />
                        <ChannelCard
                            icon={MessageSquare}
                            title={t('notifications.channelSms')}
                            description={t('notifications.card.smsHint')}
                            status={smsCount > 0 ? { tone: 'amber', label: t('notifications.status.simulated') } : { tone: 'neutral', label: t('notifications.card.off') }}
                            value={`${smsCount}/${settings.length}`}
                            valueLabel={t('notifications.card.eventsOn')}
                        />
                        <div className={cx(cardPadded, 'space-y-2')}>
                            <div className="flex items-start justify-between gap-2">
                                <h2 className={sectionTitle}>{t('notifications.card.gateway')}</h2>
                                <Pill tone="amber">{t('notifications.card.notConnected')}</Pill>
                            </div>
                            <p className="flex items-start gap-2 text-sm text-ink-600 dark:text-ink-350">
                                <Info aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                                {t('notifications.smsNote')}
                            </p>
                        </div>
                    </div>

                    <EventsMatrix agencyId={agencyId} agencyName={agencyName} settings={settings} onSaved={reload} />

                    <LogsPanel logs={logs} eventFilter={eventFilter} onEventFilter={changeEventFilter} meta={logsMeta} onPageChange={setLogsPage} />
                </>
            )}
        </div>
    );
}

function ChannelCard({
    icon: Icon,
    title,
    description,
    status,
    value,
    valueLabel,
}: {
    icon: typeof Mail;
    title: string;
    description: string;
    status: { tone: 'emerald' | 'amber' | 'neutral'; label: string };
    value: string;
    valueLabel: string;
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
                        <p className="text-xs text-ink-600 dark:text-ink-350">{description}</p>
                    </div>
                </div>
                <Pill tone={status.tone}>{status.label}</Pill>
            </div>
            <div>
                <p className="font-display text-2xl font-bold tabular-nums text-ink-900 dark:text-white">{value}</p>
                <p className="text-xs text-ink-600 dark:text-ink-350">{valueLabel}</p>
            </div>
        </div>
    );
}

function EventsMatrix({
    agencyId,
    agencyName,
    settings,
    onSaved,
}: {
    agencyId: number;
    agencyName: string;
    settings: NotificationSetting[];
    onSaved: () => void;
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
            <div className="overflow-x-auto">
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
                                <tr key={setting.event}>
                                    <td className="px-5 py-3 sm:px-6">
                                        <div className="flex items-center gap-3">
                                            <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset', TONES.brand)}>
                                                <Icon aria-hidden="true" className="h-4 w-4" />
                                            </span>
                                            <div className="min-w-0">
                                                <p className="font-semibold text-ink-900 dark:text-ink-50">{eventLabel}</p>
                                                <p className="text-xs text-ink-600 dark:text-ink-350">{t(`notifications.eventHint.${setting.event}`)}</p>
                                            </div>
                                        </div>
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
    logs,
    eventFilter,
    onEventFilter,
    meta,
    onPageChange,
}: {
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
                <div>
                    <h2 id="notification-logs-heading" className={sectionTitle}>
                        {t('notifications.history')}
                    </h2>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('notifications.historyHint')}</p>
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
                <div className="overflow-x-auto">
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

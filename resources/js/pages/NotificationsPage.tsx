import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState } from '../components/ui/Feedback';
import StatusBadge from '../components/ui/StatusBadge';
import Pagination from '../components/ui/Pagination';
import { card, cardPadded, cx, sectionTitle } from '../components/ui/styles';
import { Bell, Building2, Info, Mail, MessageSquare, Truck, XCircle } from 'lucide-react';
import type { NotificationEvent, NotificationLog, NotificationSetting, Paginated } from '../types';

const EVENT_ICONS: Record<NotificationEvent, typeof Truck> = {
    order_ready: Bell,
    delivery_completed: Truck,
    delivery_failed: XCircle,
};

export default function NotificationsPage() {
    const { user, activeAgencyId } = useAuth();
    const { t } = useI18n();
    const agencyId = user?.agency_id ?? activeAgencyId;

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
        setLoading(true);
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

    useEffect(reload, [agencyId, eventFilter, logsPage]);

    function changeEventFilter(next: NotificationEvent | '') {
        setEventFilter(next);
        setLogsPage(1);
    }

    if (!agencyId) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('notifications.title')} subtitle={t('notifications.subtitle')} icon={Bell} />
                <div className={cardPadded}>
                    <EmptyState icon={Building2} title={t('notifications.selectAgency')} description={t('notifications.selectAgencyHint')} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader title={t('notifications.title')} subtitle={t('notifications.subtitle')} icon={Bell} />

            {error && <Alert tone="error">{error}</Alert>}

            {loading ? (
                <LoadingState />
            ) : (
                <>
                    <SettingsPanel agencyId={agencyId} settings={settings} onSaved={reload} />
                    <LogsPanel logs={logs} eventFilter={eventFilter} onEventFilter={changeEventFilter} meta={logsMeta} onPageChange={setLogsPage} />
                </>
            )}
        </div>
    );
}

function SettingsPanel({
    agencyId,
    settings,
    onSaved,
}: {
    agencyId: number;
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
        <section aria-labelledby="notification-settings-heading" className={cx(cardPadded, 'space-y-4')}>
            <h2 id="notification-settings-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                <Bell aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('notifications.settings')}
            </h2>

            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {settings.map((setting) => {
                    const Icon = EVENT_ICONS[setting.event];
                    return (
                        <li key={setting.event} className="flex flex-wrap items-center justify-between gap-3 py-3">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/20">
                                    <Icon aria-hidden="true" className="h-4 w-4" />
                                </span>
                                <span className="font-medium text-ink-900 dark:text-ink-50">{t(`notifications.event.${setting.event}`)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <ChannelToggle
                                    icon={Mail}
                                    label={t('notifications.channelEmail')}
                                    active={setting.channel_email}
                                    busy={busyKey === `${setting.event}-channel_email`}
                                    onClick={() => void toggle(setting, 'channel_email')}
                                />
                                <ChannelToggle
                                    icon={MessageSquare}
                                    label={t('notifications.channelSms')}
                                    active={setting.channel_sms}
                                    busy={busyKey === `${setting.event}-channel_sms`}
                                    onClick={() => void toggle(setting, 'channel_sms')}
                                />
                            </div>
                        </li>
                    );
                })}
            </ul>

            <p className="flex items-start gap-2 rounded-xl bg-ink-50 px-3.5 py-3 text-xs text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">
                <Info aria-hidden="true" className="mt-px h-4 w-4 shrink-0" />
                {t('notifications.smsNote')}
            </p>
        </section>
    );
}

function ChannelToggle({
    icon: Icon,
    label,
    active,
    busy,
    onClick,
}: {
    icon: typeof Mail;
    label: string;
    active: boolean;
    busy: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            aria-pressed={active}
            disabled={busy}
            onClick={onClick}
            className={cx(
                'inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition duration-150 disabled:opacity-60',
                active
                    ? 'bg-brand-600 text-white dark:bg-brand-400 dark:text-ink-950'
                    : 'bg-ink-100 text-ink-600 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700',
            )}
        >
            <Icon aria-hidden="true" className="h-3.5 w-3.5" />
            {label}
        </button>
    );
}

const EVENTS: NotificationEvent[] = ['order_ready', 'delivery_completed', 'delivery_failed'];

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

    const filterClass = (active: boolean) =>
        cx(
            'inline-flex h-8 shrink-0 items-center rounded-full px-3 text-xs font-semibold transition duration-150',
            active
                ? 'bg-ink-900 text-white dark:bg-white dark:text-ink-950'
                : 'bg-ink-100 text-ink-700 hover:bg-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:hover:bg-ink-700',
        );

    return (
        <section aria-labelledby="notification-logs-heading" className={cx(card, 'overflow-hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-5">
                <h2 id="notification-logs-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                    <MessageSquare aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                    {t('notifications.history')}
                </h2>
            </div>

            <div className="scrollbar-none flex gap-2 overflow-x-auto px-5 pb-3">
                <button type="button" onClick={() => onEventFilter('')} className={filterClass(eventFilter === '')}>
                    {t('notifications.all')}
                </button>
                {EVENTS.map((event) => (
                    <button key={event} type="button" onClick={() => onEventFilter(event)} className={filterClass(eventFilter === event)}>
                        {t(`notifications.event.${event}`)}
                    </button>
                ))}
            </div>

            {logs.length === 0 ? (
                <EmptyState compact icon={MessageSquare} title={t('notifications.noLogs')} />
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-ink-50 text-xs uppercase tracking-wider text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">
                            <tr>
                                <th scope="col" className="px-5 py-2.5 font-semibold">{t('notifications.event')}</th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">{t('notifications.recipient')}</th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">{t('common.date')}</th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td className="px-5 py-2.5 text-ink-900 dark:text-ink-50">
                                        <div className="flex items-center gap-2">
                                            {log.channel === 'mail' ? (
                                                <Mail aria-hidden="true" className="h-4 w-4 text-ink-500" />
                                            ) : (
                                                <MessageSquare aria-hidden="true" className="h-4 w-4 text-ink-500" />
                                            )}
                                            <span className="font-medium">{t(`notifications.event.${log.event}`)}</span>
                                        </div>
                                    </td>
                                    <td className="px-5 py-2.5 text-ink-600 dark:text-ink-350">{log.recipient}</td>
                                    <td className="px-5 py-2.5 text-ink-600 dark:text-ink-350">{dateTime(log.sent_at)}</td>
                                    <td className="px-5 py-2.5">
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

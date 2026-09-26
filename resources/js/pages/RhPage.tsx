import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { useFormat } from '../lib/format';
import { api, ApiError } from '../lib/api';
import { hasPermission } from '../lib/permissions';
import PageHeader from '../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState } from '../components/ui/Feedback';
import StatusBadge from '../components/ui/StatusBadge';
import { button, card, cardPadded, cx, input, label, select, sectionTitle } from '../components/ui/styles';
import { Building2, CalendarClock, Clock, LogIn, LogOut, Plus, TrendingUp, Users } from 'lucide-react';
import type { Attendance, PerformanceRow, Shift, User } from '../types';

function toLocalDatetimeInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toDateInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function RhPage() {
    const { user, activeAgencyId } = useAuth();
    const { t } = useI18n();
    const agencyId = user?.agency_id ?? activeAgencyId;
    const canManage = hasPermission(user, 'hr.manage');
    const canClock = hasPermission(user, 'hr.clock');
    // Un utilisateur local a une agence imposée côté API (champ "prohibited") ; seul un
    // rôle global (agency_id null) doit préciser l'agence visée dans le corps de la requête.
    const requestAgencyId = user?.agency_id ? undefined : (agencyId ?? undefined);

    const [shifts, setShifts] = useState<Shift[]>([]);
    const [attendances, setAttendances] = useState<Attendance[]>([]);
    const [staff, setStaff] = useState<User[]>([]);
    const [performance, setPerformance] = useState<PerformanceRow[]>([]);
    const [from, setFrom] = useState(() => toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
    const [to, setTo] = useState(() => toDateInputValue(new Date()));
    const [loading, setLoading] = useState(true);

    function reload() {
        if (!agencyId) {
            setLoading(false);
            return;
        }
        setLoading(true);
        const today = toDateInputValue(new Date());
        Promise.all([
            api.get<Shift[]>(`/shifts?agency_id=${agencyId}`),
            api.get<Attendance[]>(`/attendances?agency_id=${agencyId}&date=${today}`),
            canManage ? api.get<User[]>(`/users?agency_id=${agencyId}`) : Promise.resolve<User[]>([]),
            canManage
                ? api.get<PerformanceRow[]>(`/hr/performance?agency_id=${agencyId}&from=${from}&to=${to}`)
                : Promise.resolve<PerformanceRow[]>([]),
        ])
            .then(([shiftsRes, attendancesRes, staffRes, performanceRes]) => {
                setShifts(shiftsRes);
                setAttendances(attendancesRes);
                setStaff(staffRes);
                setPerformance(performanceRes);
            })
            .finally(() => setLoading(false));
    }

    useEffect(reload, [agencyId, canManage, from, to]);

    if (!agencyId) {
        return (
            <div className="space-y-6">
                <PageHeader title={t('hr.title')} subtitle={t('hr.subtitle')} icon={Users} />
                <div className={cardPadded}>
                    <EmptyState icon={Building2} title={t('hr.selectAgency')} description={t('hr.selectAgencyHint')} />
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader title={t('hr.title')} subtitle={t('hr.subtitle')} icon={Users} />

            {loading ? (
                <LoadingState />
            ) : (
                <>
                    {canClock && (
                        <ClockCard
                            attendances={attendances}
                            currentUserId={user?.id ?? null}
                            requestAgencyId={requestAgencyId}
                            onChanged={reload}
                        />
                    )}

                    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                        <PlanningPanel shifts={shifts} />
                        {canManage && <NewShiftPanel staff={staff} requestAgencyId={requestAgencyId} onCreated={reload} />}
                    </div>

                    {canManage && (
                        <PerformancePanel rows={performance} from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
                    )}
                </>
            )}
        </div>
    );
}

function ClockCard({
    attendances,
    currentUserId,
    requestAgencyId,
    onChanged,
}: {
    attendances: Attendance[];
    currentUserId: number | null;
    requestAgencyId: number | undefined;
    onChanged: () => void;
}) {
    const { t } = useI18n();
    const { dateTime } = useFormat();
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const open = attendances.find((a) => a.user_id === currentUserId && a.clock_in && !a.clock_out) ?? null;

    async function clockIn() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/attendances/clock-in', requestAgencyId ? { agency_id: requestAgencyId } : undefined);
            onChanged();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    async function clockOut() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/attendances/clock-out');
            onChanged();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section aria-labelledby="clock-card-heading" className={cx(cardPadded, 'flex flex-wrap items-center justify-between gap-4')}>
            <div>
                <h2 id="clock-card-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                    <Clock aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                    {t('hr.clockCard')}
                </h2>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-350">
                    {open ? t('hr.clockedIn', { time: dateTime(open.clock_in) }) : t('hr.clockedOut')}
                </p>
                {error && (
                    <div className="mt-2">
                        <Alert tone="error">{error}</Alert>
                    </div>
                )}
            </div>

            {open ? (
                <button type="button" disabled={busy} onClick={() => void clockOut()} className={button('secondary', 'md')}>
                    <LogOut aria-hidden="true" className="h-4 w-4" />
                    {t('hr.clockOut')}
                </button>
            ) : (
                <button type="button" disabled={busy} onClick={() => void clockIn()} className={button('primary', 'md')}>
                    <LogIn aria-hidden="true" className="h-4 w-4" />
                    {t('hr.clockIn')}
                </button>
            )}
        </section>
    );
}

function PlanningPanel({ shifts }: { shifts: Shift[] }) {
    const { t } = useI18n();
    const { dateTime } = useFormat();

    return (
        <section aria-labelledby="planning-heading" className={cx(card, 'overflow-hidden')}>
            <h2 id="planning-heading" className={cx(sectionTitle, 'flex items-center gap-2 px-5 pb-3 pt-5')}>
                <CalendarClock aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('hr.planning')}
            </h2>

            {shifts.length === 0 ? (
                <EmptyState compact icon={CalendarClock} title={t('hr.noShifts')} />
            ) : (
                <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                    {shifts.map((shift) => (
                        <li key={shift.id} className="flex items-center justify-between gap-3 px-5 py-3">
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{shift.user?.name ?? `#${shift.user_id}`}</p>
                                <p className="text-xs text-ink-600 dark:text-ink-350">
                                    {dateTime(shift.starts_at)} — {dateTime(shift.ends_at)}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function NewShiftPanel({
    staff,
    requestAgencyId,
    onCreated,
}: {
    staff: User[];
    requestAgencyId: number | undefined;
    onCreated: () => void;
}) {
    const { t } = useI18n();
    const [userId, setUserId] = useState<number | ''>('');
    const [startsAt, setStartsAt] = useState(() => toLocalDatetimeInputValue(new Date(new Date().setHours(8, 0, 0, 0))));
    const [endsAt, setEndsAt] = useState(() => toLocalDatetimeInputValue(new Date(new Date().setHours(16, 0, 0, 0))));
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit() {
        if (!userId) return;
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            await api.post('/shifts', {
                agency_id: requestAgencyId,
                user_id: userId,
                starts_at: startsAt,
                ends_at: endsAt,
            });
            setFeedback(t('hr.created'));
            setUserId('');
            onCreated();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <section aria-labelledby="new-shift-heading" className={cx(cardPadded, 'space-y-4')}>
            <h2 id="new-shift-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                <CalendarClock aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {t('hr.newShift')}
            </h2>

            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <label className="block">
                <span className={label}>{t('hr.employee')}</span>
                <select value={userId} onChange={(e) => setUserId(e.target.value ? Number(e.target.value) : '')} className={select}>
                    <option value="">{t('hr.pickEmployee')}</option>
                    {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name}
                        </option>
                    ))}
                </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
                <label className="block">
                    <span className={label}>{t('hr.starts')}</span>
                    <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className={input} />
                </label>
                <label className="block">
                    <span className={label}>{t('hr.ends')}</span>
                    <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className={input} />
                </label>
            </div>

            <button type="button" onClick={() => void submit()} disabled={!userId || busy} className={button('primary', 'md', 'w-full')}>
                <Plus aria-hidden="true" className="h-4 w-4" />
                {t('hr.create')}
            </button>
        </section>
    );
}

function PerformancePanel({
    rows,
    from,
    to,
    onFromChange,
    onToChange,
}: {
    rows: PerformanceRow[];
    from: string;
    to: string;
    onFromChange: (value: string) => void;
    onToChange: (value: string) => void;
}) {
    const { t } = useI18n();

    const hasRoleMetric = useMemo(
        () => rows.some((r) => r.items_processed !== null) || rows.some((r) => r.deliveries_completed !== null),
        [rows],
    );

    return (
        <section aria-labelledby="performance-heading" className={cx(card, 'overflow-hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-5">
                <h2 id="performance-heading" className={cx(sectionTitle, 'flex items-center gap-2')}>
                    <TrendingUp aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                    {t('hr.performance')}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                    <label className="flex items-center gap-1.5">
                        <span className={cx(label, 'mb-0')}>{t('hr.from')}</span>
                        <input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} className={cx(input, 'h-9 w-auto px-2.5 text-sm')} />
                    </label>
                    <label className="flex items-center gap-1.5">
                        <span className={cx(label, 'mb-0')}>{t('hr.to')}</span>
                        <input type="date" value={to} onChange={(e) => onToChange(e.target.value)} className={cx(input, 'h-9 w-auto px-2.5 text-sm')} />
                    </label>
                </div>
            </div>

            {rows.length === 0 ? (
                <EmptyState compact icon={Users} title={t('hr.noStaff')} />
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-ink-50 text-xs uppercase tracking-wider text-ink-600 dark:bg-ink-950/50 dark:text-ink-350">
                            <tr>
                                <th scope="col" className="px-5 py-2.5 font-semibold">
                                    {t('hr.employee')}
                                </th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">
                                    {t('hr.status.present')}
                                </th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">
                                    {t('hr.status.retard')}
                                </th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">
                                    {t('hr.status.absent')}
                                </th>
                                <th scope="col" className="px-5 py-2.5 font-semibold">
                                    {t('hr.hoursWorked')}
                                </th>
                                {hasRoleMetric && (
                                    <th scope="col" className="px-5 py-2.5 font-semibold">
                                        {t('hr.itemsProcessed')} / {t('hr.deliveriesCompleted')}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                            {rows.map((row) => (
                                <tr key={row.user_id}>
                                    <td className="px-5 py-2.5 font-medium text-ink-900 dark:text-ink-50">{row.name}</td>
                                    <td className="px-5 py-2.5">
                                        <StatusBadge kind="attendance" status="present" />
                                        <span className="ml-1.5 tabular-nums">{row.present}</span>
                                    </td>
                                    <td className="px-5 py-2.5">
                                        <StatusBadge kind="attendance" status="retard" />
                                        <span className="ml-1.5 tabular-nums">{row.retard}</span>
                                    </td>
                                    <td className="px-5 py-2.5">
                                        <StatusBadge kind="attendance" status="absent" />
                                        <span className="ml-1.5 tabular-nums">{row.absent}</span>
                                    </td>
                                    <td className="px-5 py-2.5 tabular-nums">{row.hours_worked}</td>
                                    {hasRoleMetric && (
                                        <td className="px-5 py-2.5 tabular-nums text-ink-600 dark:text-ink-350">
                                            {row.items_processed ?? row.deliveries_completed ?? '—'}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

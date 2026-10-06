import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CircleDollarSign, PackageX } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { api } from '../lib/api';
import { cx, iconButton } from './ui/styles';
import type { StaffAlert, StaffAlertsResponse } from '../types';

const POLL_INTERVAL_MS = 60_000;

const ALERT_ICON: Record<StaffAlert['type'], typeof Bell> = {
    cash_movement_pending: CircleDollarSign,
    pickup_blocked: PackageX,
};

/**
 * Cloche d'alertes (en-tête) : agrège en live des signaux déjà réels
 * (`GET /staff-alerts` — mouvements de caisse en attente, retraits bloqués pour
 * impayé), jamais un système de notification générique. Badge = total réel,
 * jamais affiché s'il est à zéro.
 */
export default function StaffAlertsBell() {
    const { t } = useI18n();
    const containerRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [data, setData] = useState<StaffAlertsResponse>({ alerts: [], total: 0 });

    useEffect(() => {
        let mounted = true;
        function load() {
            api
                .get<StaffAlertsResponse>('/staff-alerts')
                .then((res) => {
                    if (mounted) setData(res);
                })
                .catch(() => {});
        }
        load();
        const interval = setInterval(load, POLL_INTERVAL_MS);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label={t('alerts.title')}
                className={cx(iconButton, 'relative')}
            >
                <Bell aria-hidden="true" className="h-[18px] w-[18px]" />
                {data.total > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                        {data.total > 9 ? '9+' : data.total}
                    </span>
                )}
            </button>

            {open && (
                <div className="absolute right-0 top-full z-50 mt-1.5 w-72 overflow-hidden rounded-xl border border-ink-200 bg-white py-1.5 shadow-lg dark:border-ink-700 dark:bg-ink-900">
                    {data.alerts.length === 0 ? (
                        <p className="px-3.5 py-3 text-sm text-ink-600 dark:text-ink-350">{t('alerts.empty')}</p>
                    ) : (
                        data.alerts.map((alert) => {
                            const Icon = ALERT_ICON[alert.type];
                            return (
                                <Link
                                    key={alert.type}
                                    to={alert.url}
                                    onClick={() => setOpen(false)}
                                    className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition hover:bg-ink-50 dark:hover:bg-ink-800"
                                >
                                    <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                    <span className="text-ink-800 dark:text-ink-200">{t(`alerts.${alert.type}`, { count: alert.count })}</span>
                                </Link>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

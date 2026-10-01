import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFormat } from '../lib/format';
import type { Order } from '../types';

/** Contenu visuel du ticket de dépôt — partagé entre l'impression (PrintableTicket, masqué
 * hors impression) et l'aperçu visible de l'écran « Ticket et facture ». */
export default function TicketReceiptContent({ order }: { order: Order }) {
    const { t } = useI18n();
    const { settings } = useSettings();
    const { money, dateTime } = useFormat();

    return (
        <div className="p-4 text-sm">
            <div className="mb-2 flex items-center gap-2 border-b border-black pb-2">
                {settings?.logo_url && <img src={settings.logo_url} alt="" className="h-10 w-10 object-cover" />}
                <div>
                    <p className="text-base font-bold leading-tight">{settings?.pressing_name || t('app.title')}</p>
                    {order.agency && (
                        <p className="text-xs leading-tight">
                            {order.agency.name}
                            {order.agency.address && ` — ${order.agency.address}`}
                            {order.agency.phone && ` — ${order.agency.phone}`}
                        </p>
                    )}
                </div>
            </div>

            <h2 className="text-base font-bold">{t('order.ticket')}</h2>
            <p>
                {t('order.number')}
                {order.order_number}
            </p>
            <p>{dateTime(order.created_at)}</p>
            <p>
                {order.client?.first_name} {order.client?.last_name} — {order.client?.phone}
            </p>
            {order.promised_at && (
                <p>
                    {t('order.promisedAt')} {dateTime(order.promised_at)}
                </p>
            )}
            <ul className="mt-2 list-disc pl-4">
                {order.items.map((item) => (
                    <li key={item.id}>
                        {item.service?.name}
                        {item.treatment_type ? ` (${item.treatment_type.name})` : ''} × {item.quantity} — {item.qr_code}
                    </li>
                ))}
            </ul>
            <p className="mt-2 font-semibold">
                {t('common.total')} : {money(order.total_amount)}
            </p>
        </div>
    );
}

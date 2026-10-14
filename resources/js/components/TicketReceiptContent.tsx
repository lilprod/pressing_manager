import { useI18n } from '../contexts/I18nContext';
import { useSettings } from '../contexts/SettingsContext';
import { useFormat } from '../lib/format';
import type { Order } from '../types';

/** Contenu visuel du ticket de dépôt — partagé entre l'impression (PrintableTicket, masqué
 * hors impression) et l'aperçu visible de l'écran « Ticket et facture ». Mise en forme de
 * ticket thermique (80 mm) : en-tête centré, séparateurs pointillés, lignes article/prix. */
export default function TicketReceiptContent({ order }: { order: Order }) {
    const { t } = useI18n();
    const { settings } = useSettings();
    const { money, dateTime } = useFormat();
    const invoice = order.invoice?.[0] ?? null;
    const paid = (invoice?.payments ?? []).filter((p) => p.status === 'complete').reduce((sum, p) => sum + p.amount, 0);
    const separator = <div className="my-2 border-t border-dashed border-black" />;

    return (
        <div className="p-4 font-mono text-[12px] leading-snug">
            <div className="text-center">
                {settings?.logo_url && <img src={settings.logo_url} alt="" className="mx-auto mb-1 h-10 w-10 object-cover" />}
                <p className="text-sm font-bold uppercase">{settings?.pressing_name}</p>
                {order.agency && (
                    <>
                        <p>{order.agency.name}</p>
                        {order.agency.address && <p>{order.agency.address}</p>}
                        {order.agency.phone && <p>{order.agency.phone}</p>}
                    </>
                )}
            </div>
            {separator}
            <p className="text-center text-sm font-bold uppercase">{t('order.ticket')}</p>
            <p className="text-center text-base font-bold">{order.order_number_formatted ?? order.order_number}</p>
            {separator}
            <div className="flex justify-between gap-2">
                <span>{t('ticket.depositedAt')}</span>
                <span>{dateTime(order.created_at)}</span>
            </div>
            {order.promised_at && (
                <div className="flex justify-between gap-2 font-bold">
                    <span>{t('ticket.pickupAt')}</span>
                    <span>{dateTime(order.promised_at)}</span>
                </div>
            )}
            <div className="flex justify-between gap-2">
                <span>{t('order.client')}</span>
                <span className="text-right">
                    {order.client?.first_name} {order.client?.last_name}
                </span>
            </div>
            {order.client?.phone && <p className="text-right">{order.client.phone}</p>}
            {separator}
            <ul className="space-y-1.5">
                {order.items.map((item) => (
                    <li key={item.id}>
                        <div className="flex justify-between gap-2">
                            <span className="font-bold">
                                {item.weight_kg ? `${item.weight_kg} kg` : `${item.quantity}×`} {item.service?.name}
                            </span>
                            <span className="whitespace-nowrap">{money(item.unit_price * item.quantity)}</span>
                        </div>
                        {(item.treatment_type || item.finish_option) && (
                            <p>{[item.treatment_type?.name, item.finish_option?.name].filter(Boolean).join(' · ')}</p>
                        )}
                        <p className="text-[10px]">{item.qr_code}</p>
                    </li>
                ))}
            </ul>
            {separator}
            {order.discount_amount > 0 && (
                <div className="flex justify-between gap-2">
                    <span>{t('invoice.discount')}</span>
                    <span>-{money(order.discount_amount)}</span>
                </div>
            )}
            {invoice ? (
                <>
                    <div className="flex justify-between gap-2">
                        <span>{t('invoice.tax')}</span>
                        <span>{money(invoice.tax_amount)}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-sm font-bold">
                        <span>{t('ticket.totalTtc')}</span>
                        <span>{money(invoice.total_amount)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                        <span>{t('order.table.paid')}</span>
                        <span>{money(paid)}</span>
                    </div>
                    <div className="flex justify-between gap-2 font-bold">
                        <span>{t('order.table.remaining')}</span>
                        <span>{money(Math.max(0, invoice.total_amount - paid))}</span>
                    </div>
                </>
            ) : (
                <div className="flex justify-between gap-2 text-sm font-bold">
                    <span>{t('common.total')}</span>
                    <span>{money(order.total_amount)}</span>
                </div>
            )}
            {(settings?.ticket_conditions || settings?.ticket_footer) && (
                <>
                    {separator}
                    <div className="text-[11px]">
                        {settings.ticket_conditions && <p>{settings.ticket_conditions}</p>}
                        {settings.ticket_footer && <p className="mt-1 text-center">{settings.ticket_footer}</p>}
                    </div>
                </>
            )}
        </div>
    );
}

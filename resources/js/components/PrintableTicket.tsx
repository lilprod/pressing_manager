import { useI18n } from '../contexts/I18nContext';
import type { Order } from '../types';

export default function PrintableTicket({ order }: { order: Order }) {
    const { t } = useI18n();

    return (
        <div className="printable">
            <div className="p-4 text-sm">
                <h2 className="text-base font-bold">{t('order.ticket')}</h2>
                <p>
                    {t('order.number')}
                    {order.order_number}
                </p>
                <p>
                    {order.client?.first_name} {order.client?.last_name} — {order.client?.phone}
                </p>
                <ul className="mt-2 list-disc pl-4">
                    {order.items.map((item) => (
                        <li key={item.id}>
                            {item.service?.name} × {item.quantity} — {item.qr_code}
                        </li>
                    ))}
                </ul>
                <p className="mt-2 font-semibold">
                    {t('common.total')} : {order.total_amount} FCFA
                </p>
            </div>
        </div>
    );
}

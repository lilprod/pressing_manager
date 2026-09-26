import { useI18n } from '../contexts/I18nContext';
import type { OrderItem } from '../types';

export default function PrintableLabel({ item, dataUri }: { item: OrderItem; dataUri: string }) {
    const { t } = useI18n();

    return (
        <div className="printable">
            <div className="flex flex-col items-center gap-1 p-2 text-center text-xs" style={{ width: '50mm' }}>
                <img src={dataUri} alt={t('order.label')} style={{ width: '30mm', height: '30mm' }} />
                <span className="font-mono">{item.qr_code}</span>
                <span>{item.service?.name}</span>
            </div>
        </div>
    );
}

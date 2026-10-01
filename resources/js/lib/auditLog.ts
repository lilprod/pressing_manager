import type { AuditLog } from '../types';

type Translate = (key: string, vars?: Record<string, string | number>) => string;
type Money = (amount: number | null | undefined) => string;

const TYPE_LABEL_KEYS: Record<string, string> = {
    Order: 'audit.type.order',
    OrderItem: 'audit.type.orderItem',
    Invoice: 'audit.type.invoice',
    Payment: 'audit.type.payment',
    Client: 'audit.type.client',
    Delivery: 'audit.type.delivery',
    CashMovement: 'audit.type.cashMovement',
    CashClosure: 'audit.type.cashClosure',
    StockMovement: 'audit.type.stockMovement',
};

const PAYMENT_METHOD_KEYS: Record<string, string> = {
    espece: 'payment.cash',
    carte: 'payment.card',
    flooz: 'payment.flooz',
    tmoney: 'payment.tmoney',
};

/** Libellé lisible d'un type journalisable (ex. « OrderItem » -> « Article »). */
export function auditTypeLabel(type: string, t: Translate): string {
    return t(TYPE_LABEL_KEYS[type] ?? '') || type;
}

/** Formate une entrée du journal d'audit générique (`audit_logs`) en texte lisible. */
export function auditLogLabel(log: AuditLog, t: Translate, money: Money): string {
    const action = log.action.split('.').pop();
    const newValues = log.new_values ?? {};
    const type = log.auditable_type;

    if (type === 'Order') {
        if (action === 'created') return t('audit.event.orderCreated');
        // order.status est l'agrégat « état atelier » (synchronisé depuis les articles par
        // OrderStatusSynchronizer), pas un statut commercial indépendant — voir la carte
        // « Statut commercial », dérivée de la facture, pour le vrai cycle commercial.
        if (action === 'updated' && typeof newValues.status === 'string') {
            return t('audit.event.orderWorkshopStatusChanged', { status: t(`status.${newValues.status}`) });
        }
        return t('audit.event.orderUpdated');
    }

    if (type === 'OrderItem') {
        if (action === 'updated' && typeof newValues.status === 'string') {
            return t('audit.event.itemStatusChanged', { status: t(`status.${newValues.status}`) });
        }
        if (action === 'created') return t('audit.event.itemCreated');
        return t('audit.event.itemUpdated');
    }

    if (type === 'Invoice') {
        if (action === 'created') return t('audit.event.invoiceCreated');
        if (action === 'updated' && typeof newValues.status === 'string') {
            return t('audit.event.invoiceStatusChanged', { status: t(`invoice.status.${newValues.status}`) });
        }
        return t('audit.event.invoiceUpdated');
    }

    if (type === 'Payment') {
        if (action === 'created') {
            const amount = typeof newValues.amount === 'number' ? money(newValues.amount) : '';
            const methodKey = typeof newValues.method === 'string' ? PAYMENT_METHOD_KEYS[newValues.method] : undefined;
            return t('audit.event.paymentCreated', { amount, method: methodKey ? t(methodKey) : '' });
        }
        if (action === 'updated' && typeof newValues.status === 'string') {
            return t('audit.event.paymentStatusChanged', { status: t(`payment.status.${newValues.status}`) });
        }
        return t('audit.event.paymentUpdated');
    }

    const typeLabel = t(TYPE_LABEL_KEYS[type] ?? '') || type;
    if (action === 'created') return t('audit.event.genericCreated', { type: typeLabel });
    if (action === 'deleted') return t('audit.event.genericDeleted', { type: typeLabel });
    return t('audit.event.genericUpdated', { type: typeLabel });
}

import { useI18n } from '../contexts/I18nContext';
import type { PaymentMethod } from '../types';
import { cx, input, label } from './ui/styles';

/**
 * Référence de transaction obligatoire pour un paiement carte/Flooz/T-Money confirmé
 * manuellement (V1, en attendant une intégration réelle avec un agrégateur — voir
 * PaymentService::recordManualPayment()). Jamais le numéro de carte complet (PCI) :
 * 4 derniers chiffres ou référence imprimée sur le reçu du terminal/téléphone.
 * Partagé entre PickupProcessPage.tsx et InvoicePanel.tsx.
 */
export default function PaymentReferenceField({
    method,
    value,
    onChange,
}: {
    method: PaymentMethod;
    value: string;
    onChange: (value: string) => void;
}) {
    const { t } = useI18n();

    return (
        <label className="block">
            <span className={label}>{t(`payment.reference.${method}`)}</span>
            <input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={t(`payment.reference.${method}.placeholder`)}
                className={cx(input, 'w-full')}
            />
            <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t('payment.reference.hint')}</p>
        </label>
    );
}

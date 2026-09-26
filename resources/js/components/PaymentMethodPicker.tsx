import { Banknote, CreditCard, Smartphone, type LucideIcon } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import type { PaymentMethod } from '../types';
import { cx, label as labelClass } from './ui/styles';

const METHODS: Array<{ value: PaymentMethod; labelKey: string; icon: LucideIcon }> = [
    { value: 'espece', labelKey: 'payment.cash', icon: Banknote },
    { value: 'carte', labelKey: 'payment.card', icon: CreditCard },
    { value: 'flooz', labelKey: 'payment.flooz', icon: Smartphone },
    { value: 'tmoney', labelKey: 'payment.tmoney', icon: Smartphone },
];

interface Props {
    name: string;
    value: PaymentMethod;
    onChange: (method: PaymentMethod) => void;
    /** 'compact' : 2 colonnes (panneaux étroits), 'wide' : 4 colonnes dès sm. */
    layout?: 'compact' | 'wide';
}

/** Sélecteur de moyen de paiement en tuiles (boutons radio natifs, accessibles au clavier). */
export default function PaymentMethodPicker({ name, value, onChange, layout = 'wide' }: Props) {
    const { t } = useI18n();

    return (
        <fieldset>
            <legend className={labelClass}>{t('payment.method')}</legend>
            <div className={cx('grid grid-cols-2 gap-2', layout === 'wide' && 'sm:grid-cols-4')}>
                {METHODS.map(({ value: method, labelKey, icon: Icon }) => {
                    const checked = value === method;
                    return (
                        <label
                            key={method}
                            className={cx(
                                'flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 px-2 text-sm font-semibold transition duration-150',
                                'has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/25',
                                checked
                                    ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-300 dark:bg-brand-400/10 dark:text-brand-200'
                                    : 'border-ink-200 bg-white text-ink-700 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-200 dark:hover:border-ink-600',
                            )}
                        >
                            <input
                                type="radio"
                                name={name}
                                value={method}
                                checked={checked}
                                onChange={() => onChange(method)}
                                className="sr-only"
                            />
                            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                            {t(labelKey)}
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

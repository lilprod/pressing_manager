import type { OrderItem } from '../types';

/** « Express · Sur cintre » : traitement et rendu choisis au comptoir pour une ligne. */
export function itemPrestationLabel(item: Pick<OrderItem, 'treatment_type' | 'finish_option'>): string {
    return [item.treatment_type?.name, item.finish_option?.name].filter(Boolean).join(' · ');
}

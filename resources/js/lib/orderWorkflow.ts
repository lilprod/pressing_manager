import type { OrderItemStatus } from '../types';

/**
 * Reflète app/Services/OrderItemStatusTransitioner.php côté backend, qui reste la
 * seule source de vérité (validée à nouveau côté serveur) — ceci ne sert qu'à
 * décider quels boutons afficher.
 */
export const ALLOWED_TRANSITIONS: Record<OrderItemStatus, OrderItemStatus[]> = {
    recu: ['trie', 'perdu'],
    trie: ['en_traitement', 'perdu'],
    en_traitement: ['controle_qualite', 'perdu'],
    controle_qualite: ['pret', 'en_traitement', 'perdu'],
    pret: ['livre', 'non_recupere', 'perdu'],
    non_recupere: ['livre', 'perdu'],
    livre: [],
    perdu: [],
};

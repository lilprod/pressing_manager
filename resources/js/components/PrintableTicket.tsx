import TicketReceiptContent from './TicketReceiptContent';
import type { Order } from '../types';

/** `copies` : chaque exemplaire supplémentaire est rendu dans le DOM imprimable (saut de page
 * entre chacun) — `window.print()` ne permet pas de spécifier un nombre d'exemplaires. */
export default function PrintableTicket({ order, copies = 1 }: { order: Order; copies?: number }) {
    return (
        <div className="printable">
            {Array.from({ length: Math.max(1, copies) }).map((_, i) => (
                <div key={i} style={i < copies - 1 ? { pageBreakAfter: 'always' } : undefined}>
                    <TicketReceiptContent order={order} />
                </div>
            ))}
        </div>
    );
}

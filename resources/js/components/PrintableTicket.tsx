import TicketReceiptContent from './TicketReceiptContent';
import type { Order } from '../types';

export default function PrintableTicket({ order }: { order: Order }) {
    return (
        <div className="printable">
            <TicketReceiptContent order={order} />
        </div>
    );
}

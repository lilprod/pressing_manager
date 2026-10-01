<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Facture {{ $invoice->agency->code }}-{{ $invoice->invoice_number }}</title>
    <style>
        body { font-family: sans-serif; font-size: 12px; color: #222; }
        h1 { font-size: 18px; margin-bottom: 0; }
        .muted { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; }
        th { background: #f5f5f5; }
        .totals td { border: none; }
        .totals .label { text-align: right; }
    </style>
</head>
<body>
    <h1>{{ $invoice->agency->name }}</h1>
    <p class="muted">{{ $invoice->agency->address }} — {{ $invoice->agency->phone }}</p>

    <p>
        <strong>Facture n° {{ $invoice->agency->code }}-{{ $invoice->invoice_number }}</strong><br>
        Date : {{ $invoice->issued_at?->format('d/m/Y H:i') }}<br>
        Client : {{ $invoice->client->first_name }} {{ $invoice->client->last_name }} ({{ $invoice->client->phone }})
    </p>

    <table>
        <thead>
            <tr>
                <th>Article</th>
                <th>Service</th>
                <th>Qté</th>
                <th>Prix unitaire (FCFA)</th>
                <th>Total (FCFA)</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($invoice->order->items as $item)
                <tr>
                    <td>{{ $item->description ?? $item->qr_code }}</td>
                    <td>{{ $item->service->name }}{{ $item->treatmentType ? ' ('.$item->treatmentType->name.')' : '' }}</td>
                    <td>{{ $item->quantity }}</td>
                    <td>{{ number_format($item->unit_price, 0, ',', ' ') }}</td>
                    <td>{{ number_format($item->quantity * $item->unit_price, 0, ',', ' ') }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table class="totals">
        <tr>
            <td class="label" colspan="4">Sous-total</td>
            <td>{{ number_format($invoice->subtotal, 0, ',', ' ') }} FCFA</td>
        </tr>
        <tr>
            <td class="label" colspan="4">Remise</td>
            <td>-{{ number_format($invoice->discount_amount, 0, ',', ' ') }} FCFA</td>
        </tr>
        <tr>
            <td class="label" colspan="4">TVA ({{ number_format(config('invoicing.tax_rate') * 100, 0) }}%)</td>
            <td>{{ number_format($invoice->tax_amount, 0, ',', ' ') }} FCFA</td>
        </tr>
        <tr>
            <td class="label" colspan="4"><strong>Total à payer</strong></td>
            <td><strong>{{ number_format($invoice->total_amount, 0, ',', ' ') }} FCFA</strong></td>
        </tr>
    </table>
</body>
</html>

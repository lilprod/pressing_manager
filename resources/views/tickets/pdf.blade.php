<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Ticket {{ $order->agency->code ?? '' }}-{{ $orderNumberFormatted }}</title>
    <style>
        @page { margin: 12px; }
        body { font-family: sans-serif; font-size: 11px; color: #222; width: 260px; }
        h1 { font-size: 14px; margin: 0 0 2px; }
        .muted { color: #666; font-size: 10px; }
        hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 2px 0; vertical-align: top; }
        .right { text-align: right; }
        .total { font-weight: bold; font-size: 12px; }
    </style>
</head>
<body>
    <h1>{{ $order->agency->name ?? config('app.name') }}</h1>
    @if ($order->agency)
        <p class="muted">{{ $order->agency->address }} — {{ $order->agency->phone }}</p>
    @endif
    <hr>
    <p>
        <strong>Ticket n° {{ $orderNumberFormatted }}</strong><br>
        Date : {{ $order->created_at->format('d/m/Y H:i') }}<br>
        Client : {{ $order->client->first_name }} {{ $order->client->last_name }} ({{ $order->client->phone }})
        @if ($order->promised_at)
            <br>Retrait prévu : {{ $order->promised_at->format('d/m/Y H:i') }}
        @endif
    </p>
    <hr>
    <table>
        @foreach ($order->items as $item)
            <tr>
                <td>{{ $item->service->name }}{{ $item->treatmentType ? ' ('.$item->treatmentType->name.')' : '' }} × {{ $item->quantity }}<br><span class="muted">{{ $item->qr_code }}</span></td>
                <td class="right">{{ number_format($item->quantity * $item->unit_price, 0, ',', ' ') }}</td>
            </tr>
        @endforeach
    </table>
    <hr>
    <table>
        <tr class="total">
            <td>Total</td>
            <td class="right">{{ number_format($order->total_amount, 0, ',', ' ') }} FCFA</td>
        </tr>
    </table>
    @if ($settings->ticket_conditions || $settings->ticket_footer)
        <hr>
        @if ($settings->ticket_conditions)
            <p class="muted">{{ $settings->ticket_conditions }}</p>
        @endif
        @if ($settings->ticket_footer)
            <p class="muted">{{ $settings->ticket_footer }}</p>
        @endif
    @endif
</body>
</html>

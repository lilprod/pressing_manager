<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Ticket {{ $order->agency->code ?? '' }}-{{ $order->order_number }}</title>
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
        <strong>Ticket n° {{ $order->order_number }}</strong><br>
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
                <td>{{ $item->service->name }} × {{ $item->quantity }}<br><span class="muted">{{ $item->qr_code }}</span></td>
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
    <hr>
    <p class="muted">Merci de votre confiance.</p>
</body>
</html>

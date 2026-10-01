<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Clôture {{ $closure->agency->code }}-{{ $closure->business_date->format('Y-m-d') }}</title>
    <style>
        body { font-family: sans-serif; font-size: 12px; color: #222; }
        h1 { font-size: 18px; margin-bottom: 0; }
        .muted { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; }
        th { background: #f5f5f5; }
        .right { text-align: right; }
        .ok { color: #0a7a3d; }
        .ko { color: #b42318; }
    </style>
</head>
<body>
    <h1>{{ $closure->agency->name }}</h1>
    <p class="muted">{{ $closure->agency->address }} — {{ $closure->agency->phone }}</p>

    <p>
        <strong>Clôture de caisse — {{ $closure->business_date->format('d/m/Y') }}</strong><br>
        Clôturée le {{ $closure->closed_at->format('d/m/Y H:i') }} par {{ $closure->closer->name ?? '—' }}
    </p>

    <table>
        <thead>
            <tr>
                <th>Moyen de paiement</th>
                <th class="right">Théorique (FCFA)</th>
                <th class="right">Compté (FCFA)</th>
                <th class="right">Écart (FCFA)</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($closure->counts as $count)
                <tr>
                    <td>{{ ['espece' => 'Espèces', 'mobile_money' => 'Mobile Money', 'carte' => 'Carte'][$count->method] }}</td>
                    <td class="right">{{ number_format($count->theoretical_amount, 0, ',', ' ') }}</td>
                    <td class="right">{{ number_format($count->counted_amount, 0, ',', ' ') }}</td>
                    <td class="right {{ $count->variance === 0 ? 'ok' : 'ko' }}">{{ number_format($count->variance, 0, ',', ' ') }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    @if ($closure->notes)
        <p><strong>Justification de l'écart :</strong> {{ $closure->notes }}</p>
    @endif

    <p>
        <strong>Checklist de clôture :</strong>
        {{ count($closure->checklist) }}/{{ count(config('cash.closure_checklist_steps')) }} étapes confirmées.
    </p>
</body>
</html>

@php($fmt = fn ($n) => $n === null ? '—' : number_format((float) $n, 0, ',', ' ').' FCFA')
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Bilan journalier {{ $agency->name }} {{ $report['date'] }}</title>
    <style>
        body { font-family: sans-serif; font-size: 11px; color: #222; }
        h1 { font-size: 18px; margin-bottom: 0; }
        h2 { font-size: 13px; margin: 18px 0 4px; }
        .muted { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { border-bottom: 1px solid #ddd; padding: 5px 4px; text-align: left; }
        th { background: #f5f5f5; }
        .right { text-align: right; }
    </style>
</head>
<body>
    <h1>Bilan journalier — {{ $agency->name }}</h1>
    <p class="muted">Journée du {{ \Illuminate\Support\Carbon::parse($report['date'])->format('d/m/Y') }} · généré le {{ now()->format('d/m/Y H:i') }}</p>

    <h2>Synthèse</h2>
    <table>
        <tr><td>Recettes encaissées</td><td class="right">{{ $fmt($report['stats']['revenue_today']) }}</td></tr>
        <tr><td>Même jour semaine précédente</td><td class="right">{{ $fmt($report['comparison']['revenue_previous']) }}</td></tr>
        <tr><td>Transactions</td><td class="right">{{ $report['stats']['transactions_count'] }}</td></tr>
        <tr><td>Panier moyen</td><td class="right">{{ $fmt($report['stats']['average_basket']) }}</td></tr>
        <tr><td>Impayés ouverts</td><td class="right">{{ $fmt($report['stats']['outstanding']) }}</td></tr>
        <tr><td>Remises ({{ $report['discounts']['count'] }}, dont {{ $report['discounts']['sensitive_count'] }} > 10 %)</td><td class="right">{{ $fmt($report['discounts']['total']) }}</td></tr>
    </table>

    <h2>Recettes par moyen de paiement</h2>
    <table>
        @foreach ($report['payments_by_method'] as $method => $row)
            <tr><td>{{ ['espece' => 'Espèces', 'carte' => 'Carte', 'flooz' => 'Flooz', 'tmoney' => 'T-Money'][$method] ?? $method }}</td><td class="right">{{ $fmt($row['amount']) }} ({{ $row['percent'] }} %)</td></tr>
        @endforeach
    </table>

    <h2>Rapprochement caisse</h2>
    <table>
        <tr><td>Solde théorique</td><td class="right">{{ $fmt($report['reconciliation']['expected']) }}</td></tr>
        <tr><td>Comptage déclaré</td><td class="right">{{ $report['reconciliation']['closed'] ? $fmt($report['reconciliation']['counted']) : 'Non clôturé' }}</td></tr>
        <tr><td>Écart</td><td class="right">{{ $report['reconciliation']['closed'] ? $fmt($report['reconciliation']['variance']) : '—' }}</td></tr>
    </table>

    <h2>Sessions de caisse</h2>
    <table>
        <thead><tr><th>Caisse</th><th>Caissier</th><th>État</th><th class="right">Encaissé</th><th class="right">Écart</th></tr></thead>
        <tbody>
            @forelse ($report['sessions'] as $session)
                <tr><td>{{ $session['register_label'] }}</td><td>{{ $session['cashier'] }}</td><td>{{ ['open' => 'Ouverte', 'paused' => 'Pause', 'closed' => 'Clôturée'][$session['status']] }}</td><td class="right">{{ $fmt($session['collected']) }}</td><td class="right">{{ $fmt($session['variance']) }}</td></tr>
            @empty
                <tr><td colspan="5" class="muted">Aucune session ouverte ce jour.</td></tr>
            @endforelse
        </tbody>
    </table>

    <h2>Performance des caissiers</h2>
    <table>
        <thead><tr><th>Caissier</th><th class="right">Recettes</th><th class="right">Tickets</th><th class="right">Panier</th><th class="right">Écart</th></tr></thead>
        <tbody>
            @foreach ($report['cashiers'] as $cashier)
                <tr><td>{{ $cashier['name'] }}</td><td class="right">{{ $fmt($cashier['amount']) }}</td><td class="right">{{ $cashier['transactions_count'] }}</td><td class="right">{{ $fmt($cashier['average_basket']) }}</td><td class="right">{{ $fmt($cashier['variance']) }}</td></tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>

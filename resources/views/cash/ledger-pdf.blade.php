<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Journal de caisse {{ $agency->code }} {{ $from }} — {{ $to }}</title>
    <style>
        body { font-family: sans-serif; font-size: 11px; color: #222; }
        h1 { font-size: 18px; margin-bottom: 0; }
        .muted { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid #ddd; padding: 5px 4px; text-align: left; }
        th { background: #f5f5f5; }
        .right { text-align: right; }
        .kind-mouvement { color: #1d4ed8; }
        .kind-encaissement { color: #0a7a3d; }
        .kind-cloture { color: #92400e; }
    </style>
</head>
<body>
    <h1>{{ $agency->name }}</h1>
    <p class="muted">{{ $agency->address }} — {{ $agency->phone }}</p>

    <p>
        <strong>Journal de caisse</strong><br>
        Période : {{ $from }} au {{ $to }} — {{ count($rows) }} opération(s)
    </p>

    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Référence</th>
                <th>Catégorie</th>
                <th>Agent</th>
                <th class="right">Montant (FCFA)</th>
                <th>Statut</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($rows as $entry)
                <tr>
                    <td>{{ \Illuminate\Support\Carbon::parse($entry->date)->format('d/m/Y H:i') }}</td>
                    <td class="kind-{{ $entry->kind }}">{{ ['mouvement' => 'Mouvement', 'encaissement' => 'Encaissement', 'cloture' => 'Clôture'][$entry->kind] ?? $entry->kind }}</td>
                    <td>{{ $entry->reference }}</td>
                    <td>{{ $entry->category }}</td>
                    <td>{{ $entry->agent_name ?? '—' }}</td>
                    <td class="right">{{ $entry->direction === '-' ? '-' : '' }}{{ number_format($entry->amount, 0, ',', ' ') }}</td>
                    <td>{{ $entry->status }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>

<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Journal d'audit — {{ $pressing->name }}</title>
    <style>
        body { font-family: sans-serif; font-size: 11px; color: #222; }
        h1 { font-size: 18px; margin-bottom: 0; }
        .muted { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid #ddd; padding: 5px 4px; text-align: left; }
        th { background: #f5f5f5; }
    </style>
</head>
<body>
    <h1>{{ $pressing->name }}</h1>
    <p class="muted">Code : {{ $pressing->code }}</p>

    <p>
        <strong>Journal d'audit plateforme</strong><br>
        {{ count($rows) }} évènement(s)
    </p>

    <table>
        <thead>
            <tr>
                <th>Date</th>
                <th>Action</th>
                <th>Acteur</th>
                <th>Rôle</th>
                <th>Adresse IP</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($rows as $log)
                <tr>
                    <td>{{ $log->created_at?->format('d/m/Y H:i:s') }}</td>
                    <td>{{ $log->action }}</td>
                    <td>{{ $log->platformUser?->name ?? 'Système' }}</td>
                    <td>{{ $log->platformUser?->platformRole?->name ?? '—' }}</td>
                    <td>{{ $log->ip_address ?? '—' }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>
</body>
</html>

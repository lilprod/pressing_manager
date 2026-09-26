<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>Rapport KPI {{ $data['from'] }} — {{ $data['to'] }}</title>
    <style>
        body { font-family: sans-serif; font-size: 12px; color: #222; }
        h1 { font-size: 18px; margin-bottom: 0; }
        .muted { color: #666; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; }
        th { background: #f5f5f5; }
        .section-title { font-size: 13px; font-weight: bold; margin-top: 18px; margin-bottom: 4px; }
        .num { text-align: right; }
    </style>
</head>
<body>
    <h1>Rapport KPI — Pressing Manager</h1>
    <p class="muted">
        Période : {{ $data['from'] }} au {{ $data['to'] }}<br>
        Agence : {{ $data['scope'] === 'agency' ? ($data['agency']['name'] ?? '—') : 'Toutes les agences (vue consolidée)' }}
    </p>

    <p class="section-title">Synthèse</p>
    <table>
        <tbody>
            <tr><td>Chiffre d'affaires encaissé</td><td class="num">{{ number_format($data['revenue'], 0, ',', ' ') }} FCFA</td></tr>
            <tr><td>Nombre de commandes</td><td class="num">{{ $data['orders_count'] }}</td></tr>
            <tr><td>Panier moyen</td><td class="num">{{ number_format($data['average_order_value'], 0, ',', ' ') }} FCFA</td></tr>
            <tr><td>Taux de commandes express</td><td class="num">{{ $data['express_rate'] }} %</td></tr>
            <tr><td>Articles en stock bas</td><td class="num">{{ $data['low_stock_items'] }}</td></tr>
            <tr><td>Mouvements de stock</td><td class="num">{{ $data['stock_movements'] }}</td></tr>
            <tr><td>Livraisons totales</td><td class="num">{{ $data['deliveries_total'] }}</td></tr>
            <tr><td>Livraisons effectuées</td><td class="num">{{ $data['deliveries_completed'] }}</td></tr>
            <tr><td>Livraisons échouées</td><td class="num">{{ $data['deliveries_failed'] }}</td></tr>
            <tr><td>Taux de réussite des livraisons</td><td class="num">{{ $data['delivery_completion_rate'] }} %</td></tr>
            <tr><td>Présences</td><td class="num">{{ $data['attendance_present'] }}</td></tr>
            <tr><td>Retards</td><td class="num">{{ $data['attendance_retard'] }}</td></tr>
            <tr><td>Absences</td><td class="num">{{ $data['attendance_absent'] }}</td></tr>
            <tr><td>Heures travaillées</td><td class="num">{{ $data['hours_worked'] }}</td></tr>
            <tr><td>Abonnements clients actifs</td><td class="num">{{ $data['active_subscriptions'] }}</td></tr>
        </tbody>
    </table>

    @if (isset($data['by_agency']))
        <p class="section-title">Ventilation par agence</p>
        <table>
            <thead>
                <tr>
                    <th>Agence</th>
                    <th>CA encaissé</th>
                    <th>Commandes</th>
                    <th>Stock bas</th>
                    <th>Livraisons OK</th>
                    <th>Présences</th>
                    <th>Absences</th>
                </tr>
            </thead>
            <tbody>
                @foreach ($data['by_agency'] as $agency)
                    <tr>
                        <td>{{ $agency['agency_name'] }}</td>
                        <td>{{ number_format($agency['revenue'], 0, ',', ' ') }} FCFA</td>
                        <td>{{ $agency['orders_count'] }}</td>
                        <td>{{ $agency['low_stock_items'] }}</td>
                        <td>{{ $agency['deliveries_completed'] }}</td>
                        <td>{{ $agency['attendance_present'] }}</td>
                        <td>{{ $agency['attendance_absent'] }}</td>
                    </tr>
                @endforeach
            </tbody>
        </table>
    @endif
</body>
</html>

<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Plans de licence logicielle
    |--------------------------------------------------------------------------
    |
    | Chaque renouvellement étend `licenses.expires_at` de `days` jours pour
    | `price` FCFA. Le prix est toujours recalculé côté serveur à partir de ce
    | fichier — jamais fourni tel quel par le client — pour éviter qu'un appel
    | API falsifié ne renouvelle la licence pour un montant arbitraire.
    |
    */
    'plans' => [
        'mensuel' => ['days' => 30, 'price' => 15000],
        'trimestriel' => ['days' => 90, 'price' => 40000],
        'annuel' => ['days' => 365, 'price' => 150000],
    ],

    // Jours avant expiration auxquels une notification est envoyée aux administrateurs.
    'reminder_days' => [7, 1, 0],
];

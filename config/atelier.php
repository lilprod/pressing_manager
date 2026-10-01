<?php

return [
    // Capacité par défaut d'une agence qui n'a pas encore configuré agencies.workshop_capacity
    // (champ réel en base, éditable via AgencyController::update — aucune valeur par agence
    // n'est fabriquée au-delà de ce repli explicite).
    'default_capacity' => (int) env('ATELIER_DEFAULT_CAPACITY', 24),
];

<?php

return [
    // Nombre de FCFA payés donnant droit à 1 point de fidélité.
    'amount_per_point' => (int) env('LOYALTY_AMOUNT_PER_POINT', 100),
];

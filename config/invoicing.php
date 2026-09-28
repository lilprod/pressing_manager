<?php

return [
    // Taux de TVA appliqué aux factures (sous-total - remise) × taux, arrondi à l'entier
    // le plus proche puisque les montants sont en FCFA (pas de sous-unité, voir ARCHITECTURE.md).
    'tax_rate' => (float) env('INVOICE_TAX_RATE', 0.18),
];

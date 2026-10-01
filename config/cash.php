<?php

return [
    // Au-delà de ce montant, un mouvement de caisse manuel passe par un second
    // contrôle (statut "en_attente" jusqu'à validation par un autre utilisateur
    // ayant payments.manage) avant d'être compté dans le solde théorique. Pas
    // encore configurable par agence — voir CLAUDE.md, chantier de renforcement
    // Caisse.
    'sensitive_movement_threshold' => (int) env('CASH_SENSITIVE_MOVEMENT_THRESHOLD', 250000),

    // Étapes de la checklist de clôture obligatoire (voir CashService::closeRegister).
    // Les clés sont stables (utilisées en base et côté frontend pour les libellés i18n).
    'closure_checklist_steps' => [
        'journal_verified',
        'cash_recounted',
        'mobile_money_statements_checked',
        'card_payments_verified',
        'anomalies_handled',
        'double_control_done',
    ],
];

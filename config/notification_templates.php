<?php

/*
 * Modèles par défaut des notifications client (écran Notifications). Utilisés tant
 * qu'une agence n'a pas enregistré son propre modèle pour l'évènement et le canal.
 * Variables disponibles : voir App\Services\NotificationTemplateRenderer::VARIABLES.
 */
return [
    'order_received' => [
        'name' => 'Dépôt enregistré — standard',
        'subject' => 'Votre dépôt {{depot.numero}} est enregistré',
        'body' => 'Bonjour {{client.prenom}}, votre dépôt {{depot.numero}} est enregistré à l\'agence {{agence.nom}}. Montant : {{depot.montant}}. Retrait prévu le {{depot.date_limite}}.',
    ],
    'order_processing' => [
        'name' => 'En traitement — standard',
        'subject' => 'Votre dépôt {{depot.numero}} est en cours de traitement',
        'body' => 'Bonjour {{client.prenom}}, votre dépôt {{depot.numero}} est passé en atelier.',
    ],
    'order_ready' => [
        'name' => 'Prêt au retrait — standard',
        'subject' => 'Votre dépôt {{depot.numero}} est prêt',
        'body' => 'Bonjour {{client.prenom}}, votre dépôt {{depot.numero}} est prêt à l\'agence {{agence.nom}}. Reste à payer : {{depot.solde}}.',
    ],
    'order_delayed' => [
        'name' => 'Retard — standard',
        'subject' => 'Votre dépôt {{depot.numero}} prend du retard',
        'body' => 'Bonjour {{client.prenom}}, votre dépôt {{depot.numero}} prend un peu de retard. Nous vous prévenons dès qu\'il est prêt. Toutes nos excuses.',
    ],
    'pickup_completed' => [
        'name' => 'Retrait effectué — standard',
        'subject' => 'Retrait de votre dépôt {{depot.numero}}',
        'body' => 'Bonjour {{client.prenom}}, le retrait de votre dépôt {{depot.numero}} a bien été enregistré. Merci de votre confiance.',
    ],
    'payment_received' => [
        'name' => 'Paiement reçu — standard',
        'subject' => 'Paiement reçu — {{paiement.montant}}',
        'body' => 'Bonjour {{client.prenom}}, nous avons bien reçu votre paiement de {{paiement.montant}} ({{paiement.mode}}). Reste à payer : {{depot.solde}}.',
    ],
    'loyalty_points' => [
        'name' => 'Fidélité — standard',
        'subject' => 'Vous avez gagné {{fidelite.points_gagnes}} points',
        'body' => 'Bonjour {{client.prenom}}, vous avez gagné {{fidelite.points_gagnes}} points. Solde : {{fidelite.solde}} points.',
    ],
    'delivery_completed' => [
        'name' => 'Livraison effectuée — standard',
        'subject' => 'Votre dépôt {{depot.numero}} a été livré',
        'body' => 'Bonjour {{client.prenom}}, votre dépôt {{depot.numero}} a été livré. Merci de votre confiance.',
    ],
    'delivery_failed' => [
        'name' => 'Livraison échouée — standard',
        'subject' => 'Livraison de votre dépôt {{depot.numero}} non aboutie',
        'body' => 'Bonjour {{client.prenom}}, nous n\'avons pas pu livrer votre dépôt {{depot.numero}}. Nous vous recontacterons.',
    ],
];

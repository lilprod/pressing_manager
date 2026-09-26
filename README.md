# Pressing Manager

Système de gestion multi-agences d'un pressing (Togo). Backend Laravel + PostgreSQL, web React/TypeScript, mobile React Native (Expo).

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour l'architecture globale, le schéma de données, les index et les hypothèses retenues à l'étape 1.

## Démarrage local

```bash
composer install
cp .env.example .env   # DB_* déjà configuré pour PostgreSQL local
php artisan key:generate
php artisan migrate --seed
php artisan serve
```

La documentation OpenAPI (Swagger) est générée par :

```bash
php artisan l5-swagger:generate
# puis consultable sur /api/documentation
```

Pour lancer les tests (nécessite une base `pressing_manager_test` dédiée, voir `phpunit.xml`) :

```bash
php artisan test
```

## Comptes de test (après `--seed`)

Mot de passe pour tous : `password`.

| Rôle | Email | Portée |
|---|---|---|
| Administrateur | admin@pressing.tg | Globale |
| Manager | manager@pressing.tg | Globale |
| Accueil | accueil.lome-01@pressing.tg | Agence LOME-01 |
| Technicien | technicien.lome-01@pressing.tg | Agence LOME-01 |
| Livreur | livreur.lome-01@pressing.tg | Agence LOME-01 |

(mêmes rôles disponibles pour `lome-02` et `kara-01`)

## API

Auth Sanctum par jeton (`POST /api/login` avec `device_name`, puis `Authorization: Bearer {token}`).

- `POST /api/login`, `POST /api/logout`, `GET /api/me`
- `GET|POST /api/clients`, `GET|PATCH|DELETE /api/clients/{client}`
- `GET|POST /api/orders`, `GET /api/orders/{order}`
- `PATCH /api/order-items/{orderItem}/status` (workflow contrôlé, voir `OrderItemStatusTransitioner`)
- `GET /api/order-items/{orderItem}/qr-code`, `GET /api/order-items/scan/{qrCode}`
- `POST /api/orders/{order}/invoice`, `GET /api/invoices/{invoice}`, `GET /api/invoices/{invoice}/pdf`
- `POST /api/payments/cash`, `POST /api/payments/remote` (carte/Flooz/T-Money)
- `POST /api/webhooks/payments/{method}` — callback opérateur, idempotent, sans auth Sanctum (secret partagé `X-Webhook-Secret`)
- `GET /api/license`, `GET /api/license/history`, `GET /api/license/plans`, `POST /api/license/renew`
- `GET|POST /api/subscription-plans`, `GET|POST /api/customer-subscriptions`, `POST /api/customer-subscriptions/{id}/renew`

Toutes les routes protégées appliquent le RBAC par agence : un utilisateur au rôle local (accueil/technicien/livreur/client) ne voit que les ressources de son agence (403 sinon) ; un rôle global (admin, manager) accède à toutes les agences. Elles appliquent aussi le contrôle de licence (`CheckLicenseStatus`) : lecture seule en période de grâce, blocage total (402) une fois la grâce dépassée, sauf `/license*`, `/me` et `/logout`.

## Interface web

SPA React + TypeScript servie par Laravel (voir `resources/js/`). Commandes au comptoir, mode hors-ligne (file IndexedDB + resynchronisation auto), suivi/scan QR, encaissement, fiches clients, gestion des abonnements clients (`/subscriptions`) et de la licence logicielle (`/license`, visible seulement avec la permission `licenses.manage`, portée par le rôle admin).

## Tâches planifiées

```bash
php artisan schedule:work   # en développement, exécute le planning ci-dessous en continu
```

- `licenses:send-reminders` (quotidien 08h00) — rappelle aux administrateurs l'expiration de la licence à J-7/J-1/J0
- `subscriptions:expire` (quotidien 01h00) — bascule les abonnements clients expirés
- `subscriptions:send-reminders` (quotidien 08h00) — rappelle aux clients par e-mail l'expiration de leur abonnement

## État du projet

- [x] Étape 1/7 — Architecture et schéma de base de données
- [x] Étape 2/7 — API du MVP (commandes, clients, facturation)
- [x] Étape 3/7 — Interface web (accueil et administration)
- [ ] Étape 4/7 — Application mobile client (non traitée à la demande de l'utilisateur, étape 5 réalisée avant)
- [x] Étape 5/7 — Licence logicielle et abonnements clients
- [ ] Étape 6/7 — Modules secondaires
- [ ] Étape 7/7 — Déploiement et documentation

# Pressing Manager

Système de gestion multi-agences d'un pressing (Togo). Backend Laravel + PostgreSQL, web React/TypeScript, mobile React Native (Expo).

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour l'architecture globale, le schéma de données, les index et les hypothèses retenues à l'étape 1 du plan de développement.

## Démarrage local

```bash
composer install
cp .env.example .env   # puis renseigner DB_* pour PostgreSQL
php artisan key:generate
php artisan migrate
```

## État du projet

- [x] Étape 1/7 — Architecture et schéma de base de données
- [ ] Étape 2/7 — API du MVP (commandes, clients, facturation)
- [ ] Étape 3/7 — Interface web (accueil et administration)
- [ ] Étape 4/7 — Application mobile client
- [ ] Étape 5/7 — Licence logicielle et abonnements clients
- [ ] Étape 6/7 — Modules secondaires
- [ ] Étape 7/7 — Déploiement et documentation

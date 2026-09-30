# Pressing Manager — notes pour agents

Laravel 12 (API) + React 19/TypeScript (SPA Vite) + PostgreSQL. Multi-agence,
**mono-tenant par déploiement** (une base par client pressing — voir `docs/ARCHITECTURE.md`
hypothèse H1, ne pas remettre en cause sans validation produit).

**Décision d'architecture actée (2026-09-30)** : le Cahier des charges v3.0 vise
Next.js + MySQL/MariaDB + Spatie Permission (voir analyse détaillée référencée en
§2) ; l'utilisateur a tranché explicitement en faveur de la **stack existante**
(React/Vite servi par Laravel, même origine, PostgreSQL, RBAC maison). **Ne pas
migrer vers Next.js/MySQL/Spatie** sauf nouvelle instruction explicite — continuer
tout développement sur la stack actuelle. Les écarts fonctionnels du CDC restent
valides et à traiter (liste et priorités en §2) ; seul le socle technique du CDC
est écarté.

## Référence design : Figma « SPARK PRESSING »

Maquette cible pour la refonte visuelle en cours :
`https://www.figma.com/design/qLFUE1XSamua8im9kINlSB/SPARK-PRESSING--copie-`

- `fileKey` = `qLFUE1XSamua8im9kINlSB`
- Page « 01 - Design System » = node `1:2` — tokens (couleurs, typo, boutons, champs,
  tableaux, cartes, badges, icônes, navigation).
- Page « 02 - Product Screens » = node `1:4` — 17 sections, écrans desktop **et**
  mobile/tablette staff dans la même page (les frames desktop font 1440-1728px de
  large, les mobile/tablette 390-1194px — filtrer par largeur pour isoler le web).

### Tokens déjà extraits et appliqués (commit `cd694b5`)

- **brand** (marque, ancre `brand-600` = Dark Forest `#24483F`) : navigation, boutons
  primaires. Échelle 50-950 générée par interpolation HSL, contrastes WCAG AA
  vérifiés (blanc/brand-600 = 10,1:1 ; sombre : 4,8:1).
- **accent** (ancre `accent-500` = Luxury Gold `#C8A54B`) : CTA premium/sélectifs.
- **ink** = échelle neutre alignée sur le `slate` standard Tailwind (les tokens
  "Neutral" Figma sont littéralement les valeurs slate officielles).
- Police : **Inter** partout (remplace Figtree + Plus Jakarta Sans).
- Danger/erreur : `red` (pas `rose`) pour matcher `#DC2626` du Figma.
- Tout est dans `tailwind.config.js` (commentaire en tête du fichier) — **ne pas
  recréer ces scripts de génération sans relire ce fichier d'abord**.

## Chantiers restants (par priorité)

### 1. Refonte visuelle écran par écran (en cours)
Les tokens sont en place. Procéder page par page, un `get_design_context` par écran
Figma pertinent, en réutilisant les composants partagés (`resources/js/components/ui/`)
plutôt qu'en recréant du HTML brut. **Ne pas fabriquer de données** (pas de cartes KPI
ni de colonnes qui demanderaient de nouveaux agrégats backend non prévus) — rester
honnête sur ce que l'API expose déjà ; voir le commit `408e94e` pour l'exemple suivi.
**Vérifier systématiquement le rendu mobile (390px)** après un passage en layout
colonnes/tableau : un enfant `flex-1` sans `basis-full sm:basis-auto` se fait
écraser par ses voisins au lieu de passer à la ligne (bug rencontré et corrigé sur
`ClientsList.tsx`, commit `08a8922`).
**Pages avec panneau latéral permanent** (formulaire de création à côté de la liste,
comme `ClientsList.tsx`) : la colonne de liste est nettement plus étroite qu'une
page pleine largeur (`OrdersList.tsx`). Un tableau y dépasse vite — enrober
`<div className="overflow-x-auto">` + `min-w-[...]` sur l'en-tête et la liste
plutôt que de laisser les colonnes `flex-1` s'écraser (bug rencontré et corrigé
sur `ServicesPage.tsx`, commit `fc75065`).
**Convention liste/création/édition (écrans admin CRUD)** : quand le Figma montre
un écran dédié distinct pour créer/éditer (pas une modale ni un panneau inline
à côté de la liste), suivre le modèle `/orders/:id` → `OrderDetail.tsx` :
routes `/<ressource>/new` et `/<ressource>/:id/edit` pointant vers un même
composant de formulaire (`<Ressource>FormPage.tsx` dans `pages/<ressource>/`),
avec un lien retour (`ArrowLeft` + texte) vers la liste. Endpoint `GET
/<ressource>/{id}` (show) nécessaire pour charger l'entité de façon robuste au
rechargement de page (ne pas supposer que le formulaire reçoit toujours les
données via navigation React). Voir `ServiceFormPage.tsx` (commit `d52b79b`) —
c'est une correction directe d'un écart introduit lors du premier passage de
restylage (panneau inline + modale), à appliquer d'emblée pour les prochains
écrans CRUD (Utilisateurs, Rôles, etc.) plutôt que de refaire l'erreur.

| Section Figma | Écran(s) | Page(s) actuelle(s) | État |
|---|---|---|---|
| 00 Vue d'ensemble | Dashboard SPARK PRESSING | `pages/DashboardPage.tsx` (route `/dashboard`, 1er lien de la sidebar, permission `reports.view`) | **fait** (2026-09-30) — écran distinct de `/kpi` (la maquette sépare section 00 et section 08). Uniquement des données existantes : `/kpi` période courante + précédente (variations), compteurs `/orders?status=…` (total paginé), `/cash/summary`, `/invoices` (`total_outstanding`), file hors ligne IndexedDB. Blocs sans agrégat backend omis (voir §2). `/` reste « Nouvelle commande » (flux comptoir inchangé). |
| 01 Authentification | Authentification staff | `pages/Login.tsx` | **fait** (2026-09-30) — carte de connexion, pastille réseau réelle, alerte d'inactivité alimentée par `session_timeout_minutes` ; choix d'agence / « se souvenir de moi » / réinitialisation libre-service omis (§2) |
| 02 Dépôts & POS | Gestion des dépôts (liste) | `pages/counter/OrdersList.tsx` | **fait** (commit `408e94e`) |
| 02 Dépôts & POS | Nouveau dépôt (formulaire) | `pages/counter/NewOrder.tsx` | jugé déjà conforme le 2026-09-30 — hérite des tokens, structure (client→catalogue groupé par catégorie→panier sticky) déjà proche de Figma et plus riche (recherche live, remise fidélité auto, conditions de réception, file offline). Ne pas réécrire sans raison concrète. |
| 03 Clients & fidélité | CRM clients (liste) | `pages/clients/ClientsList.tsx` | **fait** (commit `08a8922`) |
| 03 Clients & fidélité | Nouveau/Modifier client | `pages/clients/ClientFormPage.tsx` (routes `/clients/new`, `/clients/:id/edit`) | **fait** (commit `11de473`, écrans séparés depuis commit `eaf68bf`) — a aussi exposé le champ `notes` (backend déjà prêt, jamais affiché côté front) |
| 03 Clients & fidélité | Fiche client (consultation) | panneau détail dans `ClientsList.tsx` | **fait** — reste un panneau latéral sur la liste (pas de retour utilisateur demandant un écran séparé pour la consultation, contrairement à la création/édition) |
| 06 Caisse | Centre de caisse, Nouveau mouvement, Clôture | `pages/cash/CashRegisterPage.tsx`, `pages/cash/CashMovementFormPage.tsx`, `pages/cash/CashClosureFormPage.tsx`, `pages/cash/CashClosureDetail.tsx` (routes `/cash`, `/cash/movements/new`, `/cash/closures/new`, `/cash/closures/:id`) | **fait** — construit sans accès Figma direct (rate-limit MCP atteint), à partir de la description du gap dans ce fichier + conventions POS standards (mouvements manuels entrée/sortie, clôture = comptage vs théorique avec écart) ; à comparer visuellement à la maquette si l'accès Figma est rétabli |
| 07 Articles & tarifs | Catalogue (liste) | `pages/ServicesPage.tsx` | **fait** (commit `fc75065`, écrans séparés depuis commit `d52b79b`) |
| 07 Articles & tarifs | Création/édition article | `pages/services/ServiceFormPage.tsx` (routes `/services/new`, `/services/:id/edit`) | **fait** (commit `d52b79b`) — retour utilisateur du 2026-09-30 : le design a des écrans dédiés séparés de la liste, pas un panneau/modale inline ; voir convention ci-dessous |
| 08 Rapports & bilans | Rapports et bilans | `pages/KpiPage.tsx` (route `/kpi`, libellé nav « Rapports & bilans ») | **fait** (2026-09-30) — filtres période + raccourcis, 4 KPI avec variation vs période précédente, tableau « Performance des agences », indicateurs opérationnels existants conservés (hors maquette mais déjà exposés par l'API), raccourcis vers les écrans détaillés. Histogramme CA / répartition paiements / synthèse fidélité / planification omis (§2) |
| 08 Rapports & bilans | Bilan journalier et performance caissiers | — | **non construit** : quasi intégralement dépendant d'agrégats absents (recettes par mode de paiement et par heure, performance par caissier, remises du jour). Les données existantes (clôture de caisse théorique/compté/écart) sont déjà sur `/cash/closures/:id` ; lien depuis « Rapports détaillés ». Voir §2 |
| 09 Paramètres | Paramètres, Promotions/fidélité, Branding, Notifications | `pages/SettingsPage.tsx`, `pages/LoyaltyPage.tsx`, `pages/NotificationsPage.tsx` | à faire |
| 11 Équipe | Utilisateurs, Rôles & permissions, Profil | `pages/UsersPage.tsx`, `pages/RolesPermissionsPage.tsx`, `pages/ProfilePage.tsx` | à faire |

### 2. Écarts fonctionnels identifiés vs la maquette (backend + frontend à construire)

Gaps vérifiés en code (pas juste visuels) lors de l'audit du 2026-09-30 :

- ~~**Module Caisse** (section 06)~~ **fait** (voir tableau ci-dessus) : modèles
  `CashMovement`/`CashClosure`, service `CashService` (calcule le solde théorique
  depuis la dernière clôture), endpoints `/cash/*`. Le solde théorique d'une
  agence peut légitimement inclure des paiements espèces historiques antérieurs
  à toute clôture (première clôture d'une agence avec déjà de l'activité) —
  normal, pas un bug.
- **Retraits en agence** (section 05) : pas de flux dédié comptoir (file "prêt à
  retirer", remise d'articles, encaissement du solde). Seule la livraison à domicile
  (`DeliveriesPage.tsx`) existe — flux différent.
- ~~**Gestion des agences** (section 10, Multi-agences)~~ **fait** (2026-09-30) :
  CRUD complet (`AgencyController::manage/show/store/update`, permission
  `agencies.manage`), écrans `pages/agencies/AgenciesPage.tsx` (liste, avec
  compteurs staff/clients par agence) et `pages/agencies/AgencyFormPage.tsx`
  (création/édition séparées, routes `/agencies/new` et `/agencies/:id/edit`,
  convention liste/création/édition habituelle). `GET /agencies` (actives
  uniquement, utilisé par le sélecteur d'en-tête) reste inchangé et distinct de
  `GET /agencies/manage` (toutes, paginé, pour cet écran). Construit sans accès
  Figma direct (rate-limit MCP toujours actif) — à comparer visuellement si
  l'accès est rétabli. Toujours **pas de vue consolidée multi-agences** (dashboard
  cross-agences avec devise) — dépend du chantier multi-devise (§2 ci-dessus).
- **Atelier en vue Kanban** (section 04) : `OrdersList.tsx` est une liste filtrable
  par statut, pas un tableau Kanban par étape. Amélioration UX, pas un gap de
  données (le modèle `OrderItemStatus` le permet déjà).
- **Superadmin multi-tenant** (section 13) : la maquette suppose une plateforme SaaS
  où un superadmin gère plusieurs pressings indépendants. **Notre architecture est
  explicitement mono-tenant** (voir `docs/ARCHITECTURE.md`). Ne pas coder cette
  section sans clarifier au préalable si c'est une réinterprétation (l'admin global
  actuel = ce superadmin) ou un vrai chantier multi-tenant — décision produit à
  prendre avec l'utilisateur avant tout code. **Confirmé par le CDC v3.0** (EF-SUP-01
  à 04) : Spark (l'éditeur) y est bien un superadmin plateforme avec CRUD `pressings`
  — cette question (mono-tenant vs multi-tenant) reste ouverte, **distincte** du choix
  de stack technique tranché ci-dessous (on peut garder React/Vite + PostgreSQL tout
  en devenant multi-tenant, ou rester mono-tenant — les deux sont orthogonaux).

### Écarts identifiés par le Cahier des charges v3.0 (analyse du 2026-09-30)

Le CDC (`Spark_Pressing_CDC_v3.0.pdf`, fourni par l'utilisateur) décrit une cible
plus large que la maquette Figma seule. Analyse complète et argumentée :
[Spark Pressing — CDC v3.0 vs existant](https://claude.ai/artifact/1KQnYZsD1joHDmYcZUDiCF).
**Point d'architecture tranché (2026-09-30)** : le CDC §7 visait Next.js +
MySQL/MariaDB + Spatie Permission (front/back découplés) ; l'utilisateur a choisi de
**continuer sur la stack existante** (React/Vite même origine que l'API Laravel,
PostgreSQL, RBAC maison) — voir la décision actée en tête de ce fichier. Ne pas
proposer de migration vers la stack du CDC.

Écarts fonctionnels (hors question d'architecture), par ordre de priorité suggéré :

1. **Multi-devise et tarification historisée par agence** (CDC §8, EF-DEV-01 à 05) —
   le plus structurant. Manque : `currency_code` (ISO 4217) sur `agencies` ; une vraie
   `price_list` (agence × article × service × prix × devise × **date d'effet**), alors
   qu'aujourd'hui `agency_services.price_override` est un prix courant unique sans
   historique — changer un tarif ne doit jamais modifier le montant d'une facture déjà
   émise (non négociable, §8.2). Condition préalable au reporting consolidé
   multi-agences.
2. **Séparation Article × Service avec règles de ratio de prix automatiques** (CDC
   §11.1-11.3) — le CDC distingue le catalogue d'Articles (vêtements, global) du
   Service (type de prestation : classique/express/repassage…, avec des règles du
   type express = classique × 1,5). L'existant conflate les deux dans un seul modèle
   `Service` (nom, code, catégorie, prix) ; pas de règle de calcul automatique, pas
   d'import Excel du catalogue/prix (EF-ART-03, §11.5).
3. **Tournées de livraison et encaissement mobile** (CDC §10.15, EF-LIV-01 et 03) —
   `Delivery` existe (photo, signature, statuts, `livreur_id`) mais sans regroupement
   en tournée (`delivery_round`) et sans collecte du solde restant à la livraison
   (`DeliveryController::complete()` ne gère aucun paiement, vérifié en code).
4. **Moteur de règles marketing génériques** (CDC §11.4, EF-CFG-10, EF-CLI-06) —
   remplacerait à terme les paliers de fidélité actuels (`LoyaltyTier`, simple
   seuil de points → taux de remise) par un moteur paramétrable (type : bienvenue,
   palier, saisonnière, volume, code promo, parrainage ; condition JSON ; cumulable ;
   portée pressing ou agence). Aucun système de codes promo n'existe aujourd'hui.
5. **QR par lot** (CDC §11.6) : le QR existant est généré par article (`order_items.qr_code`,
   toujours actif) mais pas regroupable en "lot" pour plusieurs vêtements d'un même
   dépôt, et pas configurable en option par agence comme le prévoit le CDC.
6. **Blocage du retrait si impayé, configurable par agence** (EF-RET-05) — à vérifier
   dans `OrderController`/`RetrieveController` si c'est aujourd'hui figé ou déjà
   paramétrable ; non confirmé lors de l'analyse.

Points notables où l'existant est **en avance** sur le phasage du CDC (construit avant
que ce document n'existe, sur demande utilisateur directe) : file hors ligne au
comptoir (le CDC la met hors périmètre v1, §4.2), rôle Livreur (le CDC l'envisage en
MVP ou Phase 2, à trancher), notifications SMS/e-mail (le CDC les met en Phase 3).
Ne pas les retirer sans raison — documenter plutôt l'écart de phasage auprès du
Product Owner.

#### Éléments de maquette omis faute de données (refonte écran par écran, 2026-09-30)

Relevés pendant le restylage des écrans restants. Rien de tout cela n'a été simulé
côté front : chaque élément a été **omis** et attend le backend décrit ici.

**01 Authentification** (node `43:3`)
- Sélecteur d'agence à la connexion : `POST /login` n'accepte pas d'`agency_id`
  (l'agence découle de `users.agency_id`, un global la choisit après connexion dans
  l'en-tête). Il faudrait un champ optionnel `agency_id` validé contre les agences
  autorisées + une notion d'« agence de session » côté API.
- Case « Se souvenir de moi » : jetons Sanctum sans expiration différenciée ; il
  faudrait une durée de vie de jeton paramétrable (courte vs longue) choisie au login.
- Carte « Réinitialisation » (lien de reset par e-mail ou code SMS) : aucun flux
  mot de passe oublié en libre-service. Il faudrait `POST /password/forgot`
  (e-mail/SMS, jeton à durée limitée, throttling) + `POST /password/reset`, et un
  canal SMS réel (seul un envoi simulé existe dans `NotificationService`).
- Visuel photo « Atelier premium » du panneau de marque : asset Figma non
  récupérable (quota MCP) — remplacé par le dégradé de marque existant.

**00 Vue d'ensemble** (node `1:13`)
- Graphique « Revenus réseau » (courbe sur 7 dates + infobulle) : il faudrait
  `GET /kpi/revenue-series?from&to&granularity=day|week|month[&agency_id]` renvoyant
  `[{date, revenue}]` (somme des `payments.amount` complets groupée par jour de `paid_at`).
- Évolution sur les cartes « Prêts à retirer » et « Abonnements actifs » : ce sont
  des instantanés ; une variation demanderait un historique (snapshots quotidiens).
- Libellé exact de la 4e carte (icône heart-handshake) inconnu (textes Figma non
  lisibles hors quota) : affiché = abonnements actifs, seule donnée « fidélisation »
  agrégée existante.
- Pipeline atelier : la maquette compte des **pièces** par étape et a une étape
  « finition » (sparkles) ; l'API ne filtre que des **commandes** par statut et le
  workflow n'a pas d'étape finition. Il faudrait `GET /order-items/counts-by-status`
  (et une étape `finition` si le métier la veut).
- Alerte de délai (« X dépôts en retard ») : pas de filtre « en retard ». Il faudrait
  `GET /orders?overdue=1` (`promised_at < now()` et statut ∉ {pret, livre, annule}) ou
  un compteur dédié.
- Flux de caisse — répartition par mode de paiement (3 barres) : il faudrait un
  agrégat `payments` complets groupés par `method` sur la période
  (`GET /kpi` → `payments_by_method: {espece, carte, flooz, tmoney}` — valeurs de
  l'enum `payments.method`).
- Flux de caisse sans agence sélectionnée : `/cash/summary` exige une agence ; pas de
  vue consolidée multi-agences de la caisse.
- Impayés — « dépôts en retard », « à traiter aujourd'hui » et tranches d'ancienneté
  0-30 / 31-89 / 90+ jours : il faudrait que `GET /invoices` renvoie
  `aging: [{bucket, amount, count}]` calculé sur `issued_at`.
- Journal « Activité récente » multi-évènements (dépôt, prêt, scan, reçu, finition) :
  pas de flux d'évènements ; remplacé par « Derniers dépôts » (`/orders`). Il faudrait
  une table d'audit/évènements + `GET /activity?limit=`.
- Synchronisation — « dernière synchro » et opérations autres que des dépôts
  (encaissements, fiches client) : la file hors ligne ne stocke que des commandes et
  n'horodate pas les synchronisations réussies.

**08 Rapports et bilans** (node `43:774`)
- Bouton « Planifier » (envoi programmé de rapports) : aucun planificateur. Il faudrait
  un modèle `ReportSchedule` + commande planifiée + envoi e-mail.
- Histogramme « Évolution du chiffre d'affaires » (onglets jour/semaine/mois, 12 barres,
  légende) : même série temporelle que ci-dessus (`/kpi/revenue-series`).
- Carte « Répartition — Paiements » (donut 4 modes) et « Caisse » (3 légendes) :
  agrégat par mode de paiement sur la période (voir ci-dessus).
- Tableau « Performance des agences » — colonne statut (pastille) : remplacée par la
  variation réelle du CA vs période précédente ; la règle métier du statut
  (« En hausse », « À surveiller »…) n'est pas définie.
- Carte « Fidélité » (valeur + 3 légendes) : il faudrait un agrégat clients par palier
  et points émis/consommés sur la période (voir section 09).
- Sélecteur « comparer à » / 3e filtre : la comparaison est fixée à la période
  précédente de même durée.

**08 Bilan journalier et performance caissiers** (node `43:1144`) — écran non construit :
- Recettes par mode de paiement et par tranche horaire (histogramme 8 barres + 4
  totaux mobile money / espèces / carte / virement) : `GET /reports/daily?date&agency_id`
  avec `payments_by_method` et `payments_by_hour`.
- Mouvements « hors dépôt » (entrées, sorties, livraisons, ajustements) et écart de
  caisse du jour : partiellement disponibles (`/cash/movements`, `/cash/closures`)
  mais pas agrégés par jour ; à inclure dans le même endpoint.
- Soldés / impayés du jour et remises accordées : agrégats factures du jour + somme
  des remises (colonne `orders.discount_amount`, déjà en base) par jour.
- Tableau « Performance des caissiers » (CA encaissé, nb tickets, panier moyen,
  progression vs objectif, statut de session) : la colonne `payments.received_by`
  existe, il faudrait l'agréger par utilisateur dans un endpoint ; la notion de
  session de caisse par caissier et les objectifs n'existent pas du tout.

Le catalogue articles/tarifs (CRUD) et la sidebar de navigation groupée, qui étaient
dans une version précédente de cette liste, sont **déjà faits** (commits `7dd2fae`,
`0e2ffdb`).

## Conventions établies dans ce projet (à respecter)

- **Discipline par module** : backend → tests backend → frontend → valider
  (`tsc --noEmit`, `npm run build`, `php artisan test`, parité i18n, smoke test
  Playwright) → commit → push → **stop pour validation utilisateur**. Ne pas
  enchaîner plusieurs modules sans repasser par l'utilisateur.
- **i18n** : `resources/js/i18n/fr.json` et `en.json` doivent rester en parité
  stricte (mêmes clés). Vérifier avec un script Node avant de committer.
- **Paramètres singleton** (`AppSetting::current()`) : ne jamais chercher par id
  codé en dur (dérive des séquences Postgres entre transactions de test). Utiliser
  `static::query()->first() ?? static::create([...])` puis `->refresh()` après
  `create()`.
- **Accessibilité couleurs** : toute nouvelle couleur de texte/fond doit être
  vérifiée WCAG AA (≥ 4,5:1 texte courant, ≥ 3:1 composants). Le script de
  génération de palette (interpolation HSL + calcul de contraste) utilisé pour les
  tokens `brand`/`accent` peut être réécrit au besoin — voir la méthode dans
  l'historique de `tailwind.config.js`.
- **Fusion avec d'autres sessions** : plusieurs agents peuvent travailler sur ce
  repo en parallèle (constaté le 2026-09-30, deux commits poussés pendant une
  session). Toujours `git fetch` + merger (jamais rebase/force-push sur `master`)
  avant de pousser, et relancer la suite de validation complète après fusion.
- **Piège Eloquent : ne jamais nommer une relation comme une colonne FK existante**
  (ex. une relation `createdBy()` sur un modèle qui a une colonne `created_by`).
  `Model::toArray()` fait `array_merge(attributesToArray(), relationsToArray())` —
  la relation chargée (snake_case du nom de méthode) écrase silencieusement la
  valeur brute de la colonne dans le JSON, et peut même faire fuiter les
  `$appends` du modèle lié (ex. `User::$appends`) même avec un `select()` limité
  dans le `with()`. Nommer la relation différemment (`creator()`, `closer()`…).
  Bug détecté et corrigé avant publication sur `CashMovement`/`CashClosure`
  (commit du module Caisse) — vérifier ce pattern sur toute nouvelle relation
  `xxx_by`.
- **Bug corrigé en marge du chantier clients (commit `eaf68bf`)** : `Client::create()`
  ne reflète pas en mémoire le défaut DB de `loyalty_points` (0), donc l'accesseur
  `loyaltyDiscountRate()` plantait la sérialisation JSON à chaque création de
  client sans `loyalty_points` explicite. Toujours `->refresh()` après un
  `Model::create()` dont la réponse JSON dépend d'un accesseur qui lit une colonne
  à défaut DB (pas fournie explicitement à `create()`).

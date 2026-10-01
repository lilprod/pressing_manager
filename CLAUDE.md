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
**Grilles de `StatCard` avec des montants (FCFA)** : ne jamais démarrer à `grid-cols-2`
dès le mobile — `StatCard` tronque sa valeur (`truncate`), et un montant à 6-7
caractères (« 177 310 FCFA ») ne tient pas dans la moitié d'un écran à 390px.
Toujours `grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-4` (ou `grid-cols-1
sm:grid-cols-N` selon le nombre de cartes) pour les grilles de cartes dont au moins
une valeur est un montant ; `grid-cols-2` direct reste correct uniquement pour des
valeurs courtes (compteurs). Bug rencontré deux fois le même jour (2026-10-01, sur
`OrdersList.tsx` et `ClientDetailPage.tsx`) — toujours vérifier par capture Playwright
à 390px, pas seulement à l'œil sur le code.
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
| 02 Dépôts & POS | Gestion des dépôts (liste) | `pages/counter/OrdersList.tsx` | **fait** (commit `408e94e`), KPI en-tête ajoutés le 2026-10-01 (voir détail en §2) |
| 02 Dépôts & POS | Nouveau dépôt (formulaire) | `pages/counter/NewOrder.tsx` | jugé déjà conforme le 2026-09-30 — hérite des tokens, structure (client→catalogue groupé par catégorie→panier sticky) déjà proche de Figma et plus riche (recherche live, remise fidélité auto, conditions de réception, file offline). Ne pas réécrire sans raison concrète. |
| 03 Clients & fidélité | CRM clients (liste) | `pages/clients/ClientsList.tsx` | **fait** (commit `08a8922`), KPI en-tête ajoutés le 2026-10-01 (voir détail en §2) |
| 03 Clients & fidélité | Nouveau/Modifier client | `pages/clients/ClientFormPage.tsx` (routes `/clients/new`, `/clients/:id/edit`) | **fait, renforcement livré** (2026-10-01) — mise en page à deux colonnes conforme aux nouvelles captures (contrôle de doublon temps réel, consentements SMS/e-mail, préférence de contact, ville/quartier, téléphone secondaire, code de parrainage, groupe de fidélité en lecture seule, agence de référence, « Enregistrer et créer un dépôt »), détail en §2 « Formulaire client enrichi » |
| 03 Clients & fidélité | Fiche client (consultation) | `pages/clients/ClientDetailPage.tsx` (route `/clients/:id`) | **fait** (2026-10-01) — remplace l'ancien panneau latéral par un écran dédié, suite à la capture Figma fournie le 2026-10-01 montrant 4 KPI (détail en §2) |
| 04 Atelier | Atelier en vue Kanban | `pages/atelier/AtelierBoard.tsx` (route `/atelier`, permission `orders.update_status`) | **fait** (2026-10-01) — 4 colonnes Kanban sur les statuts réels, capacité atelier, priorité, responsables Laveur/Classeur, panneau de dépôt avec chronologie et action « Passer à l'étape suivante » (détail complet en §2) |
| 06 Caisse | Centre de caisse, Nouveau mouvement, Clôture | `pages/cash/CashRegisterPage.tsx`, `pages/cash/CashMovementFormPage.tsx`, `pages/cash/CashClosureFormPage.tsx`, `pages/cash/CashClosureDetail.tsx` (routes `/cash`, `/cash/movements/new`, `/cash/closures/new`, `/cash/closures/:id`) | **fait, renforcement livré** (2026-10-01) — rapprochement par moyen de paiement (espèces/mobile money/carte), checklist de clôture obligatoire, double contrôle sur mouvement sensible (seuil configurable), pièces justificatives, rapport PDF de clôture. Restent différés : distinction dépôt/solde sur `Payment`, vue « opérateurs de la journée », notification au contrôleur (aucun canal interne staff n'existe) — détail en §2 |
| 07 Articles & tarifs | Catalogue (liste) | `pages/ServicesPage.tsx` | **fait, renforcement livré** (2026-10-01) — tableau de bord (4 `StatCard` via `/services/stats`), badge mode de facturation + « Dès X FCFA/kg ». Restent différés : import Excel, onglets Catégories/Tarifs au kilo/Indisponibles/Historique, filtres avancés (détail §2) |
| 07 Articles & tarifs | Création/édition article | `pages/services/ServiceFormPage.tsx` (routes `/services/new`, `/services/:id/edit`) | **fait, renforcement livré** (2026-10-01) — sélecteur Pièce/Kilo/Mixte, grilles de prix dégressives au kilo (`ServicePriceTier`), options `allow_discount`/`round_to_hundred`/`price_editable_at_counter`, historique des changements de prix (`ServicePriceHistory`). Intégré jusqu'au comptoir : `NewOrder.tsx` facture réellement au poids (résolution de palier + arrondi). Restent différés : états acceptés/rendus compatibles configurables, disponibilité par agence récapitulative, checklist de publication, historique des tarifs par agence (détail §2) |
| 08 Rapports & bilans | Rapports et bilans | `pages/KpiPage.tsx` (route `/kpi`, libellé nav « Rapports & bilans ») | **fait** (2026-09-30) — filtres période + raccourcis, 4 KPI avec variation vs période précédente, tableau « Performance des agences », indicateurs opérationnels existants conservés (hors maquette mais déjà exposés par l'API), raccourcis vers les écrans détaillés. Histogramme CA / répartition paiements / synthèse fidélité / planification omis (§2) |
| 08 Rapports & bilans | Bilan journalier et performance caissiers | — | **non construit** : quasi intégralement dépendant d'agrégats absents (recettes par mode de paiement et par heure, performance par caissier, remises du jour). Les données existantes (clôture de caisse théorique/compté/écart) sont déjà sur `/cash/closures/:id` ; lien depuis « Rapports détaillés ». Voir §2 |
| 10 Multi-agences | Vue consolidée multi-agences, détail par agence | `pages/multiagency/MultiAgencyOverviewPage.tsx` (route `/multi-agences`), `MultiAgencyDetailPage.tsx` (`/multi-agences/:id`), permission `reports.view` | **fait** (2026-10-01) — KPI réseau, évolution du CA, classement et comparaison inter-agences, alertes opérationnelles, détail par agence (atelier, comparaison au réseau, clients/fidélité, retards/impayés, équipe présente, historique récent) — tout dérivé de données réelles, aucun objectif/cible ni statut « en ligne » fabriqué (détail complet en §2) |
| 09 Paramètres | Paramètres (hub) | `pages/SettingsPage.tsx` (route `/settings`) | **fait** (2026-09-30) — l'ancien formulaire unique devient un hub : recherche + filtres par groupe, « État de configuration » (checklist d'identité réelle, `lib/brandingChecklist.ts`), cartes vers les écrans existants uniquement (gating par permission, y compris « Agences » vers le CRUD livré en parallèle), « Mis à jour le » via `updated_at` (colonne existante, désormais exposée par `GET /settings`) |
| 09 Paramètres | Branding du pressing | `pages/settings/BrandingSettingsPage.tsx` (route `/settings/branding`) | **fait** (2026-09-30) — nom, logo, favicon, coordonnées + NIF, aperçu en direct (en-tête app + documents), checklist, barre « non enregistré » ; enregistrement partiel de `/settings` (testé) |
| 09 Paramètres | Sécurité (politique de mots de passe) | `pages/settings/SecuritySettingsPage.tsx` (route `/settings/security`) | **fait** (2026-09-30) — pas d'écran dédié dans la maquette : mise en page calquée sur « Paramètres opérationnels » (node `25:12525`, champs suffixés + bascules). Les réglages opérationnels eux-mêmes (codes agence, délais, workflow, tarification) n'existent pas (§2) |
| 09 Paramètres | Promotions et fidélité | `pages/LoyaltyPage.tsx` (route `/loyalty`) | **fait** (2026-09-30) — volet fidélité seulement : KPI dérivés de la config (paliers actifs, remise max, règle d'acquisition réelle via `loyalty_amount_per_point` exposé par `GET /settings`), paliers éditables en ligne (le `PATCH /loyalty-tiers/{id}` existait sans UI d'édition). Volet promotions entièrement absent du backend (§2) |
| 09 Paramètres | Notifications | `pages/NotificationsPage.tsx` (route `/notifications`) | **fait** (2026-09-30) — cartes d'état des canaux (comptes réels d'évènements activés, passerelle SMS « non connectée » = état réel), matrice évènement × SMS/e-mail avec interrupteurs, journal filtrable |
| 11 Équipe | Utilisateurs et équipe | `pages/UsersPage.tsx` (route `/users`) | **fait** (2026-09-30) — annuaire en tableau (`table-fixed`, `overflow-x-auto`) + panneau latéral création/édition (la maquette montre un panneau à côté de la liste, **pas** un écran dédié : la convention `/<ressource>/new` ne s'applique donc pas ; l'ancienne modale d'édition est remplacée par ce panneau), filtre par rôle (serveur), colonne « Dernière activité » = `last_active_at` (max de `personal_access_tokens.last_used_at`, déjà tenu par Sanctum, exposé par `GET /users?full=1`, testé) |
| 11 Équipe | Rôles et permissions | `pages/RolesPermissionsPage.tsx` (route `/roles-permissions`) | **fait** (2026-09-30) — cartes de rôles (`users_count` via `withCount('users')`, testé), configuration du rôle sélectionné en ligne (remplace la modale), duplication (création pré-remplie via `POST /roles`), matrice domaines × rôles (complet / partiel k/n / aucun), utilisateurs concernés (`/users?role=`) |
| 11 Équipe | Profil et sécurité | `pages/ProfilePage.tsx` (route `/profile`) | **fait** (2026-09-30) — résumé (photo avec bouton caméra, rôle, affectation, expiration réelle du mot de passe), coordonnées, rôle en lecture seule, préférences langue/thème (déjà gérées côté client), changement de mot de passe avec robustesse calculée sur la politique réelle |

### 2. Écarts fonctionnels identifiés vs la maquette (backend + frontend à construire)

Gaps vérifiés en code (pas juste visuels) lors de l'audit du 2026-09-30 :

- ~~**Module Caisse** (section 06)~~ **fait** (voir tableau ci-dessus) : modèles
  `CashMovement`/`CashClosure`, service `CashService` (calcule le solde théorique
  depuis la dernière clôture), endpoints `/cash/*`. Le solde théorique d'une
  agence peut légitimement inclure des paiements espèces historiques antérieurs
  à toute clôture (première clôture d'une agence avec déjà de l'activité) —
  normal, pas un bug.
- ~~**Retraits en agence**~~ **fait** (2026-10-01) : `PickupService` (retrait total ou
  partiel pièce par pièce via `order_items.quantity_delivered`, blocage automatique si
  solde impayé avec dérogation motivée et tracée, réceptionnaire client/tiers, état des
  pièces), tables `order_pickups`/`order_pickup_items`, endpoints `/pickups`,
  `/pickups/summary`, `POST /orders/{id}/pickups`, écrans `pages/pickups/PickupsList.tsx`
  (route `/pickups`, « Centre de retrait ») et `PickupProcessPage.tsx` (route
  `/pickups/:orderId`, « Traiter le retrait »). Corrige au passage un bug préexistant
  réel : `orders.status` n'était jamais mis à jour après la création (toujours `recu`),
  ce qui aurait empêché ce module de fonctionner — voir `OrderStatusSynchronizer`,
  détail en §« 05 Retraits en agence » ci-dessous. L'écran « Ticket et facture »
  (prévisualisation/impression dédiée) est **fait** (2026-10-01, voir détail plus bas) ;
  l'envoi WhatsApp et l'écran de supervision de la synchronisation hors ligne, montrés
  sur les mêmes captures, restent **non construits** — à reprendre si prioritaire.
- ~~**Gestion des agences** (section 10, Multi-agences)~~ **fait** (2026-09-30) :
  CRUD complet (`AgencyController::manage/show/store/update`, permission
  `agencies.manage`), écrans `pages/agencies/AgenciesPage.tsx` (liste, avec
  compteurs staff/clients par agence) et `pages/agencies/AgencyFormPage.tsx`
  (création/édition séparées, routes `/agencies/new` et `/agencies/:id/edit`,
  convention liste/création/édition habituelle). `GET /agencies` (actives
  uniquement, utilisé par le sélecteur d'en-tête) reste inchangé et distinct de
  `GET /agencies/manage` (toutes, paginé, pour cet écran). Construit sans accès
  Figma direct (rate-limit MCP toujours actif) — à comparer visuellement si
  l'accès est rétabli. ~~Toujours pas de vue consolidée multi-agences~~ **fait**
  (2026-10-01, voir détail complet en §2 « Vue consolidée multi-agences » ci-dessous) :
  `pages/multiagency/MultiAgencyOverviewPage.tsx` (route `/multi-agences`) et
  `MultiAgencyDetailPage.tsx` (`/multi-agences/:id`) — sans la dimension multi-devise
  (toujours FCFA uniquement, le chantier multi-devise §2 reste entier).
- ~~**Atelier en vue Kanban** (section 04)~~ **fait** (2026-10-01, détail complet en
  §2 « 04 Atelier » ci-dessous) : `pages/atelier/AtelierBoard.tsx` (route `/atelier`).
  4 colonnes qui **regroupent les vrais statuts existants** de `order.status`
  (`recu`/`trie`→En attente, `en_traitement`→En cours, `controle_qualite`→Traités,
  `pret`→Classés) plutôt que d'inventer un statut parallèle. Deux champs réellement
  nouveaux : `orders.priority` (urgent/haute/normale, défaut dérivé de `is_express` à
  la création, modifiable ensuite) et `orders.washer_id`/`sorter_id` (responsable
  Laveur/Classeur, par dépôt). `agencies.workshop_capacity` (nullable, repli sur
  `config('atelier.default_capacity')` = 24) pour la barre de capacité — compte réel
  des dépôts actifs de l'agence (statuts recu→pret), pas une valeur fabriquée par
  agence tant qu'elle n'est pas configurée.
- ~~**Superadmin multi-tenant** (section 13)~~ **Phase 1 faite** (2026-10-02, détail
  complet ci-dessous en §« Plateforme superadmin »). La maquette suppose une
  plateforme SaaS où un superadmin Spark gère plusieurs pressings indépendants —
  question tranchée avec l'utilisateur via `AskUserQuestion` (« vrai multi-tenant »,
  pas une réinterprétation de l'admin global existant ni une maquette statique) :
  **confirmé par le CDC v3.0** (EF-SUP-01 à 04), orthogonal au choix de stack
  technique tranché ci-dessus (React/Vite + PostgreSQL conservés). Fondations
  (authentification plateforme + MFA, registre des pressings, tableau de bord)
  livrées ; écrans Utilisateurs transverses et Agences cross-tenant différés
  (dépendent d'un canal de configuration plateforme→tenant qui n'existe pas encore).

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
2. ~~**Séparation Article × Service avec règles de ratio de prix automatiques**~~
   **fait, scope additif** (2026-10-01, détail complet ci-dessous en §« Types de
   traitement ») : CDC §11.1-11.3 — le CDC distingue le catalogue d'Articles
   (vêtements, global) du Service (type de prestation : classique/express/
   repassage…, avec des règles du type express = classique × 1,5). Plutôt que de
   scinder le modèle `Service` existant (risqué : renommage/migration de données
   sur un modèle référencé partout dans le pipeline commande/prix/ticket/facture),
   nouveau référentiel parallèle `treatment_types` (ratio de prix appliqué
   automatiquement, optionnel par ligne de commande). Import Excel du catalogue/prix
   (EF-ART-03, §11.5) reste **différé**, non traité par cette passe.
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
6. **Blocage du retrait si impayé, configurable par agence** (EF-RET-05) — **confirmé
   non implémenté** (captures Figma « Paramètres opérationnels » fournies par
   l'utilisateur le 2026-09-30, cf. node `25:12525` ci-dessous : bascule explicite
   « Bloquer le retrait en cas d'impayé »). Aucun champ en base pour ce jour ; fait
   partie du même chantier « réglages par agence » que les codes dépôt et les modes
   de tarification.

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

**09 Paramètres — hub** (node `25:12184`)
- Bouton « Historique » et journal « Dernières modifications » (date, détail, auteur,
  badge) : **revu le 2026-10-01, plus simple que prévu** — pas besoin d'une nouvelle
  table `settings_audits` dédiée : le système d'audit générique `AuditLog`/`Auditable`
  existe déjà (voir « Conventions établies » ci-dessus) et couvre exactement ce besoin.
  Il suffirait d'ajouter `use Auditable;` à `AppSetting` (et `Role`/`Permission` pour
  le gap équivalent noté en §11 ci-dessous) puis de réutiliser `AuditLogController`/
  `lib/auditLog.ts` déjà construits pour la fiche dépôt — reste à faire : ajouter
  `app_setting`/`role` à `AuditLogController::TYPES`, et un lien/filtre dédié sur cet
  écran vers `/audit-logs?type=app_setting`. Non fait ici (hors scope de cette passe,
  mais le coût réel est maintenant faible, à reprioriser).
- Cartes de catégories sans écran/backend, omises : **Numérotation** (hash — préfixes/format des
  n° de commande et facture ; `OrderNumberGenerator` est codé en dur), **Horaires et
  délais** (clock-3 — horaires d'ouverture, délais standard/express par défaut),
  **Promotions** (ticket-percent — voir ci-dessous), **Workflow atelier** (workflow —
  étapes activables), **Tarifs et devise** (badge-cent — devise/TVA : `tax_rate` vient
  de `config/invoicing.php`, non éditable), **Paiements** (credit-card — moyens de
  paiement activés, clés opérateurs Flooz/T-Money : aujourd'hui en `.env`),
  **Mode hors ligne** (cloud-off — politique de rétention/synchro).
- Badges d'état et date de mise à jour par catégorie : n'existent que pour les
  réglages portés par `app_settings` (branding, sécurité). Les autres modules n'ont
  pas de notion « configuré / à compléter ».

**09 Paramètres opérationnels** (node `25:12525`) — écran non construit, aucun champ
en base : codes agence (préfixe + séquence + aperçu, par agence), délais (standard,
express, retrait max en jours) + bascules, options atelier et aperçu du workflow à
6 étapes, mode de tarification (3 options) + prix/frais (frais express, livraison,
minimum de commande), rétention hors ligne, journal des modifications. Il faudrait
une table de réglages par agence (`agency_settings`) + endpoints `GET/PATCH
/agencies/{id}/settings`.

**09 Branding du pressing** (node `72:21182`)
- Palette personnalisable (couleur principale / secondaire + contrôle
  d'accessibilité) : pas de colonnes `primary_color`/`accent_color` ; les couleurs
  sont des tokens Tailwind compilés. Exigerait des variables CSS runtime + validation
  de contraste côté API.
- Champ « Site web » (globe) et zone de texte (mentions / pied de page des documents) :
  colonnes `website` et `document_footer` absentes d'`app_settings`.
- « Modèles de documents » (ticket, facture : statut + 2 options) : pas de
  paramétrage des gabarits (format papier, mentions, afficher/masquer le QR…).
- Aperçu « mobile client » : l'app mobile client (section 14) n'existe pas.

**09 Promotions et fidélité** (node `72:20021`)
- Tout le volet **promotions** : formulaire de création (code, type/valeur de remise,
  période début/fin, quota global/par client, agences, cumulable), tableau des
  promotions (code, remise, période, quota, utilisation avec progression, agences,
  statut) et filtres. Il faudrait un modèle `Promotion` (+ pivot agences, table
  d'utilisations) et son application dans `OrderController::store`.
- Indicateurs membres / points émis / points utilisés / taux de remise / campagnes :
  il faudrait `GET /loyalty/stats` (nb clients par palier, somme des points, points
  crédités/consommés sur la période — la consommation de points n'existe pas : la
  remise de palier est appliquée sans débit de points).
- Carte « Règles » éditable (montant par point, seuils, bascule) : la règle est
  `config('loyalty.amount_per_point')` (env), affichée en lecture seule.
- « Activité fidélité » (mouvements de points par client, motif, date) : aucun
  historique, seul `clients.loyalty_points` (cumul) est stocké. Il faudrait une table
  `loyalty_point_movements` écrite par `LoyaltyService`.
- « Répartition des membres par palier » : agrégat clients par palier à ajouter à
  `/loyalty/stats`.
- Bouton « Exporter » : pas d'export fidélité.

**09 Notifications** (node `72:21413`)
- 4 évènements supplémentaires sur 7 dans la maquette : seuls `order_ready`,
  `delivery_completed`, `delivery_failed` existent (`NotificationSetting::EVENTS`).
  Candidats : dépôt reçu, rappel de retrait, facture impayée, promotion — chacun
  demande un déclencheur côté backend.
- Colonne « Portée » par évènement : les réglages sont par agence uniquement (portée
  affichée une fois, pour l'agence courante).
- « Envoyer un test » : pas d'endpoint `POST /notifications/test`.
- Éditeur de modèle (objet, corps, variables `{client}`, `{commande}`…, aperçu SMS) :
  les messages sont codés dans les classes `Notification` ; il faudrait une table
  `notification_templates` (agence × évènement × canal).
- Heures calmes (plage horaire + exception), options d'envoi (3 bascules),
  configuration du fournisseur SMS (expéditeur, clé, test de connexion) : rien en base,
  et aucune passerelle SMS réelle (envois simulés).
- Mesures par canal (envoyés / échecs / taux sur la période) : il faudrait un agrégat
  `GET /notification-logs/stats?from&to` groupé par canal et statut.
- « Exporter » le journal : pas d'export.

**11 Utilisateurs et équipe** (node `43:1497`)
- Bouton « Importer » (upload) : pas d'import CSV de comptes.
- 4 cartes d'indicateurs (membres, rôle/icône user-star, invitations en attente,
  connexions) avec variation : il faudrait `GET /users/stats` (total, actifs,
  `must_change_password`, connexions sur la période — cette dernière demande un
  journal de connexions, voir ci-dessous).
- Onglets par statut (tous / actifs / invitations / désactivés), recherche texte et
  filtre de statut : `GET /users?full=1` ne filtre que par `role` et `agency_id`.
  Ajouter `search`, `status=active|inactive|pending` à `indexForAdmin`.
- Tri « Jour / Semaine / Mois » des résultats : sémantique non définie sans journal
  de connexions.
- Panneau de création : cases « agences autorisées » multiples → le modèle n'a qu'un
  `users.agency_id` ; il faudrait un pivot `agency_user`. Envoi d'une **invitation par
  e-mail** : aujourd'hui un mot de passe temporaire est affiché à l'admin.
- « Activité récente » (connexion, changement d'agence, nouvel appareil, session
  expirée) : aucun journal d'authentification. Il faudrait une table `auth_events`
  (type, user, IP, user-agent, date) alimentée au login/logout/expiration.

**11 Rôles et permissions** (node `43:1850`)
- Onglets et 3 sélecteurs de portée dans « Configuration » (portée fine par agence /
  périmètre de données) : une permission est globale au rôle ; la portée se limite à
  `roles.scope` (global/agency/flexible).
- Pastille de statut par rôle (actif/brouillon ?) et alerte contextuelle détaillée :
  pas de statut de rôle en base.
- Journal des modifications de droits : pas d'audit (même besoin que `settings_audits`).

**11 Profil et sécurité** (node `65:22067`)
- Prénom / nom en deux champs : un seul `users.name`.
- « Dernière connexion » + origine (appareil/IP) : pas de journal d'authentification
  (`auth_events`, voir ci-dessus) ; seul `last_used_at` du jeton existe.
- Sélecteurs de rôle/agences éditables et « agences autorisées » : lecture seule ici
  (modification par un admin via `/users`) ; multi-agences absent (pivot à créer).
- 3 préférences à bascule (notifications personnelles, etc.) : pas de préférences
  utilisateur côté serveur (langue/thème sont stockés en local sur l'appareil).
- **Authentification renforcée (MFA)** : rien (il faudrait TOTP : secret chiffré,
  codes de secours, étape de vérification au login).
- **Sessions actives** (liste + « Déconnecter les autres sessions ») : les jetons
  Sanctum existent en base mais aucun endpoint ; il faudrait `GET /profile/sessions`
  (`personal_access_tokens` de l'utilisateur : nom, `last_used_at`, création) et
  `DELETE /profile/sessions/{id}` / `DELETE /profile/sessions` (sauf le courant).
  Pour afficher appareil/IP, stocker IP + user-agent à la création du jeton.
- **Appareils autorisés** : notion absente.

**05 Retraits en agence — Centre de retrait, Traiter le retrait, Ticket et facture**
(captures Figma fournies par l'utilisateur le 2026-10-01, pas de node Figma exact) —
**fait pour les deux premiers écrans** (2026-10-01), le troisième reste en attente.
- **Centre de retrait** (`PickupsList.tsx`, route `/pickups`) : KPI réels (prêts
  aujourd'hui + pièces disponibles, en attente de notification — dernier
  `NotificationLog.order_id` à `sent`, retraits effectués aujourd'hui, soldes impayés
  agrégés), recherche (nom/téléphone client), tableau dépôts prêts avec colonnes
  téléphone, articles, **atelier** (badge dérivé des statuts réels des articles —
  « Non récupéré » si au moins un article `non_recupere`, sinon « Prêt » — pas de
  3e état fabriqué), retrait prévu, **total**, reste à payer et notification.
  **Renforcement livré le 2026-10-01, en deux passes** (captures annotées par
  l'utilisateur) :
  - 1ère passe : carte « Retraits du jour » (dépôts dont `promised_at` tombe
    aujourd'hui), filtre de période, carte de recherche stylée (fond
    `brand-700→brand-900`), bannière de procédure de sécurité statique.
  - 2e passe (captures annotées avec des zones entourées) : badge « N prêt(s) »
    à côté du titre, boutons d'en-tête « Imprimer la liste » (`window.print()`,
    même motif que `OrderDetail.tsx`) et « Traiter le retrait » (focus la barre
    de recherche — pas de flux dédié distinct, le champ de recherche sert déjà à
    localiser un dépôt). Carte « Retraits du jour » enrichie : heure (`time()`,
    nouvel helper dans `lib/format.ts`), badge **À encaisser/Soldé** par rendez-vous
    (`balance_due` désormais inclus dans `GET /pickups/summary` → `due_today`),
    compteur « N prochain(s) rendez-vous », lien « Voir tout » qui applique le
    filtre date=aujourd'hui et défile jusqu'au tableau (pas de « planning »
    séparé — le tableau lui-même fait office de planning filtré). Barre
    « Affiner la file de retrait » remplace les anciens filtres période :
    compteur de résultats, date de retrait prévue (`<input type="date">`, un
    seul jour, réutilise `promised_from`/`promised_to`), **état atelier**
    (Tous/Prêt/Non récupéré — nouveau paramètre `GET /pickups?item_status=`,
    `whereHas('items', …)`), lien « Réinitialiser ».
  **Omis faute de données réelles ou redondant avec l'existant** (décisions
  documentées, pas des oublis) : comparaison « vs lundi dernier » (demanderait un
  historique, pas juste la période précédente — ambigu), filtre par mode de
  paiement (`reste à payer` n'est pas rattachable à un mode de paiement avant
  d'être réglé), filtre agence dans la barre (déjà couvert par le sélecteur
  d'agence global de l'en-tête — ne pas dupliquer), scan code-barres/QR direct
  sur cet écran (existe déjà ailleurs, `pages/Scan.tsx`), colonne « sync » par
  ligne et widget « Réseau agences »/« dernière synchro » (la file hors ligne ne
  couvre pas les retraits — un indicateur de sync constant à 100 % serait
  fabriqué), menu d'actions « ⋯ » par ligne (aucune action secondaire définie
  au-delà de « Traiter »).
- **Traiter le retrait** (`PickupProcessPage.tsx`, route `/pickups/:orderId`) :
  vérification article par article avec **retrait partiel réel au niveau de la
  quantité** (`order_items.quantity_delivered`, pas juste un statut binaire — un
  article avec 7 pièces peut être remis 3 puis 4 lors de deux visites), réceptionnaire
  client/tiers, état des pièces (conforme/réserve/anomalie) + remarques, **blocage
  systématique si solde impayé** avec encaissement espèces inline ou dérogation
  motivée obligatoire (texte libre, tracée sur l'enregistrement de retrait —
  `order_pickups.override_reason`). **Décisions prises faute de spécification
  produit** (à revoir si l'utilisateur le demande) : le blocage n'est pas encore
  configurable par agence (dépend de la table `agency_settings` non construite, voir
  EF-RET-05 en §2 — ici toujours actif) ; seul l'encaissement **espèces** est proposé
  en ligne (mobile money/carte restent asynchrones dans `PaymentService`, incompatibles
  avec un déblocage immédiat au comptoir) ; la dérogation est accessible à tout
  utilisateur ayant `orders.manage` (pas de second palier de validation manager) ; le
  réceptionnaire est un nom saisi, sans capture de signature (contrairement à
  `Delivery.signature_path`). **Omis** : chronologie atelier horodatée par étape
  (nécessite l'agrégat déjà noté en §2 Dashboard) et journal d'audit dédié affiché à
  l'écran (les événements existent bien — `order_item_status_histories`,
  `order_pickups` — mais ne sont pas présentés sous cette forme chronologique ici).
- ~~**Ticket et facture** (écran de prévisualisation/impression dédié)~~ **fait**
  (2026-10-01) : `pages/counter/TicketFacturePage.tsx` (route `/orders/:id/documents`,
  lien « Ticket et facture » dans l'en-tête de `OrderDetail.tsx` à côté du bouton
  d'impression rapide existant). Bascule Ticket/Facture A4, aperçu du ticket en HTML
  (réutilise `TicketReceiptContent.tsx`, extrait de `PrintableTicket.tsx` pour être
  partagé entre l'aperçu écran et l'impression), aperçu de la facture en PDF réel
  (`<iframe>` sur le blob déjà généré par `InvoiceController::downloadPdf`), boutons
  Télécharger/Imprimer par format, envoi par e-mail au client (nouveau
  `TicketPdfService::render()` — génère le ticket à la volée en PDF, jamais stocké,
  contrairement à la facture — + `DocumentSentNotification` + `DocumentController`,
  `GET /orders/{id}/ticket-pdf` et `POST /orders/{id}/documents/{type}/send`),
  état vide explicite si aucune facture n'a encore été générée pour ce dépôt (plutôt
  que de fabriquer un aperçu). **Omis délibérément** (pas des oublis) : envoi
  WhatsApp (aucune intégration n'existe dans l'application), envoi par SMS pour ces
  documents (pas de passerelle SMS réelle, et un SMS ne peut de toute façon pas
  porter de pièce jointe PDF même dans le mode « simulé » existant), historique
  « dernier envoi » sur cet écran (aurait demandé la permission `notifications.manage`,
  incohérente avec le gating `orders.manage` déjà utilisé ici pour voir/envoyer les
  documents — le retour inline du résultat d'envoi suffit).
  **Renforcement livré (2026-10-01, audit Drive `Pressing/New`)** : champ
  **Exemplaires** (`PrintableTicket.tsx` accepte désormais `copies`, rend ce nombre de
  blocs dans le DOM imprimable avec `page-break-after` entre chacun — `window.print()`
  n'offre aucun paramètre de nombre de copies, donc c'est le DOM imprimé qui porte
  plusieurs exemplaires en un seul job d'impression ; limité au format Ticket, testé
  en Playwright avec `window.print` stubbé). Carte **« hors connexion »** basée sur
  le vrai `orders.sync_status`/`client_local_uuid` (colonnes déjà en base, jamais
  exposées côté front jusqu'ici) — affichée uniquement si le dépôt n'est pas
  `synced` (`pending`→numéro local, `conflict`→avertissement), omise pour le cas
  normal plutôt que d'afficher un faux « Toujours disponible ». **Explicitement
  omis** : sélecteur « Imprimante » (la capture montre « POS-01 », mais aucun
  registre de périphériques n'existe côté backend — le fabriquer serait inventer
  une donnée ; le dialogue d'impression du navigateur propose déjà le choix
  d'imprimante, l'app n'a pas à le dupliquer).
- **Bug corrigé au passage, prérequis bloquant pour ce module** : `orders.status`
  n'était jamais réécrit après la création de la commande (`OrderController::store`
  le fixe une fois à `recu`) — seul `order_items.status` progressait. Le filtre
  `GET /orders?status=pret`, utilisé par ce module ainsi que par `OrdersList.tsx`,
  ne pouvait donc jamais rien retourner au-delà de `recu`. Nouveau service
  `OrderStatusSynchronizer` (agrège le statut commande = le moins avancé de ses
  articles, `livre` seulement quand tous les articles sont `livre`/`perdu`), appelé
  après chaque transition d'article (`OrderItemStatusTransitioner`) et après chaque
  retrait (`PickupService`).

**Synchronisation hors ligne — écran dédié « Retour en ligne et synchronisation »**
(capture Figma fournie le 2026-10-01, pas de node exact) : la file hors ligne existe
déjà côté comptoir (IndexedDB, mentionnée dans le Dashboard) mais sans écran de
supervision. La maquette montre une progression globale (opérations terminées/
restantes), le détail de chaque opération locale (dépôt, encaissement, ticket) avec
son UUID et son état (synchronisé, rapproché, en cours, en attente), des contrôles
d'intégrité listés (déduplication UUID, renumérotation locale→serveur, encaissements
rapprochés), et surtout une **résolution de conflit interactive** (ex. un code
promotionnel désactivé entre-temps côté serveur : choisir conserver la remise,
la retirer en régularisation, ou mettre en attente). Rien de ceci n'existe côté
backend au-delà de la file elle-même : il faudrait exposer l'état de synchronisation
par opération locale (actuellement la logique de sync vit côté client dans
IndexedDB sans API de supervision dédiée) et un vrai mécanisme de détection/
résolution de conflit (aujourd'hui une resynchronisation écrase ou échoue
silencieusement selon le cas, à vérifier). Chantier à part entière, pas prioritaire
tant que les modules Retraits/Caisse/Articles ne sont pas tranchés.

**03 Clients — Fiche client et formulaires** (captures Figma fournies le 2026-10-01,
pas de node exact) — écarts additionnels à ceux déjà notés :
- ~~Fiche client : 4 KPI (valeur vie client, dépôts réalisés, panier moyen, solde à
  payer)~~ **fait** (2026-10-01) : `ClientDetailPage.tsx` (route `/clients/:id`,
  remplace le panneau latéral de `ClientsList.tsx`). `ClientController::show()`
  calcule désormais `lifetime_value` (somme des `payments.amount` à `status=complete`
  du client — pas le cumul facturé, pour rester sur de l'argent réellement encaissé),
  `deposits_count` (nombre de commandes), `average_basket` (moyenne de
  `orders.total_amount`), `balance_due` (même formule que `OrderController::stats`,
  sur les factures impayées du client). Chronologie « Dépôts et retraits » (fusion
  client-side des commandes du client, via `GET /orders?client_id=`, et de ses
  retraits, nouveau champ `recent_pickups` sur la réponse de `show()` — requête
  `OrderPickup::whereHas('order', …)`, pas de relation directe client→pickup en
  base), triée par date avec le composant `Timeline` déjà construit pour la fiche
  dépôt. Table « Commandes récentes » (réutilise le même appel `/orders?client_id=`).
  Actions (Modifier/Activer-Désactiver/Supprimer) migrées du panneau vers l'en-tête
  de la page ; le bouton Supprimer reste cohérent avec l'ancien comportement (masqué
  dès que `deposits_count > 0`, message d'aide affiché à la place). **Bug de
  troncature mobile rencontré et corrigé ici aussi** (même piège que sur `OrdersList.tsx`
  le même jour) : grille de StatCards `grid-cols-2` dès 390px tronquait les montants
  (« 14 000 ... ») — passée en `grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-4`.
  **Historique des points de fidélité** (gains/consommations datés, motif) : même
  gap que noté en §2 Promotions/fidélité (`loyalty_point_movements` absent, seul le
  cumul `loyalty_points` est stocké). **Préférences** (canal préféré, créneau de
  retrait préféré, traitement favori, instructions) : aucune de ces colonnes
  n'existe sur `Client` (notes libres uniquement). Bouton « Convertir en remise » :
  pas d'endpoint pour convertir des points en remise à la demande (aujourd'hui la
  remise de palier s'applique automatiquement, pas de conversion manuelle).
- ~~Formulaire client (nouveau/modifier)~~ **fait** (2026-10-01, voir détail
  complet en §2 « Formulaire client enrichi » ci-dessous) : contrôle de doublon en
  temps réel, consentements SMS/e-mail, code de parrainage, préférence de contact,
  ville/quartier, téléphone secondaire, statut actif, groupe de fidélité en lecture
  seule, agence de référence, « Enregistrer et créer un dépôt ». La création de
  client hors connexion reste **non construite** (confirmé : aucune file IndexedDB
  pour les clients, contrairement aux dépôts) — omise plutôt que simulée.

**Formulaire client enrichi** (captures `Modif_Client.PNG`/`Nv_Client1.PNG`, dossier
Drive `Pressing/New`, audit du 2026-10-01) — `ClientForm.tsx` est passé d'une seule
colonne à 6 champs à une mise en page à deux colonnes conforme à la capture :
- **Nouvelles colonnes réelles sur `clients`** (migration
  `2026_10_01_090000_add_profile_fields_to_clients_table`) : `phone_secondary`,
  `city` (« Ville/quartier »), `contact_preference` (enum applicatif
  whatsapp/call/sms/email), `referral_code`, `sms_consent`, `email_consent`
  (défaut `false` — un consentement n'est jamais présumé, y compris pour un champ
  pré-coché dans la capture Figma). Validées dans `StoreClientRequest`/
  `UpdateClientRequest`.
- **Contrôle des doublons en temps réel** : pas de nouvel endpoint — réutilise
  `GET /clients?search=` déjà utilisé par `NewOrder.tsx`, débounce 400 ms, compare
  le téléphone saisi aux résultats exacts (en excluant le client en cours d'édition)
  et affiche soit « Aucun doublon détecté » soit une carte avec lien « Ouvrir la
  fiche ».
- **Groupe de fidélité** : affiché en lecture seule (pas un sélecteur éditable,
  contrairement à l'apparence de la capture) — c'est un palier **calculé** depuis
  `loyalty_points`/`LoyaltyTier`, pas une donnée qu'on peut fabriquer en la rendant
  modifiable. En édition : `client.loyalty_tier_name` (déjà exposé). En création
  (pas encore de client donc pas de points) : plus petit palier actif via
  `GET /loyalty-tiers`.
- **Agence de référence** : sélecteur `<select>` uniquement pour un utilisateur
  global à la création (même règle qu'avant, `agency_id` reste `prohibited` pour un
  utilisateur d'agence et non modifiable après coup côté `UpdateClientRequest`) —
  affichée en lecture seule dans tous les autres cas plutôt que de suggérer une
  réaffectation d'agence qui n'existe pas côté API.
- **Code de parrainage** : simple champ texte stocké, **sans** moteur de bonus
  parrain (ce moteur reste un chantier à part, §2 « Moteur de règles marketing »)
  — honnête sur ce qui est réellement fait (stocké) vs pas fait (bonus appliqué).
  **Archivage et historique** : carte informative statique (texte vrai sur le
  comportement de désactivation, aucune donnée à charger). **Synchronisation** :
  affichée seulement en édition, avec la vraie date `updated_at` du client — omise
  à la création (pas de file hors ligne client, donc pas de « brouillon local » à
  simuler).
- **« Enregistrer et créer un dépôt »** : `NewOrder.tsx` accepte désormais un
  paramètre `?client=<id>` (nouveau, `useSearchParams`), charge le client via
  `GET /clients/{id}` et le présélectionne — testé en Playwright (création
  « Fatou Diallo » → redirection vers `/?client=86` → carte client déjà remplie
  sur le nouveau dépôt).
- Tests : `tests/Feature/Clients/ClientLifecycleTest.php` (+4 tests : champs
  étendus à la création, défauts sans consentement implicite, rejet d'une
  préférence de contact invalide, mise à jour des champs étendus). Suite complète
  269/269 après ajout (aucune régression sur les tests existants).

**Vue consolidée multi-agences** (captures `Vue_consolidee_Agence.PNG` + `Multi_Agences.PNG`,
dossier Drive `Pressing/New`, audit du 2026-10-01) — écran entièrement nouveau,
`App\Services\MultiAgencyService` + `AtelierController`-like `MultiAgencyController`
(`GET /multi-agencies`, `GET /multi-agencies/{agency}`, permission `reports.view`,
même gating qu'`/kpi`/`/audit-logs` → admin + manager) :
- **Aucune nouvelle colonne/migration** : tout vient d'agrégats sur des tables déjà
  dotées d'un `agency_id` direct (`payments`, `orders`, `order_pickups`, `invoices`,
  `cash_movements`, `clients`, `audit_logs`) — confirmé explicitement avant d'écrire
  le service plutôt que supposé.
- **Explicitement omis, faute de donnée réelle** (la maquette les montre, aucune ne
  l'est) : **« Objectif réseau »/« Objectif mensuel »** (aucune table de quota/cible
  n'existe) et **statut « En ligne »** par agence (aucune télémétrie de connexion) —
  remplacé par le champ réel `is_active`. Idem « Satisfaction » (4,8/5, aucun système
  d'enquête) et horaires d'ouverture (`Agency` n'a pas ce champ).
- **Cash-flow net** : calculé honnêtement comme `paiements complets (période) +
  entrées de caisse validées − sorties de caisse validées` — les mouvements
  `en_attente` (double contrôle, voir module Caisse) sont exclus, testé
  explicitement (`test_cash_flow_net_excludes_pending_cash_movements`).
- **Alertes opérationnelles** : dérivées des mêmes agrégats (dépôts en retard —
  même définition que `AtelierController::board()`, impayés au-delà d'un seuil
  configuré en dur dans le service, atelier dont le nombre de dépôts actifs dépasse
  `workshop_capacity`) — aucune alerte n'est une donnée inventée.
- **Activité atelier (détail agence)** : réutilise `AtelierBoardService::columnFor()`
  (même regroupement que le tableau Kanban) via une requête `groupBy('status')`
  légère plutôt que de dupliquer la logique métier ou d'hydrater des commandes
  complètes (`AtelierController::board()` fait ça mais exige une seule agence et
  charge trop pour un simple résumé réseau).
- **Équipe présente** : personnel dont `attendances.clock_in` est posé et
  `clock_out` encore `null` aujourd'hui (table `Attendance` du module RH, jusque-là
  jamais exposée sous cet angle).
- **Historique récent** : 5 dernières entrées `AuditLog` de l'agence (même système
  générique que l'écran Audit & logs, même forme JSON que `AuditLogController::decorate()`
  pour réutiliser directement `lib/auditLog.ts` côté front) — pas de nouveau
  mécanisme de journalisation.
- **Comparaison au réseau (détail agence)** : rang, moyenne réseau du CA/panier
  moyen/impayés/retards — calculée **uniquement pour un utilisateur global**
  (`user.agency_id === null`). Un manager d'agence ne reçoit jamais `network_comparison`
  (reste `null`), même pour sa propre fiche détail : il n'a pas accès aux agrégats
  des autres agences, cohérent avec le reste du RBAC de l'app (testé explicitement :
  `test_the_agency_detail_endpoint_omits_network_comparison_for_an_agency_scoped_manager`).
- **Bug corrigé pendant la validation Playwright** : grille de 6 `StatCard` avec
  montants FCFA en `xl:grid-cols-6` tronquait les valeurs à 1440px (même piège déjà
  documenté sur `OrdersList.tsx`/`ClientDetailPage.tsx`) — passée en
  `grid-cols-1 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6`. Un second bug
  du même type, nouveau celui-ci : sur la carte « Comparaison au réseau », une valeur
  + son `DeltaBadge` se chevauchaient avec la colonne voisine à 390px (`dl
  grid-cols-2` trop étroit pour « 84 159 FCFA ↗+632,8% ») — corrigé en passant la
  grille en `grid-cols-1 min-[480px]:grid-cols-2` et en ajoutant `flex-wrap`/`truncate`
  sur le composant `ComparisonMetric`.
- Tests : `tests/Feature/MultiAgency/MultiAgencyTest.php` (13 tests — permission,
  scoping réseau vs agence unique, calculs outstanding/pickups/retards/fidélité,
  alertes, série de CA sans trou, confidentialité de la comparaison réseau,
  répartition atelier, équipe présente, activité récente, cash-flow net). Suite
  complète 282/282 après ajout.

**02 Dépôts — Gestion des dépôts (vue globale) et Fiche dépôt enrichie** (captures
Figma fournies le 2026-10-01) : la vue « Gestion des dépôts » multi-agences
(`OrdersList.tsx`) a reçu ses 4 KPI en-tête (voir ci-dessous) ; colonnes « Synchro »
par ligne et bouton « Colonnes » configurables toujours hors scope (données non
disponibles / fonctionnalité non prioritaire).

~~**KPI en-tête `OrdersList.tsx` + `ClientsList.tsx`**~~ **fait** (2026-10-01) :
- `OrdersList.tsx` : `GET /orders/stats` (`OrderController::stats`, scopé par agence
  via `resolveAgencyFilter`, aucune permission dédiée — même accessibilité que la
  liste elle-même) → dépôts aujourd'hui (`created_at` du jour), chiffre d'affaires du
  jour (somme des `payments.amount` à `status=complete` payés aujourd'hui — pas le
  total des commandes du jour, qui inclurait du non encaissé), à retirer aujourd'hui
  (`promised_at` du jour, hors `livre`/`annule`), reste à encaisser (même formule que
  `InvoiceController::index` → `total_outstanding`, sur les factures `emise`/
  `partiellement_payee`). Grille `grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-4`
  (pas `grid-cols-2` dès le mobile : les montants type « 177 310 FCFA » se faisaient
  tronquer par le `truncate` de `StatCard` à 390px — bug rencontré et corrigé pendant
  cette passe, cf. le piège équivalent déjà documenté sur `ClientsList.tsx` en 2026-09-30
  mais ici sur du texte numérique, pas juste un layout qui s'écrase).
- `ClientsList.tsx` : `GET /clients/stats` (`ClientController::stats`, même scoping)
  → clients actifs (`is_active=true`), nouveaux ce mois-ci (`created_at >=` début de
  mois), clients VIP (`loyalty_points >=` le `min_points` du palier de fidélité actif
  le plus élevé — 0 si aucun palier actif), points cumulés (somme de `loyalty_points`,
  présenté honnêtement comme un cumul et non comme « points attribués sur la
  période », cf. le gap déjà noté : aucun historique de mouvements de points
  n'existe). Grille `grid-cols-2 sm:grid-cols-4` (valeurs numériques courtes,
  pas de troncature constatée à 390px, vérifié par capture).
- **Explicitement non fabriqué** (cf. l'analyse de capture déjà faite le 2026-09-30,
  confirmée ici) : pas de donut de répartition fidélité ni de colonnes fréquence/
  valeur client sur `ClientsList.tsx` (demanderaient des agrégats supplémentaires non
  couverts par cette passe, rester sur les 4 StatCards suffit à combler l'écart
  visuel principal) ; pas de colonne « Synchro » ni de statut « Archivé » (aucun flag
  réel).

**04 Atelier en vue Kanban** (capture Figma `Atelier.PNG` fournie le 2026-09-30,
chantier validé par l'utilisateur le 2026-10-01 avec décisions métier laissées à
l'agent) — `pages/atelier/AtelierBoard.tsx` (route `/atelier`) :
- **Modélisation (décision clé)** : les 4 colonnes du tableau (En attente/En cours/
  Traités/Classés) sont un **regroupement d'affichage** des statuts réels déjà
  existants de `order.status` (lui-même déjà agrégé par `OrderStatusSynchronizer` à
  partir des articles) — `recu`/`trie`→attente, `en_traitement`→cours,
  `controle_qualite`→traites, `pret`→classes. Aucun statut parallèle inventé.
  Nouveau service `AtelierBoardService` (`columnFor()`/`nextColumnFor()`, backend
  seul source de vérité, dupliqué en petit côté front pour l'affichage immédiat).
- **Priorité** (`orders.priority`, enum urgent/haute/normale, réel nouveau champ) :
  calculée par défaut à la création (`is_express` → urgent, sinon normale,
  `OrderController::store`), modifiable ensuite par l'atelier via un `<select>` dans
  le panneau de dépôt (`PATCH /atelier/orders/{id}/priority`, permission
  `orders.update_status`) — un dépôt standard peut être escaladé en Haute sans être
  express (cas réel : client VIP, délai serré).
- **Responsables Laveur/Classeur** (`orders.washer_id`/`sorter_id`, FK `users`
  nullable, par dépôt — pas par article) : affichés sur chaque carte (avatar + nom,
  « Non affecté » sinon), éditables dans le panneau (`PATCH
  /atelier/orders/{id}/responsables`, vérifie que le responsable appartient à la
  même agence que le dépôt). Nouveau `GET /atelier/staff` pour peupler les
  sélecteurs — **volontairement pas** une extension de la liste légère déjà
  exposée par `UserController::index()` (celle-ci est aussi accessible via
  `orders.update_status` au rôle `livreur`, qui ne doit explicitement **pas**
  pouvoir lister le personnel — voir `DeliveryTest::test_listing_livreurs_requires_the_deliveries_manage_permission`,
  cassé puis corrigé en isolant l'endpoint plutôt qu'en élargissant la permission
  partagée).
- **Capacité atelier** (barre « 18/24 ») : `agencies.workshop_capacity` (nullable,
  réel, éditable via `AgencyFormPage.tsx`/`PATCH /agencies/{id}`), repli sur
  `config('atelier.default_capacity')` = 24 si non configuré — jamais une valeur
  fabriquée par agence. Numérateur = compte réel des dépôts actifs de l'agence
  (statuts `recu`→`pret`), **non affecté par les filtres** de recherche/priorité/
  responsable (sinon la barre varierait avec la recherche, trompeur) — calculé par
  une requête séparée dans `AtelierController::board()`.
- **Action « Passer à l'étape suivante »** (bouton dans le panneau, pas de
  drag-and-drop — voir omissions ci-dessous) : `POST /atelier/orders/{id}/advance`,
  fait progresser chaque article du dépôt à travers **chaque statut réel
  intermédiaire** jusqu'à l'entrée de la colonne suivante (ex. un article « reçu »
  traverse réellement « trié » PUIS « en_traitement », deux transitions distinctes
  journalisées séparément — rien n'est sauté). Réutilise
  `OrderItemStatusTransitioner` tel quel (mêmes règles, mêmes notifications, même
  journal d'audit) ; passage Traités→Classés fournit automatiquement
  `quality_check_result: 'ok'` (le bouton signifie que le contrôle est déjà validé,
  cohérent avec le badge « Contrôle qualité OK » déjà affiché sur les cartes Traités).
- **Panneau « Aperçu du dépôt »** (clic sur une carte) : récupère la fiche complète
  via `GET /orders/{id}` déjà existant (évite de dupliquer la logique métier) —
  articles, remarques (`order.notes`), alerte de retard, chronologie atelier
  (réutilise exactement la construction de `workshopTimeline` déjà faite pour
  `OrderDetail.tsx`). Lien retour « Suivre l'atelier » ajouté sur `OrderDetail.tsx`
  (`/atelier?order={id}`, affiché seulement si le dépôt est encore actif), la page
  Atelier lit `?order=` pour présélectionner la carte au chargement.
- **Bug corrigé pendant la validation Playwright** : `OrderController::show()` ne
  chargeait pas les relations `washer`/`sorter` — le panneau affichait « Non affecté »
  même pour un dépôt avec un laveur assigné. Capturé par la capture d'écran, pas par
  les tests (les tests backend vérifiaient `PATCH .../responsables` en base, pas la
  sérialisation de `GET /orders/{id}`) — test de régression ajouté
  (`test_showing_an_order_includes_its_atelier_responsables`).
- **Explicitement omis** (décisions documentées, pas des oublis) :
  - **Glisser-déposer entre colonnes** : remplacé par le bouton « Passer à » (dans le
    panneau) pour rester accessible/clavier/mobile et éviter la classe de bugs du
    drag-and-drop HTML5 — le panneau de la capture montre de toute façon ce même
    bouton comme action principale.
  - **« 2 tâches signalées »** (badge sur une carte) : aucun modèle de signalement
    d'anomalie en cours de traitement n'existe (différent de `condition_status` au
    retrait, qui est postérieur) — aurait demandé une table dédiée, non construite.
  - **Durée estimée par colonne** (« 1h 45 estimé », « 38 min de classement ») :
    demanderait une durée standard par service/catégorie, qui n'existe pas (recoupe
    le gap déjà noté « délais standard/express » dans `agency_settings`, non
    construit). Seul le compte réel de dépôts par colonne est affiché.
  - **Notes d'emplacement/programme** (« Rayon B · casier 08 », « Lavage programme
    P3 », « Housse scellée ») : aucune colonne réelle pour ces informations
    (localisation de stockage, programme machine, instructions de manutention) —
    la seule information de suivi réellement disponible est la chronologie
    (transitions de statut horodatées), affichée dans le panneau, pas sur la carte.
  - **« Configurer les étapes »** (bouton d'en-tête, bascule Laveur/Classeur par
    agence) : dépend de la table `agency_settings` toujours non construite (même
    gap que « Paramètres opérationnels », §2 ci-dessus) — non câblé.
  - **« Vue compacte »** (bascule de densité) : non construite, polish différé.
  - Filtre de période (Jour/Semaine/Mois) : le tableau représente l'état courant du
    pipeline, pas une plage de dates — filtrer par `created_at` aurait été ambigu
    (un dépôt d'il y a 3 jours toujours en cours doit rester visible) ; omis plutôt
    que de fabriquer une sémantique de filtre peu claire.

**Fiche dépôt — renforcement livré (2026-10-01)**, `OrderDetail.tsx` :
- ~~**4 cartes (statut commercial/état atelier/synchronisation/reste à payer)**~~
  **fait, 3 cartes** : Statut commercial (dérivé de `invoice.status` — Non facturé/
  Émise/Partiellement payée/Payée, pas de carte Synchronisation fabriquée : aucune
  donnée de sync par dépôt n'existe, voir Synchronisation hors ligne ci-dessous),
  État atelier (`order.status`), Reste à payer (nouveau `balance_due` calculé par
  `OrderController::show()`, même formule que `PickupController`).
- ~~**Chronologie atelier horodatée**~~ **fait** : réutilise `order_items.status_histories`
  déjà en base (acteur + horodatage), fusionnée across tous les articles du dépôt,
  via un composant `Timeline` partagé (`components/ui/Timeline.tsx`).
- ~~**Journal d'audit par dépôt**~~ **fait — découverte majeure** : un système d'audit
  générique existait déjà silencieusement (`AuditLog` + trait `Auditable`, utilisé par
  11 modèles dont `Order`/`OrderItem`/`Payment`/`Invoice`/`Client`/`CashMovement`/
  `CashClosure`/`Delivery`/`StockMovement` — chaque création/modification/suppression y
  est journalisée automatiquement) mais **sans aucun endpoint ni écran pour le lire**.
  Nouveau `AuditLogController::forOrder()` (`GET /orders/{id}/audit-logs`, résout les
  types/ids liés : commande + articles + facture + paiements) et formateur
  `lib/auditLog.ts` (diffs bruts → phrases lisibles, couverture correcte pour
  statuts/paiements/factures, repli générique « {type} modifié(e) » pour le reste).
  **Piège évité** : `Order::createdBy()` a été renommée `creator()` avant d'être
  chargée pour la première fois (collision FK documentée ci-dessous — jamais exploitée
  jusqu'ici car la relation n'était chargée nulle part).
  **Corollaire** : ceci rend aussi possible l'écran « Audit & logs » du menu
  PILOTAGE (jusqu'ici jamais construit faute de backend) — `AuditLogController::index()`
  (`GET /audit-logs`, permission dédiée `audit.view`, admin/manager) +
  `pages/AuditLogsPage.tsx` (route `/audit-logs`), journal filtrable par type/période,
  données réelles dès la première ouverture (toute l'activité déjà enregistrée
  silencieusement apparaît).
- Bouton « Suivre l'atelier » séparé : **différé**, en attente du chantier Atelier/Kanban
  (voir §09 ci-dessous) — pointera vers `/atelier?order=` une fois cette page construite.

**06 Caisse — Clôture et rapprochement journalier, Nouveau mouvement** (captures
Figma fournies par l'utilisateur le 2026-09-30, renforcement livré le 2026-10-01)
— **la majorité du chantier est faite**, deux points restent explicitement différés :
- ~~**Rapprochement par moyen de paiement**~~ **fait** : table `cash_closure_counts`
  (méthode espece/mobile_money/carte, théorique/compté/écart), `CashService::previewBalance()`
  retourne `by_method`, `CashClosureFormPage.tsx` affiche les 3 lignes avec saisie du
  compté. « Carte-Virement » de la maquette couvre uniquement `payments.method = carte`
  (aucun moyen « virement » n'existe dans l'enum) — simplification assumée.
- **Distinction recettes de nouveaux dépôts vs paiements de solde** : **différé** —
  `Payment` ne porte toujours aucun champ de contexte (dépôt/solde/manuel) ; l'ajouter
  proprement demande de retoucher tous les points d'entrée (`PaymentController::storeCash`,
  `PickupService`, `InvoicePanel.tsx`), gardé hors scope de cette passe.
- ~~**Checklist de clôture obligatoire**~~ **fait** : `cash_closures.checklist` (JSON),
  les 6 étapes de `config('cash.closure_checklist_steps')` sont exigées intégralement
  par `CashService::closeRegister()` (422 sinon) — pas un simple habillage visuel.
- ~~**Justification obligatoire si écart non nul**~~ **fait** : si un écart est détecté
  sur n'importe laquelle des 3 méthodes, `notes` devient obligatoire côté service (422
  sinon). Le **workflow d'approbation manager séparé sur la clôture elle-même** (pas sur
  les mouvements, voir double contrôle ci-dessous) reste absent — différé, non demandé
  explicitement par la maquette au-delà de la justification textuelle.
- ~~**Rapport PDF de clôture**~~ **fait** : `CashService::closeRegister()` génère un PDF
  (DomPDF, `resources/views/cash/closure-pdf.blade.php`) à chaque clôture, stocké et
  téléchargeable via `GET /cash/closures/{id}/pdf` (bouton sur `CashClosureDetail.tsx`).
- **Opérateurs de la journée** (vue agrégée par utilisateur : ouverture, comptage,
  validations) : **différé** — relève du reporting (recoupe l'agrégat
  `GET /reports/daily` déjà noté en §2 « 08 Bilan journalier »), pas ajouté ici.
- ~~**Mouvement de caisse structuré**~~ **fait** : `cash_movements` gagne `category`
  (enum fourniture/salaire/dépôt banque/retrait banque/remboursement/autre — liste posée
  par hypothèse, aucun Figma exact disponible, à confirmer), `counterparty`, `reference`,
  et `proof_path` (upload chiffré par le disque de stockage configuré, servi via
  `GET /cash/movements/{id}/proof` avec vérification d'agence, jamais d'URL publique
  directe).
- ~~**Double contrôle / validation manager sur mouvement sensible**~~ **fait, simplifié** :
  seuil configurable (`config('cash.sensitive_movement_threshold')`, 250 000 FCFA par
  défaut, pas encore par agence), `CashMovement.status` (`valide`/`en_attente` — pas de
  3e état « brouillon », jugé redondant), `POST /cash/movements/{id}/validate`. **Aucune
  notification au contrôleur** (aucun canal de notification interne aux utilisateurs
  n'existe dans l'application, seul `NotificationService` cible les clients) — le
  mouvement en attente n'est donc visible que via la bannière de blocage sur
  `CashRegisterPage.tsx`. La clôture est bloquée tant qu'un mouvement reste en attente
  (vérifié par `CashService::closeRegister()`).
- **Traçabilité horodatée du mouvement** (brouillon créé → règle appliquée → seconde
  validation, avec acteur et heure à chaque étape) : partiellement fait —
  `validated_by`/`validated_at` tracent la validation, mais pas de présentation
  chronologique dédiée façon « journal d'audit » à l'écran (differé, recoupe le même
  besoin que pour les Retraits et la Fiche dépôt).

**07 Articles & tarifs — Catalogue et fiche article** (captures Figma fournies par
l'utilisateur le 2026-09-30, renforcement livré le 2026-10-01, pas de node Figma
exact) — la majorité du chantier est faite, les points les plus structurels
d'abord :
- ~~**Mode de facturation par article**~~ **fait** : `Service.billing_mode`
  (`piece`/`kg`/`mixte`), `base_price` devenu nullable (requis seulement hors
  `kg`). En mode `mixte`, le choix pièce vs poids se fait ligne par ligne au
  dépôt (`order_items.weight_kg`, `NewOrder.tsx`), pas sur l'article.
- ~~**Grilles de prix dégressives au kilo**~~ **fait** : modèle `ServicePriceTier`
  (poids_min/poids_max nullable/prix_par_kg), résolution de palier dans
  `ServicePricingService::resolveTier()`, appliquée réellement à la création de
  commande (`OrderController::store`) — pas seulement configurable en back-office.
- ~~**Options de tarification par article**~~ **fait** : `allow_discount`,
  `round_to_hundred` (arrondi appliqué au total de la ligne via
  `ServicePricingService::roundAmount()`), `price_editable_at_counter` (champ
  stocké, pas encore branché sur un contrôle de saisie au comptoir — différé).
- ~~**Historique des modifications par article**~~ **fait** : `ServicePriceHistory`
  (changement de `base_price` et des paliers, acteur + horodatage), affiché sur
  `ServiceFormPage.tsx`. La garantie fiscale elle-même (un prix modifié ne change
  jamais une facture déjà émise) était déjà assurée par l'existant :
  `order_items.unit_price` est figé à la création, jamais recalculé.
- ~~**Tableau de bord du catalogue**~~ **fait** : `GET /services/stats` (actifs,
  catégories, tarif moyen, « à réviser » = non modifié depuis 12 mois via
  `ServicePriceHistory`), 4 `StatCard` sur `ServicesPage.tsx`.
- ~~**Champ « Priorité »**~~ **fait** (2026-10-01, audit Drive `Pressing/New`) :
  `services.priority` (enum `standard`/`haute`, défaut `standard`), sélecteur sur
  `ServiceFormPage.tsx` section Tarification. **Indicatif uniquement** — ne modifie
  **pas** automatiquement `orders.priority` (qui reste calculé par dépôt, voir
  chantier Atelier ci-dessus) : un dépôt peut contenir plusieurs articles de
  priorités différentes, la priorité d'article n'est donc pas transposable 1:1 en
  priorité de commande sans règle métier supplémentaire non demandée ici. Stocké et
  modifiable dès maintenant ; branchement vers un usage concret (tri atelier,
  alerte) différé, même principe que `price_editable_at_counter` ci-dessus.
- **États acceptés / rendus compatibles / services associés** (cases à cocher
  paramétrables par article) : **différé** — `IntakeCondition` existe toujours
  sans liste configurable par article ; « rendus compatibles »/« services
  associés » n'existent pas.
- **Disponibilité par agence détaillée** (récapitulatif agence par agence avec
  « prix local +X % » sur la fiche article) : **différé** — `agency_services`
  (price_override, is_active) couvre la donnée brute, aucune UI dédiée.
- **Contrôle avant publication** (checklist) et **recommandations automatiques**
  (« le tarif Express ne doit pas dépasser de 40 % ») : **différé** — seules les
  règles de validation HTTP basiques existent (ex. tranches de poids cohérentes).
- **Import Excel** du catalogue (EF-ART-03) : **différé**, toujours non construit.
- **Onglets Catégories / Tarifs au kilo / Indisponibles / Historique** sur la
  liste : **différé** — liste plate avec filtres/recherche uniquement.
- Conclusion : le système de tarification (modes de facturation, grilles
  dégressives, historique, tableau de bord) est maintenant un vrai renforcement,
  pas un simple ajustement visuel — intégré jusqu'au comptoir. Restent hors scope
  de cette passe : configuration fine par article (états/rendus/services
  associés, disponibilité par agence détaillée), contrôle de publication, import
  Excel, navigation par onglets.

Le catalogue articles/tarifs (CRUD) et la sidebar de navigation groupée, qui étaient
dans une version précédente de cette liste, sont **déjà faits** (commits `7dd2fae`,
`0e2ffdb`).

**Types de traitement (ratio de prix automatique)** — CDC §11.1-11.3, gap #2
ci-dessus, fait le 2026-10-01 (demande utilisateur laconique « Change service par
article », clarifiée via `AskUserQuestion` ; réponse utilisateur sans préférence
explicite → scope choisi par l'agent, cohérent avec le reste de la liste CDC déjà
traitée en autonomie cette session) :
- **Décision de modélisation (clé)** : ne **pas** scinder le modèle `Service`
  existant en Article + Service séparés — ce dernier est référencé dans tout le
  pipeline (commande, tarification, ticket, facture, historique de prix) et une
  séparation littérale aurait exigé un parsing fragile des libellés existants
  (« Nettoyage - Chemise MC ») pour en extraire un « article » implicite, sans
  bénéfice fonctionnel supplémentaire. À la place, nouveau référentiel global
  `treatment_types` (table dédiée, indépendante des agences — même portée que le
  catalogue `services`) : `code` (unique), `name`, `price_ratio` (decimal 4,2),
  `is_active`. Seedé avec 3 valeurs par défaut (Classique ×1,00, Express ×1,50,
  Repassage seul ×0,50 — `TreatmentTypeSeeder`).
- **Application du ratio** : `order_items.treatment_type_id` (FK nullable,
  `nullOnDelete`) — un traitement est **optionnel par ligne de commande**, pas
  obligatoire et pas porté par l'article lui-même (un même article « Chemise »
  peut être déposé en classique ou en express selon le dépôt). Calcul dans
  `OrderController::store()` : le prix de la ligne (pièce ou grille au kilo,
  logique de pricing existante inchangée) est multiplié par `price_ratio` via
  `ServicePricingService::applyTreatmentRatio()`, puis ré-arrondi par
  `roundAmount()` si l'article a `round_to_hundred` — même pipeline que le prix de
  base, pas de code dupliqué. Un traitement inactif est rejeté (422) ; un
  `treatment_type_id` inexistant est rejeté par la validation HTTP
  (`StoreOrderRequest`). **Additif et rétro-compatible** : une ligne sans
  traitement choisi suit exactement le chemin de code existant (comportement
  identique à avant cette passe, vérifié par un test dédié).
- **Fiche technique (CRUD)** : `TreatmentTypeController` (`GET/POST
  /treatment-types`, `PATCH /treatment-types/{id}`), gardé par la permission
  `services.manage` (même gating que le catalogue d'articles) — pas de `destroy`,
  même convention que `LoyaltyTierController` (désactivation via `is_active`
  plutôt que suppression, pour ne jamais casser l'historique des dépôts déjà
  facturés avec ce traitement).
- **Frontend** : `NewOrder.tsx` — sélecteur de traitement en pastilles (même
  pattern que l'état à la réception) dans le panneau déplié de chaque ligne de
  panier, aperçu de prix recalculé côté client (même formule que le serveur, qui
  reste seul à faire foi), badge du traitement choisi affiché sur la ligne
  (`· Express`). Nouvel écran de gestion `pages/services/TreatmentTypesPage.tsx`
  (route `/services/treatment-types`, lien depuis l'en-tête de `ServicesPage.tsx`)
  — mirrors exactement le patron d'édition en ligne de `LoyaltyPage.tsx`
  (liste + formulaire de création côte à côte, édition inline, activer/désactiver
  par pastille cliquable) plutôt que d'inventer un nouveau patron UI. Ticket/
  facture (`TicketReceiptContent.tsx`, les deux vues Blade PDF) affichent le nom
  du traitement entre parenthèses à côté du service quand il y en a un.
  Vérifié par capture Playwright à 390px (écran de gestion) et par un dépôt réel
  avec traitement Express sélectionné (500 FCFA × 1,5 = 750 FCFA, TVA et total
  recalculés correctement dans le panier).
- **Omis/différé** (décisions documentées) : pas de règle automatique reliant un
  traitement à une règle de ratio *par article* (ex. interdiction d'appliquer
  Express à un article déjà premium) — le ratio s'applique uniformément, cohérent
  avec le CDC qui ne spécifie pas de telles exceptions. Pas de traitement par
  défaut suggéré selon `is_express` de la commande (volontaire : le traitement est
  une propriété de la ligne, pas de la commande, contrairement à `orders.priority`
  qui reste dérivé de `is_express` — même distinction déjà actée pour
  `services.priority` dans le chantier Articles & tarifs ci-dessus). Import Excel
  des traitements : hors scope, recoupe le gap EF-ART-03 déjà différé.
- Tests : `tests/Feature/TreatmentTypes/TreatmentTypeTest.php` (3 tests — CRUD,
  gating `services.manage`, unicité du code) et 4 tests ajoutés à
  `tests/Feature/Orders/OrderCreationTest.php` (ratio appliqué, ligne sans
  traitement inchangée, traitement inactif rejeté, id inexistant rejeté). Suite
  complète 292/292 après ajout (aucune régression).

**Plateforme superadmin — Phase 1 (fondations)** — section 13 de la maquette /
CDC EF-SUP-01 à 04, gap ci-dessus, fait le 2026-10-02 (5 captures fournies par
l'utilisateur : Vue plateforme, Login superadmin, Pressings, Utilisateurs
transverses, Agences ; clarifié via `AskUserQuestion` → « vrai multi-tenant, pas
une réinterprétation » ; plan détaillé produit en mode plan, approuvé par
l'utilisateur avant tout code) :
- **Décision d'architecture (clé)** : chaque pressing client tourne en réalité sur
  son propre VPS/base PostgreSQL séparée (`docs/ARCHITECTURE.md`, hypothèse H1 déjà
  actée) — la plateforme centrale ne peut donc pas faire de requêtes live vers N
  bases distantes. Modèle retenu : **chaque déploiement tenant pousse
  périodiquement un rapport** (compteurs agences/utilisateurs/opérations) vers la
  plateforme via un jeton dédié (`pressing_report_logs`, `POST /api/platform/reports`,
  authentifié par `VerifyPressingReportToken` — pas Sanctum, un pressing n'est pas
  un « utilisateur »). Les horodatages « il y a 2 min/35 sec » de la maquette
  correspondent exactement à ce modèle (dernier rapport reçu, pas une latence de
  requête). `pressings.agencies_count`/`users_count`/`last_report_at` sont donc
  **dénormalisés** depuis le dernier rapport, jamais recalculés en live.
- **Authentification superadmin, royaume totalement séparé** : nouveau guard
  Sanctum `platform` (provider `platform_users` → `App\Models\PlatformUser`),
  isolé du guard tenant via `Sanctum\Guard::hasValidProvider()` (vérifié en lisant
  directement le code vendor, pas supposé). **Correctif de sécurité découvert en marge**
  et corrigé dans le même commit : `config/auth.php` n'avait *aucune* entrée
  `guards.sanctum` explicite avant cette passe — `SanctumServiceProvider` l'injectait
  alors avec `provider => null`, ce qui faisait accepter au guard tenant existant
  n'importe quel modèle « tokenable », pas seulement `User` (inoffensif tant
  qu'aucun autre modèle `HasApiTokens` n'existait, devenu un vrai trou d'isolation
  dès l'ajout de `PlatformUser`). Épinglé explicitement (`provider: users`) dans le
  même commit qui ajoute le guard `platform`. Testé par
  `tests/Feature/Platform/Auth/GuardIsolationTest.php` (6 tests, avec de vrais
  jetons HTTP bruts — **pas** `actingAs()`, qui positionne l'utilisateur sur le
  guard `web` par défaut et court-circuiterait le pré-contrôle de Sanctum avant même
  de parser le jeton, donnant un faux sentiment de couverture).
- **MFA obligatoire, TOTP maison** (`app/Services/TotpService.php`, RFC 6238/4226,
  HMAC-SHA1) : aucun package 2FA composer n'existait, cohérent avec le RBAC maison
  du reste du projet — pas de nouvelle dépendance. QR d'enrôlement **non généré** :
  secret affiché en clair pour saisie manuelle dans l'application d'authentification
  (évite d'ajouter une dépendance de rendu QR juste pour cet écran ; `endroid/qr-code`
  existe déjà pour les étiquettes articles mais n'a pas été réutilisé ici — rendu
  d'image inutile face à une simple chaîne de texte à copier). Connexion en 2 étapes
  (`/login` → `mfa_required` ou `mfa_setup_required` selon que le compte a déjà
  configuré sa MFA, puis `/login/verify`/`/login/setup`), verrouillage 15 min après
  5 échecs (texte exact de la maquette), 8 codes de récupération à usage unique
  générés à la confirmation de l'enrôlement.
- **Registre des pressings** (`pressings`, `platform_plans`) : CRUD
  (`PressingController` sous `Api/Platform/`, nouveau sous-dossier dédié — déviation
  volontaire de la convention `Api/*` plate, un royaume appelé à grandir sur les
  phases suivantes), suspendre/réactiver, rotation du jeton de rapport. « Nouveau
  pressing » génère immédiatement un jeton de rapport affiché **une seule fois**
  (même UX que tout autre secret à usage unique dans l'app) — à transmettre à
  l'équipe du pressing pour configurer leur déploiement ; **ne provisionne aucune
  infrastructure réelle** (pas de VPS/base créés automatiquement, hors de portée de
  cette app).
- **Journal d'audit plateforme** (`platform_audit_logs` + trait
  `PlatformAuditable`) : **copie** du mécanisme `audit_logs`/`Auditable` existant,
  **pas une réutilisation de la même table** — `platform_users.id` et `users.id`
  sont des séquences indépendantes qui entrent en collision de valeur ; écrire un id
  `platform_users` dans `audit_logs.user_id` (FK réelle vers `users`) attribuerait
  silencieusement une action à un mauvais utilisateur tenant. Appliqué à `Pressing`
  uniquement pour l'instant.
- **Frontend** : sous-arbre `/superadmin/*` monté en parallèle du tenant dans le
  même `<BrowserRouter>` (pas de second point d'entrée HTML — un seul build Vite,
  vérifié que `LicenseProvider`/`SettingsProvider` ne gênent pas sous une session
  plateforme), propre client API (`lib/platformApi.ts`, clé de jeton
  `pm.platform.token` distincte de `pm.token`) et propre contexte d'auth
  (`SuperadminAuthContext.tsx`) — fichiers séparés plutôt qu'un client paramétré,
  pour rendre l'isolation des guards visible aussi côté front. `SuperadminLayout.tsx`
  est une sidebar dédiée (pas une variante d'`AppLayout.tsx` : auth, branding et
  navigation totalement distincts) avec uniquement les écrans réellement construits
  (Vue plateforme, Pressings) — **les items non construits sont omis, pas grisés**
  (un lien grisé reste une promesse d'UI non tenue). `PressingsPage.tsx`/
  `PressingFormPage.tsx` suivent le patron liste + écran dédié `/new`/`/:id/edit`
  (mirror de `AgenciesPage.tsx`/`AgencyFormPage.tsx`, même taille de registre admin)
  plutôt que liste + panneau latéral. Pas d'i18n sur cette console (français
  uniquement, chaînes codées en dur) : écran interne à l'équipe Spark, distinct du
  personnel pressing auquel s'applique la parité fr/en de l'app principale —
  décision délibérée pour contenir le scope de cette passe, à reprendre si un besoin
  bilingue réel apparaît (les fichiers `i18n/fr.json`/`en.json` restent inchangés et
  en parité stricte).
- **Tableau de bord — réel vs omis** (vérifié poste par poste, pas supposé) :
  tenants actifs/agences/utilisateurs et activité 14 jours (`SUM(operations_count)`
  de `pressing_report_logs`, jours sans rapport à 0 plutôt qu'interpolés) sont réels.
  **Omis entièrement**, faute de toute télémétrie réelle : « Santé technique »
  (API/SYNC/PRINT), disponibilité/latence, incidents (KPI, onglet, alertes
  récentes) — et la même lacune existe **aussi sur la pastille de santé par ligne**
  du tableau Pressings de la maquette (piège répété à ne pas rater, pas seulement la
  carte agrégée). État des licences (barres Actives/À renouveler/Suspendues) est
  réel et ne somme pas forcément à 100 % par construction (conditions
  indépendantes, pas une partition — cohérent avec la maquette elle-même).
- Tests : 31 nouveaux (`tests/Feature/Platform/**`) — connexion/verrouillage MFA,
  isolation des guards (le test le plus important du chantier), CRUD pressings,
  ingestion de rapport, agrégats du tableau de bord. Suite complète 323/323 après
  ajout (aucune régression).
- **Hors scope de cette Phase 1** (décisions documentées, pas des oublis) :
  - **Écran « Utilisateurs transverses »** — dépend d'un vrai modèle de permissions
    par pressing pour le personnel Spark, pas encore défini ; `platform_users` n'a
    volontairement pas de colonne rôle/permission (éviter de deviner ce schéma à
    l'avance). Bootstrap du tout premier utilisateur via une commande Artisan
    (`platform:users:create`), pas un écran — équivalent CLI d'un seeder.
  - **Écran « Agences » cross-tenant éditable** — exige un canal de configuration
    plateforme→tenant (bidirectionnel : pousser des réglages dans un déploiement,
    pas seulement en recevoir des rapports), chantier distinct et plus lourd.
  - **Nav « Audit global »/« Synchronisation »/« Configuration »** — dépendent
    respectivement de l'écran Utilisateurs transverses, d'un écran de supervision
    dédié au-dessus du mécanisme d'ingestion déjà construit, et de réglages
    plateforme qui n'existent pas encore (catalogue de plans, durée de verrouillage,
    fenêtre TOTP : codés en dur/seedés pour l'instant).
  - **Facturation des plans plateforme** — `platform_plans` reste un simple
    catalogue (même précédent que `license_plans` à ses débuts).
- **Bug corrigé pendant la validation manuelle, pas par les tests** :
  `Str::password()` peut générer un mot de passe temporaire contenant `<`/`>` —
  Symfony Console interprète ces caractères comme des balises de style et peut
  tronquer/altérer l'affichage dans `$this->warn()`/`$this->info()` (le hash stocké
  en base reste correct, seul l'affichage terminal est corrompu). `platform:users:create`
  corrigé pour écrire le mot de passe en sortie brute (`OutputInterface::OUTPUT_RAW`)
  plutôt que via les méthodes de style — à vérifier sur toute future commande
  affichant un secret généré aléatoirement.

## Conventions établies dans ce projet (à respecter)

- **Sidebar toujours sombre** (`AppLayout.tsx`, commit du 2026-10-01) : les deux
  `<aside>` (desktop et overlay mobile) sont fixés en `bg-brand-950`, **indépendamment
  du thème clair/sombre du contenu** — c'est ce que montrent systématiquement les
  captures Figma (toutes les sections). `BrandMark` y est rendu avec `inverted`
  (texte blanc). Si un nouvel élément est ajouté dans la sidebar, ne pas utiliser de
  couleurs `dark:` conditionnelles dessus — utiliser directement les tons clairs
  (`text-brand-100/80`, `hover:bg-white/10`) adaptés à un fond sombre permanent.
  Correctif similaire pour tout futur écran dont le Figma montre un fond
  systématiquement sombre indépendant du thème.
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
  `xxx_by`. **Deuxième occurrence trouvée et corrigée le 2026-10-01** sur
  `Order::createdBy()` (jamais exploitée jusque-là car la relation n'était chargée
  nulle part) — renommée `creator()` avant son premier chargement dans
  `OrderController::show()`.
- **Un système d'audit générique existe déjà** (`App\Models\AuditLog` + trait
  `App\Models\Concerns\Auditable`) : 11 modèles l'utilisent (`Order`, `OrderItem`,
  `Client`, `Payment`, `Invoice`, `Delivery`, `CashMovement`, `CashClosure`,
  `StockMovement`, `Attendance`, `Shift`) et journalisent automatiquement chaque
  create/update/delete (`old_values`/`new_values`/acteur/IP/user-agent) dans
  `audit_logs` — **avant le 2026-10-01 aucun endpoint ni écran ne le lisait**, la
  table s'empilait silencieusement depuis le tout début du projet. Avant d'ajouter
  un `created_by`/journal/historique sur un nouveau modèle, vérifier s'il n'a pas
  déjà `use Auditable` (il suffit souvent d'exposer les entrées existantes plutôt
  que d'inventer un nouveau mécanisme) — voir `AuditLogController` (`GET
  /audit-logs`, `GET /orders/{id}/audit-logs`) et `lib/auditLog.ts` (formatage des
  diffs bruts en phrases lisibles) pour le patron à suivre. Pour ajouter l'audit à
  un modèle qui ne l'a pas encore : `use Auditable;` sur le modèle (expose
  `agency_id` ou surcharge `auditAgencyId()`), puis ajouter son nom court à
  `AuditLogController::TYPES` et à `TYPE_LABEL_KEYS`/`audit.type.*` (i18n) côté
  front pour qu'il apparaisse dans le filtre de `/audit-logs`.
- **Bug corrigé en marge du chantier clients (commit `eaf68bf`)** : `Client::create()`
  ne reflète pas en mémoire le défaut DB de `loyalty_points` (0), donc l'accesseur
  `loyaltyDiscountRate()` plantait la sérialisation JSON à chaque création de
  client sans `loyalty_points` explicite. Toujours `->refresh()` après un
  `Model::create()` dont la réponse JSON dépend d'un accesseur qui lit une colonne
  à défaut DB (pas fournie explicitement à `create()`).
- **Ne jamais élargir la condition de gating d'un endpoint partagé sans relire ses
  tests existants** : en construisant le module Atelier, `UserController::index()`
  (liste légère du personnel) a été élargi pour accepter `orders.update_status` en
  plus de `deliveries.manage`/`hr.manage`, pour que les techniciens puissent peupler
  les sélecteurs Laveur/Classeur. Casse immédiatement
  `DeliveryTest::test_listing_livreurs_requires_the_deliveries_manage_permission` :
  le rôle `livreur` a aussi `orders.update_status`, et ce test vérifie explicitement
  qu'un livreur ne doit PAS pouvoir lister le personnel. Corrigé en isolant un
  nouvel endpoint dédié (`AtelierController::staff()`, `GET /atelier/staff`) plutôt
  qu'en élargissant la permission partagée. Toujours lancer la suite complète après
  avoir touché un contrôleur déjà utilisé par un autre module, pas seulement les
  tests du module en cours.

# Pressing Manager — notes pour agents

Laravel 12 (API) + React 19/TypeScript (SPA Vite) + PostgreSQL. Multi-agence,
**multi-tenant depuis le 2026-10-02** (voir « Pivot multi-tenant » ci-dessous).

**Pivot d'architecture (2026-10-02)** : l'hypothèse H1 d'origine (`docs/ARCHITECTURE.md`,
« une base PostgreSQL par client pressing », déploiement dédié par client) a été
**explicitement inversée sur demande utilisateur** — un seul déploiement Laravel/
PostgreSQL héberge désormais plusieurs pressings clients, chacun avec ses agences,
son personnel, ses clients, ses commandes, son catalogue et sa caisse totalement
étanches des autres. Le superadmin (console `/superadmin`) crée un Pressing + sa
première agence + un compte manager bootstrap ; ce manager se connecte ensuite sur
le `/login` tenant habituel (pas `/superadmin/login`) et n'y voit jamais que les
données de son propre pressing. Détail complet (modèle de données, scoping
centralisé, décisions de scope) en §2 « Pivot multi-tenant ». **Ne pas revenir à
l'hypothèse mono-tenant** sans nouvelle instruction explicite — le mécanisme de
rapport `pressing_report_logs`/`POST /api/platform/reports` (toujours en place)
reste utilisable pour d'éventuels déploiements réellement séparés, mais n'est plus
la seule façon d'opérer plusieurs pressings sur cette base de code.

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
  **Audit du 2026-10-05** : le token était bien extrait et appliqué, mais uniquement
  sur des badges (`Pill tone="accent"`, `StatCard tone="accent"`) et des décors à
  faible opacité (`Login.tsx`) — jamais sur un vrai bouton d'action, donc
  quasi-invisible en navigation réelle malgré une dizaine d'usages dans le code.
  Aucune variante `button('accent', …)` n'existait dans
  `components/ui/styles.ts`. **Corrigé** : variante `accent` ajoutée
  (`bg-accent-500 text-ink-950 hover:bg-accent-600` / `dark:bg-accent-400
  dark:hover:bg-accent-300`, contraste texte/fond vérifié ≥ 6:1 dans les deux
  modes — voir calculs dans l'historique de session, pas recalculé ici). Câblée
  sur le premier cas réellement justifié trouvé (pas de CTA générique recoloré
  au hasard) : la pastille de sélection d'un type de traitement dans
  `NewOrder.tsx` passe en gold **uniquement** quand le traitement choisi est
  réellement premium (`treatment_type.price_ratio > 1`, ex. Express ×1,5) —
  cohérent avec le sens déjà établi de « gold = Express/premium » ailleurs dans
  l'app (toggle Express, pastille priorité Atelier). Les autres usages déjà
  en place (VIP, fidélité, abonnement premium, rôle système…) restent des
  badges informatifs, pas des CTA — pas de changement nécessaire là, un badge
  n'est pas un bouton. **Complément (même jour, captures annotées par
  l'utilisateur)** : les captures « Nouveau mouvement de caisse » et
  « Clôture et rapprochement journalier » montrent le bouton de soumission
  final (« Enregistrer le mouvement », « Clôturer la caisse ») en gold, pas
  en vert — ces deux CTA étaient encore en `button('primary', …)`. Passés en
  `button('accent', …)` (`CashMovementFormPage.tsx`, `CashClosureFormPage.tsx`).
  Décision initiale : couleur uniquement, pas de reconstruction du bandeau
  pied de page sombre pleine largeur montré sur ces captures (changement de
  mise en page distinct, non demandé à ce moment-là). **Fait ensuite, sur
  confirmation utilisateur** : nouveau composant partagé
  `components/ui/ActionBar.tsx` (barre sticky `bottom-0`, toujours sombre —
  même convention que la sidebar, pas de `dark:` conditionnels) avec statut
  à gauche et actions à droite, câblé sur les deux écrans. Statut toujours
  dérivé de données réelles déjà calculées dans chaque page, jamais
  fabriqué : `CashMovementFormPage.tsx` affiche l'impact signé sur la caisse
  (`type === 'entree' ? +montant : -montant`) ; `CashClosureFormPage.tsx`
  affiche l'état réel de la checklist (`checklistComplete`). Vérifié par
  Playwright que la barre sticky ne masque jamais durablement du contenu du
  formulaire (capture au scroll maximal : tout le contenu réapparaît
  au-dessus de la barre) et absence de débordement horizontal à 390px sur
  les deux écrans.
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
| 06 Caisse | Centre de caisse, Nouveau mouvement, Clôture | `pages/cash/CashRegisterPage.tsx`, `pages/cash/CashMovementFormPage.tsx`, `pages/cash/CashClosureFormPage.tsx`, `pages/cash/CashClosureDetail.tsx`, `pages/cash/CashMovementDetailPage.tsx`, `pages/cash/CashJournalSection.tsx` (routes `/cash`, `/cash/movements/new`, `/cash/movements/:id`, `/cash/closures/new`, `/cash/closures/:id`) | **fait, renforcement complet livré** (2026-10-05) — KPI du jour, ventilation des encaissements, flux de caisse, journal de caisse unifié filtrable/exportable, panneaux latéraux « Double contrôle »/« Validation »/« Traçabilité »/« Opérateurs »/« Anomalies »/« Rapport » sur les 2 formulaires. Reste différé : distinction dépôt/solde sur `Payment` — détail complet en §2 |
| 07 Articles & tarifs | Catalogue (liste) | `pages/ServicesPage.tsx` | **fait, renforcement livré** (2026-10-01) — tableau de bord (4 `StatCard` via `/services/stats`), badge mode de facturation + « Dès X FCFA/kg ». Restent différés : import Excel, onglets Catégories/Tarifs au kilo/Indisponibles/Historique, filtres avancés (détail §2) |
| 07 Articles & tarifs | Création/édition article | `pages/services/ServiceFormPage.tsx` (routes `/services/new`, `/services/:id/edit`) | **fait, renforcement livré** (2026-10-01) — sélecteur Pièce/Kilo/Mixte, grilles de prix dégressives au kilo (`ServicePriceTier`), options `allow_discount`/`round_to_hundred`/`price_editable_at_counter`, historique des changements de prix (`ServicePriceHistory`). Intégré jusqu'au comptoir : `NewOrder.tsx` facture réellement au poids (résolution de palier + arrondi). Restent différés : états acceptés/rendus compatibles configurables, disponibilité par agence récapitulative, checklist de publication, historique des tarifs par agence (détail §2) |
| 08 Rapports & bilans | Rapports et bilans | `pages/KpiPage.tsx` (route `/kpi`, libellé nav « Rapports & bilans ») | **fait** (2026-09-30) — filtres période + raccourcis, 4 KPI avec variation vs période précédente, tableau « Performance des agences », indicateurs opérationnels existants conservés (hors maquette mais déjà exposés par l'API), raccourcis vers les écrans détaillés. Histogramme CA / répartition paiements / synthèse fidélité / planification omis (§2) |
| 08 Rapports & bilans | Bilan journalier et performance caissiers | — | **non construit** : quasi intégralement dépendant d'agrégats absents (recettes par mode de paiement et par heure, performance par caissier, remises du jour). Les données existantes (clôture de caisse théorique/compté/écart) sont déjà sur `/cash/closures/:id` ; lien depuis « Rapports détaillés ». Voir §2 |
| 10 Multi-agences | Vue consolidée multi-agences, détail par agence | `pages/multiagency/MultiAgencyOverviewPage.tsx` (route `/multi-agences`), `MultiAgencyDetailPage.tsx` (`/multi-agences/:id`), permission `reports.view` | **fait** (2026-10-01) — KPI réseau, évolution du CA, classement et comparaison inter-agences, alertes opérationnelles, détail par agence (atelier, comparaison au réseau, clients/fidélité, retards/impayés, équipe présente, historique récent) — tout dérivé de données réelles, aucun objectif/cible ni statut « en ligne » fabriqué (détail complet en §2) |
| 09 Paramètres | Paramètres (hub) | `pages/SettingsPage.tsx` (route `/settings`) | **fait, refonte complète livrée** (2026-10-02) — 4 groupes (Structure/Opérations/Finance & services/Plateforme), 16 cartes réelles, panneau « Dernières modifications » (`GET /settings/recent-changes`), « État global » honnête. Détail complet en §2 « Hub Paramètres + Branding + Opérationnel » |
| 09 Paramètres | Branding du pressing | `pages/settings/BrandingSettingsPage.tsx` (route `/settings/branding`) | **fait, renforcement livré** (2026-10-02) — workflow brouillon/publication/versions restaurables, palette avec validateur de contraste AA (aperçu seul), monogramme, site web, mentions légales, pied/conditions de ticket réellement imprimés. Détail complet en §2 |
| 09 Paramètres | Sécurité (politique de mots de passe) | `pages/settings/SecuritySettingsPage.tsx` (route `/settings/security`) | **fait** (2026-09-30) — pas d'écran dédié dans la maquette : mise en page calquée sur « Paramètres opérationnels » (node `25:12525`, champs suffixés + bascules) |
| 09 Paramètres | Paramètres opérationnels | `pages/settings/OperationalSettingsPage.tsx` (route `/settings/operational`) | **fait** (2026-10-02) — réglages par agence (codes dépôt, délais plancher, cycle atelier, tarification, fidélité), tous réellement câblés côté backend (pas un formulaire cosmétique). Détail complet en §2 |
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

**09 Paramètres — hub** (node `25:12184`) — **fait** (2026-10-02, détail complet plus
bas dans ce fichier « Hub Paramètres + Branding + Opérationnel ») :
- ~~Bouton « Historique » et journal « Dernières modifications »~~ **fait** — nouvel
  endpoint `GET /settings/recent-changes`, `Agency`/`AppSetting` gagnent
  `use Auditable;`.
- ~~Cartes de catégories sans écran/backend~~ en grande partie refermées :
  **Numérotation** → carte « Codes dépôt » (`/settings/operational`, réel),
  **Horaires et délais** → carte « Délais de traitement » (même écran),
  **Workflow atelier** → carte « Cycle atelier » (même écran), **Mode hors ligne**
  → carte affichage seul (même écran, valeurs stockées mais pas encore appliquées,
  voir plus bas). Restent omises, inchangé : **Promotions** (chantier à part
  entière, voir ci-dessous), **Paiements** (moyens de paiement toujours en `.env`),
  **Tarifs et devise** (`tax_rate` toujours `config/invoicing.php`, non éditable).
- ~~Badges d'état et date de mise à jour par catégorie~~ **fait** — généralisés à
  toute catégorie reliée à un type audité (badge « Modifié »/« À jour » honnête,
  voir détail plus bas), pas seulement branding/sécurité.

**09 Paramètres opérationnels** (node `25:12525`) — **fait** (2026-10-02),
`pages/settings/OperationalSettingsPage.tsx` (route `/settings/operational`),
table `agency_settings`. Détail complet plus bas dans ce fichier. Restent omis :
mode de tarification à 3 options façon maquette (un seul montant minimum réel
existe, pas de sélecteur de stratégie tarifaire), aperçu du workflow à 6 étapes
(reste sur les 4 colonnes réelles d'`AtelierBoard.tsx`).

**09 Branding du pressing** (node `72:21182`) — **fait, renforcement livré**
(2026-10-02, détail complet plus bas) :
- ~~Palette personnalisable + contrôle d'accessibilité~~ **fait** —
  `primary_color`/`secondary_color` + validateur de contraste WCAG AA en direct,
  **aperçu de cette page uniquement** (ne reteinte pas l'app en production,
  chantier CSS runtime à part, toujours non traité).
- ~~Champ « Site web » et mentions/pied de page~~ **fait** — `website`,
  `legal_notice`, `ticket_footer`/`ticket_conditions` (réellement imprimés sur le
  ticket).
- « Modèles de documents » (format papier, afficher/masquer le QR…) : toujours
  **omis** — un seul format réel existe par document, pas de paramétrage de
  gabarit fabriqué.
- Aperçu « mobile client » : toujours **omis**, l'app mobile client (section 14)
  n'existe pas.

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
  `Delivery.signature_path`).
  **Renforcement livré** (2026-10-02, audit de conformité à la maquette initié par
  l'utilisateur à partir de deux captures du design — « Centre de retrait » jugé
  déjà conforme, « Traiter le retrait » avait des écarts réels) :
  - ~~Chronologie atelier horodatée~~ **fait** — réutilise **exactement** le même
    calcul que `OrderDetail.tsx` (`order.items[].status_histories`, déjà chargés par
    `GET /orders/{id}`, aucun nouvel appel backend) via le composant partagé
    `Timeline`.
  - ~~Journal d'audit dédié affiché à l'écran~~ **fait** — réutilise `GET
    /orders/{id}/audit-logs` (`AuditLogController::forOrder()`, déjà construit pour
    la fiche dépôt), même formatage `lib/auditLog.ts`.
  - **Mise en page deux colonnes** (contenu principal + colonne solde/actions
    sticky à droite, comme la maquette) — remplace l'ancienne colonne unique
    `max-w-3xl`.
  - **En-tête enrichi** : boutons « Imprimer le reçu » (réutilise `PrintableTicket`,
    même mécanisme que `OrderDetail.tsx` — pas un nouveau document) et « Modifier
    le client » (lien vers `/clients/{id}/edit`) ; carte client avec avatar,
    téléphone, agence, date de dépôt (toutes ces données étaient déjà renvoyées par
    `GET /orders/{id}`, simplement pas affichées) ; numéro de dépôt désormais
    affiché via `order_number_formatted` (couche d'affichage « Codes dépôt » déjà
    construite pour `OrderDetail.tsx`/le ticket, appliquée ici aussi — c'est bien
    une vue à un seul dépôt).
  - **Vérification des articles** restylée en tableau (en-têtes Article/Restant/
    Quantité à remettre/État) plutôt qu'une simple liste, mêmes steppers −/+
    qu'avant (comportement inchangé).
  - **« État des pièces et remarques »** devient une carte séparée de
    « Réceptionnaire » (regroupement visuel différent, mêmes champs).
  - **Bloc solde en rouge/danger si bloqué** (`Alert tone="error"`, remplace
    l'ancien ton ambre — un retrait bloqué est réellement une condition
    bloquante) ; la dérogation reste accessible dans le même bloc.
  - **« Après confirmation »** : checkbox réelle « Ouvrir le ticket et la facture
    pour impression » (coché par défaut, redirige vers `/orders/{id}/documents`
    après confirmation plutôt que `/pickups` — pas un nouveau document « reçu de
    retrait » fabriqué, réutilise l'écran Ticket et facture déjà construit) + ligne
    informative (pas une case à cocher — rien à activer par occurrence) sur la
    notification automatique du client, voir point suivant.
  - **Nouvel évènement de notification `pickup_completed`** (fermait un vrai écart :
    rien ne notifiait le client après un retrait) — `NotificationSetting::EVENTS`
    += `pickup_completed`, `PickupCompletedNotification`, déclenché dans
    `PickupService::process()` après chaque retrait confirmé, **même mécanisme que
    order_ready/delivery_completed** (respecte les canaux email/SMS activés par
    agence, SMS toujours simulé — aucune passerelle réelle, cohérent avec
    l'existant). Visible dans `/notifications` (nouvelle carte d'évènement) et dans
    `/notifications` → journal. **Décision** : pas de case à cocher par occurrence
    pour « notifier » (incohérent avec le reste de l'app où la notification est un
    réglage d'agence, pas un choix ponctuel) — la section « Après confirmation »
    l'affiche en lecture seule.
  - **« Réseau et synchronisation »** : réutilise exactement la même logique que
    `TicketFacturePage.tsx` (`order.sync_status`/`client_local_uuid`,
    `documents.offline.pending`/`conflict`) — **omise** quand le dépôt est
    `synced` (cas normal), pas de badge « Toujours synchronisé » fabriqué.
  - **Toujours omis**, décision inchangée : capture de signature du réceptionnaire
    (chantier à part — infrastructure de capture/stockage d'image à construire,
    au-delà d'une réécriture de mise en page).
  - Tests : `tests/Feature/Notifications/NotificationTest.php` +1
    (`test_confirming_a_pickup_triggers_its_notification`, mirrors les tests
    `order_ready`/`delivery_completed` existants). Suite complète 374/374 après
    ajout (aucune régression). Vérifié par capture Playwright à 1440px et 390px,
    et par un parcours bout en bout réel (navigateur) : dérogation saisie → retrait
    confirmé → redirection vers `/orders/{id}/documents` → ticket et facture
    affichent les bonnes données.
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

**05 Retraits — Centre de retrait + Traiter le retrait, audit de conformité
2026-10-05** (captures Figma fournies par l'utilisateur, galerie « 05 — Retraits »)
— audit zone par zone du code réel contre les captures (suite logique de l'audit
couleur accent/gold mené le même jour sur la Caisse) :
- **Centre de retrait** jugé **déjà conforme** — les 4 `StatCard`, la carte de
  recherche, « Retraits du jour » et le tableau correspondent exactement aux
  données réelles de `GET /pickups/summary`/`GET /pickups` (vérifié y compris sur
  les valeurs numériques). Aucun changement.
- **Traiter le retrait** — deux écarts réels trouvés et corrigés :
  1. **Bouton « Confirmer le retrait » en vert** (`button('primary', 'md')`) alors
     que la capture le montre en gold — même principe que les CTA finaux de la
     Caisse (`button('accent', 'md')`). Corrigé, sans changement de mise en page
     (contrairement à la Caisse, ce bouton était déjà confiné à la colonne
     latérale sticky, pas une barre pleine largeur — conforme à la capture telle
     quelle).
  2. **Mode de paiement limité à l'espèce** : la capture montre 3 boutons
     (Espèces/Mobile Money/Carte). Sur confirmation utilisateur (« les trois modes
     de paiement sont à prendre en compte »), câblé pour de vrai plutôt qu'en
     façade :
     - **Décision de modélisation (clé)** : réutilise le composant partagé
       `PaymentMethodPicker.tsx` (4 tuiles réelles Espèce/Carte/Flooz/T-Money) déjà
       utilisé ailleurs dans l'app, plutôt que de fabriquer un 3e bucket
       « Mobile Money » générique qui n'existe pas dans l'enum réel
       `Payment.method` (`espece|carte|flooz|tmoney` — « Mobile Money » n'est qu'un
       regroupement d'affichage utilisé côté Caisse pour l'agrégation, pas une
       vraie méthode de paiement sur laquelle créer un `Payment`). L'intention de
       l'utilisateur (« les trois modes sont à prendre en compte ») est honorée
       sans fabriquer une méthode qui n'existe pas.
     - **Première version (asynchrone, correcte mais jugée trop restrictive par
       l'utilisateur)** : espèce immédiate (`recordCashPayment`), carte/Flooz/
       T-Money `en_attente` jusqu'à un callback opérateur
       (`initiateRemotePayment`/`handleWebhook`) — un paiement non confirmé ne
       débloquait jamais seul le retrait. **Remplacée le jour même** sur demande
       explicite de l'utilisateur : « en attendant l'intégration avec les
       agrégateurs, enregistrer ces paiements avec les informations comme le
       numéro de carte ou référence de transaction… au lieu de les laisser en
       attente ».
     - **V1 retenue** : `PaymentService::recordManualPayment()` (nouveau) —
       carte/Flooz/T-Money sont désormais confirmés **manuellement par le
       caissier**, exactement comme l'espèce (`status = 'complete'` immédiat, pas
       `en_attente`), le caissier constatant lui-même la confirmation sur son
       propre terminal/téléphone. `initiateRemotePayment()`/`handleWebhook()`
       restent en place, **inchangés**, pour le jour où un agrégateur sera
       réellement intégré (chemin cible documenté en commentaire dans
       `PaymentService`) — `recordManualPayment()` est un chemin V1 additionnel,
       pas un remplacement.
     - **Décision de sécurité non négociable, prise sans redemander** : jamais le
       numéro de carte complet, qui serait une violation PCI-DSS sérieuse (stocker
       un PAN sans être un prestataire de paiement certifié). Un seul champ
       `payment_reference` générique est capturé — 4 derniers chiffres pour une
       carte, référence de transaction imprimée sur le reçu du terminal pour
       Flooz/T-Money — réutilisant la colonne `payments.external_reference` déjà
       en base (aucune nouvelle colonne). Libellé/placeholder adaptés par méthode
       (`pickup.paymentReference.carte`/`.flooz`/`.tmoney`) + rappel explicite à
       l'écran (« Ne jamais saisir le numéro de carte complet… »).
     - **Référence obligatoire, jamais optionnelle** pour carte/Flooz/T-Money
       (`StoreOrderPickupRequest::payment_reference`, `Rule::requiredIf` sur le
       moyen de paiement) — c'est la seule preuve tracée du paiement en V1, sans
       elle aucune garantie qu'il a réellement eu lieu.
     - `StoreOrderPickupRequest` gagne `payment_method` (nullable,
       `Rule::in(['espece','carte','flooz','tmoney'])`, défaut `espece` côté
       service si omis — rétro-compatible avec les appels existants) et
       `payment_reference` (ci-dessus).
  - **Bug CSS trouvé et corrigé pendant la validation Playwright** (pas par les
    tests backend — deux occurrences, piège déjà documenté mais toujours facile à
    rater) :
    1. Le conteneur principal `<div className="grid gap-4 lg:grid-cols-3">` de
       l'écran n'avait **pas** de classe `grid-cols-1` de base — exactement le
       piège de dimensionnement par contenu maximal déjà documenté sur le
       chantier Caisse (2026-10-05). Invisible avant cette passe faute de contenu
       assez large dans la colonne de droite ; le nouveau sélecteur à 4 tuiles
       `PaymentMethodPicker` a suffi à pousser la page à 527px de large à 390px
       de viewport (confirmé par `document.documentElement.scrollWidth`, pas
       juste à l'œil). Corrigé par `grid-cols-1` en base.
    2. **Nouveau sous-cas du même piège, propre aux tableaux en `flex`** : l'en-tête
       du tableau « Vérification des articles » (`role="row"` en `flex` avec une
       colonne `flex-1` + 3 colonnes `shrink-0` fixes) n'était enrobé d'aucun
       `overflow-x-auto`/`min-w-[...]`, contrairement à la convention déjà établie
       pour ce cas précis (voir `ServicesPage.tsx`, commit `fc75065`, déjà notée
       plus haut dans ce fichier) — à 390px, les 3 colonnes fixes (112px+128px+128px
       + les `gap-4`) dépassaient déjà la largeur de la carte avant même la
       colonne `flex-1` « Article », qui se retrouvait réduite à ~0 et laissait son
       texte chevaucher visuellement la colonne suivante (« ARTICLE »/« RESTANT »
       rendus collés, repéré sur une capture, pas par `tsc`/les tests). Corrigé en
       enrobant l'en-tête **et** la liste (même conteneur scrollable, pas deux
       séparés) dans `overflow-x-auto` + `min-w-[680px]`, suppression du
       `flex-wrap`/`basis-full` devenu inutile sur les lignes (le tableau défile
       horizontalement dans sa carte plutôt que de tenter de tout faire tenir).
  - Tests : `tests/Feature/Pickups/PickupTest.php` +3 (un paiement Flooz avec
    référence débloque le retrait immédiatement comme l'espèce, facture `payee` ;
    un paiement carte sans référence est rejeté — 422 ; une méthode de paiement
    invalide est rejetée). Suite complète 418/418 après ajout (aucune régression).
    Vérifié aussi par Playwright bout en bout, **parcours réel complet** (pas
    seulement HTTP) : connexion → dépôt + facture créés via l'API → sélection
    Flooz → saisie du montant et de la référence → clic réel sur « Confirmer le
    retrait » → redirection vers `/orders/{id}/documents` → vérifié en base que
    le paiement est `complete` avec la référence saisie et la facture `payee`.
    1440px et 390px, aucun débordement.

**Encaissement des factures impayées — même design V1 étendu à l'autre écran
réel** (2026-10-05, demande utilisateur directe « Fais pareil pour l'encaissement
des factures impayées sur les autres écrans », suite immédiate du chantier Retraits
ci-dessus) — recherche faite avant tout code pour ne pas deviner le périmètre :
`InvoicePanel.tsx` (composant partagé monté dans `OrderDetail.tsx`) est le seul
autre écran qui encaisse réellement un solde de facture impayée et avait
exactement le même bug que l'ancien `PickupProcessPage.tsx` (branche `else` →
`POST /payments/remote` → `setInterval` qui sonde `GET /payments/{id}` toutes les
4s en attendant un webhook d'agrégateur qui n'arrivera jamais en V1).
`InvoicesOutstandingPage.tsx` (écran « Impayés ») n'a **aucune** UI d'encaissement
propre — il ne fait que lister et renvoyer vers `OrderDetail.tsx`, donc rien à y
changer. `SubscriptionsPage.tsx` utilise aussi `PaymentMethodPicker` mais encaisse
des abonnements clients, un domaine distinct des « factures impayées » demandées
explicitement — **hors scope**, non touché.
- **Nouvel endpoint `POST /payments/manual`** (`PaymentController::storeManual()`,
  `StoreManualPaymentRequest`) — même garde `payments.manage` +
  `authorizeAgency()` que `storeCash()`/`initiateRemote()`, appelle
  `PaymentService::recordManualPayment()` **déjà construit** pour les Retraits
  (aucune nouvelle logique métier : carte/Flooz/T-Money confirmés immédiatement
  par le caissier, `status=complete` direct, jamais `en_attente`). `method`
  restreint à `carte|flooz|tmoney` (l'espèce reste sur `/payments/cash`, qui ne
  change pas) ; `reference` obligatoire (`required|string|max:255`) — même
  décision PCI que les Retraits : jamais de numéro de carte complet, 4 derniers
  chiffres ou référence de transaction uniquement, réutilise
  `payments.external_reference`, aucune nouvelle colonne.
- **`PaymentReferenceField.tsx`** (nouveau composant partagé,
  `resources/js/components/`) — extraction du bloc label+input+hint qui existait
  déjà en dur dans `PickupProcessPage.tsx` (même JSX, même comportement), pour
  éviter de le dupliquer une seconde fois dans `InvoicePanel.tsx`. Clés i18n
  migrées de `pickup.paymentReference.*` (namespace devenu trop étroit) vers
  `payment.reference.*` (générique, partagé) — `PickupProcessPage.tsx` mis à jour
  pour utiliser le composant partagé plutôt que son ancien bloc inline,
  comportement inchangé. Parité fr/en revérifiée (script Node, 0 écart).
- **`InvoicePanel.tsx` réécrit** : suppression complète de `pollingPayment`/
  `pollRef`/`useEffect` de nettoyage/`setInterval` — `pay()` appelle désormais
  `/payments/cash` (espèce, inchangé) ou `/payments/manual` (carte/Flooz/
  T-Money, nouveau) et rafraîchit la facture **immédiatement** après la réponse,
  comme l'espèce l'a toujours fait. Champ référence (`PaymentReferenceField`)
  affiché conditionnellement dès qu'une méthode non-espèce est choisie, bouton
  « Encaisser » désactivé tant que la référence est vide pour ces méthodes
  (même garde client que `PickupProcessPage.tsx`, en plus de la validation
  serveur 422). Bouton et libellé unifiés (`payment.pay`/icône `HandCoins` pour
  toutes les méthodes désormais, puisque toutes se terminent de la même façon
  immédiate) — la clé `payment.initiate` (« Initier le paiement ») devenue
  orpheline par cette réécriture a été supprimée des deux dictionnaires plutôt
  que laissée morte.
- Tests : `tests/Feature/Payments/ManualPaymentTest.php` (6 — paiement Flooz
  avec référence règle la facture immédiatement, carte sans référence rejetée
  422, espèce explicitement refusée sur cet endpoint (422, `/payments/cash`
  reste le seul chemin espèce), gating `payments.manage`, paiement partiel
  laisse la facture `partiellement_payee`, `agency_id` d'une agence étrangère
  rejeté pour un utilisateur d'agence). Suite complète 424/424 après ajout
  (aucune régression). `tsc --noEmit` et `npm run build` propres. Vérifié par
  Playwright bout en bout, parcours réel complet (pas seulement HTTP) : connexion
  → dépôt + facture créés via tinker → ouverture de `/orders/{id}` → sélection
  Flooz → saisie référence → clic réel sur « Encaisser » → facture passe à
  « Payée » à l'écran sans aucun état « En attente » intermédiaire, carte
  « Facture entièrement réglée » affichée, dernier paiement montré « Complété ».
  Vérifié séparément à 390px sur un second dépôt/facture : sélection Carte →
  bouton « Encaisser » désactivé tant que le champ « 4 derniers chiffres de la
  carte » est vide, activé dès qu'une valeur est saisie ; aucun débordement
  horizontal (`document.documentElement.scrollWidth === clientWidth`).

**02 Dépôts & POS — audit de conformité 2026-10-05 (5 captures)** — cinq captures
fournies par l'utilisateur (Gestion des dépôts, Dépôt DEP-240928, Ticket et
facture, Nouveau dépôt, Retour en ligne et synchronisation), demande explicite
« même exercice de conformité ». Audit complet (lecture directe du code des 4
écrans + `OrderController`), rapport structuré soumis à l'utilisateur via
`AskUserQuestion` vu le volume d'écarts réels trouvés (contrairement aux audits
précédents de ce projet, ce module avait divergé plus largement de la maquette) —
trois décisions actées : refondre le flux comptoir (paiement intégré à la
création), construire Modifier/Annuler le dépôt, et traiter le reste (liste +
enrichissements fiche dépôt + réagencement Ticket et facture) en une seule
passe avec arrêt après chaque écran. Cette passe couvre le premier chantier
(liste des dépôts) ; les autres restent à enchaîner.

**Gestion des dépôts (`OrdersList.tsx`) — recherche, filtres, colonnes Payé/Reste,
pagination numérotée, export** — fait le 2026-10-05 :
- **Backend** (`OrderController::index()`/nouveau `export()`, refactorés autour
  d'une méthode privée `filteredOrdersQuery()` commune pour que liste et export
  ne divergent jamais) :
  - `search` : correspond au nom/prénom/téléphone du client (`ilike`, même
    convention que `ClientController::index()`) ou au `order_number` brut si le
    terme est numérique. **Limite assumée** : ne recherche pas le code formaté
    affiché à l'écran (`DEP-240928`, préfixe/suffixe par agence calculé à la
    volée par `Agency::formatOrderNumber()`) — le reproduire au niveau SQL pour
    chaque agence aurait été disproportionné pour un champ de recherche ; un
    terme numérique matche le numéro brut.
  - `invoice_status` (nouveau filtre « Statut commercial », distinct du filtre
    `status` existant qui reste l'état atelier) : `non_facture` (`doesntHave`)
    ou une vraie valeur de `Invoice.status`.
  - `period` (`today`/`week`/`month`, sur `created_at`) — **décision de
    simplification** : la capture semblait montrer à la fois un sélecteur
    « Période » et des chips « Jour/Semaine/Mois » potentiellement redondants
    (résolution insuffisante pour trancher avec certitude) ; un seul filtre
    période construit plutôt que de deviner une distinction non lisible.
  - **Agrégats par ligne, calculés une fois par requête (pas de N+1)** —
    `invoice.payments` et `items.treatmentType` eager-chargés, puis décorés en
    mémoire (`decorateForList()`) : `paid_amount`/`balance_due` (même formule que
    `OrderController::show()`/`PickupController`, `null` — pas `0` — si aucune
    facture, pour ne jamais afficher un faux « 0 FCFA payé »), `treatment_name`
    (nom du traitement **uniquement si uniforme** sur toutes les lignes du
    dépôt — `null` sinon, jamais une valeur devinée/moyennée), `pieces_count`/
    `weight_kg_total` (somme séparée des lignes à la pièce vs au kilo — un
    dépôt peut légitimement avoir les deux en mode `mixte`).
  - `GET /orders/export` (nouveau, mêmes filtres, jamais paginé) →
    `OrdersExcelExporter` (nouveau, copie conforme du patron
    `CashLedgerExcelExporter`/`KpiExcelExporter`, PhpSpreadsheet déjà une
    dépendance — aucune nouvelle dépendance).
- **Pagination numérotée** : généralisée dans le composant partagé
  `components/ui/Pagination.tsx` (1 → 2 → 3 … avec ellipses, fenêtre de 7 pages
  max autour de la page courante) plutôt que construite seulement pour cet
  écran — bénéficie du même coup aux **15 autres écrans** qui consomment déjà ce
  composant (`AuditLogsPage`, `UsersPage`, `ClientsList`, `PickupsList`,
  `CashJournalSection`…), sans toucher leur code (même interface
  `meta`/`onPageChange`).
- **Frontend `OrdersList.tsx`** : carte de filtres (recherche débouncée 300ms,
  trois `<select>` Période/Statut commercial/État atelier — ce dernier remplace
  les anciens boutons-pastilles pour s'aligner sur la maquette — + bascule
  « À retirer aujourd'hui » conservée telle quelle, + lien « Effacer » dès qu'un
  filtre est actif), ligne résultats (« N dépôt(s) · Dernière actualisation il y
  a X » — horodatage purement client, rafraîchi par un timer local, pas un
  nouvel appel réseau), bouton Exporter, tableau étendu (colonnes PRESTATION
  — pastille traitement si connu sinon repli Express/Standard —, ARTICLES
  — pièces et/ou kg —, PAYÉ, RESTE — rouge si > 0, vert si soldé).
- **Décision de scope actée, pas un oubli** : colonne SYNCHRO par ligne et
  bouton « Colonnes » configurables — déjà explicitement hors-scope depuis
  l'audit du 2026-10-01 (aucune donnée de sync par dépôt dans la liste, feature
  de personnalisation de colonnes non prioritaire), confirmé inchangé ici.
- **Bug CSS trouvé et corrigé par capture Playwright, pas visible dans le code**
  (nouveau sous-cas du piège déjà documenté « conteneur trop étroit pour son
  contenu ») : les en-têtes de colonnes « CLIENT » et « PRESTATION » se
  chevauchaient visuellement à 1440px (texte « CLIENTSTATION » collé) — la
  colonne client (`flex-1 min-w-0`) se faisait écraser à une largeur quasi nulle
  par les 8 colonnes à largeur fixe désormais présentes (2 de plus
  qu'avant : PAYÉ/RESTE), dont la somme dépassait le `min-w-[960px]` du
  conteneur scrollable. Corrigé en portant ce minimum à `min-w-[1280px]` et en
  donnant à la colonne client un plancher explicite (`min-w-[160px] flex-1` au
  lieu de `min-w-0 flex-1`) côté en-tête et côté lignes, pour qu'elle ne puisse
  plus jamais s'effondrer sous une largeur lisible — le tableau défile
  horizontalement dans sa carte au lieu d'écraser son contenu, cohérent avec la
  convention déjà établie (`ServicesPage.tsx`, `PickupProcessPage.tsx`).
- Tests : `tests/Feature/Orders/OrderListTest.php` (13 — recherche nom/téléphone/
  numéro, filtre statut commercial seul et combiné à l'état atelier, agrégats
  payé/reste avec et sans facture, prestation uniforme vs mixte, pièces vs
  poids, période, export respecte les filtres, isolation inter-agences de la
  recherche). Suite complète 437/437 après ajout (aucune régression — y compris
  sur les 15 écrans qui partagent `Pagination.tsx`, revérifiés par la suite
  existante). `tsc --noEmit` et `npm run build` propres, parité i18n fr/en
  stricte. Vérifié par Playwright bout en bout (navigateur réel, données créées
  via tinker) à 1440px (recherche, filtre « Statut commercial »=Non facturé,
  pagination 2 pages avec changement de contenu confirmé au clic) et 390px
  (`document.documentElement.scrollWidth === clientWidth`, grilles de
  `StatCard` en une colonne, tableau défilant dans sa carte sans déborder la
  page).

**Fiche dépôt (`OrderDetail.tsx`) — carte Client, historique des paiements,
Modifier/Annuler le dépôt** — fait le 2026-10-05, deuxième chantier de l'audit
de conformité Dépôts du même jour (suite directe de `OrdersList.tsx` ci-dessus,
même décision utilisateur : « Oui, construire les deux » pour Modifier/Annuler,
« Tout construire maintenant » pour le reste) :
- **Carte Client** (panneau latéral, avant `InvoicePanel`) : avatar, nom,
  téléphone, « Client depuis le {date} » (neutre, aucune donnée de genre client
  n'existe), points de fidélité et palier (réutilise les badges déjà affichés
  ailleurs), et un bloc « Solde client (autres dépôts) » — nouveau
  `other_balance_due` sur `OrderController::show()`, **même formule exacte**
  que `ClientController::show()` → `balance_due` (factures impayées du client
  en `emise`/`partiellement_payee`) mais **excluant explicitement la facture du
  dépôt courant** (déjà montrée séparément par la StatCard « Reste à payer »)
  pour ne jamais compter le même impayé deux fois à l'écran.
- **Carte « Synchronisation » (4e StatCard envisagée)** : **décision inverse**
  de l'audit initial — en examinant le code, `orders.sync_status` ne reçoit en
  pratique **jamais** d'autre valeur que `'synced'` (posée une seule fois à la
  création, aucun chemin de code ne la fait jamais évoluer vers `pending`/
  `conflict` pour une commande persistée). Une 4e carte sur ce champ aurait
  techniquement lu une « vraie » colonne mais aurait été constante et donc
  trompeuse (toujours « Synchronisé », jamais informative) — **non construite**,
  correction honnête d'un jugement d'audit initial trop optimiste. La fiche
  dépôt garde ses 3 cartes (Statut commercial / État atelier / Reste à payer).
- **Historique des paiements** (`InvoicePanel.tsx`) : remplace l'ancien état
  « dernier paiement » (un seul, écrasé à chaque nouveau paiement partiel) par
  la liste complète et persistante de `invoice.payments` (triée desc par
  `paid_at`) — méthode, montant, date, et l'opérateur qui a encaissé
  (`payment.receiver.name`, affiché seulement si présent). **Piège Eloquent
  évité avant qu'il ne se produise** : c'était le tout premier chargement de
  cette relation dans la base de code (confirmé par grep, zéro usage
  antérieur) ; le nom naturel `receivedBy()` serait entré en collision avec la
  colonne brute `payments.received_by` une fois eager-chargé (`toArray()`
  écrase silencieusement la colonne par l'objet relation, piège déjà documenté
  dans ce fichier) — renommée `Payment::receiver()` avant le premier chargement,
  jamais le bug lui-même. « Ventilation du total » (sous-total/remise/TVA/
  total) : déjà correctement affichée par `InvoicePanel.tsx`, aucun nouveau
  travail requis (vérifié, pas supposé) — une ventilation façon « Express
  +30 % / points utilisés » n'est pas honnêtement reconstructible après coup
  puisque `unit_price` est figé à la création et le ratio de traitement peut
  changer depuis (principe d'immuabilité déjà acté dans ce fichier).
- **Modifier le dépôt** (`PATCH /orders/{id}`, `UpdateOrderRequest`,
  permission `orders.manage`) : **volontairement limité** à `notes`/
  `promised_at`/`is_express` — jamais les articles, prix ou remise (figés dès
  la création, cohérent avec l'immuabilité déjà actée partout ailleurs dans ce
  fichier ; les rouvrir aurait exigé de refaire tourner tout le pipeline de
  tarification/TVA/facture après coup, hors scope). Rejeté (422) sur un dépôt
  `livre` ou `annule` (`NOT_EDITABLE_STATUSES` côté front, même règle testée
  côté backend). Modale légère (overlay `fixed inset-0 bg-black/40`, patron
  déjà utilisé par `RenewLicenseModal` côté superadmin — pas un nouveau
  composant `Modal` partagé inventé pour deux usages).
- **Annuler le dépôt** (`POST /orders/{id}/cancel`, `CancelOrderRequest`,
  motif optionnel) : statut → `annule`, motif concaténé dans `notes`. Rejeté
  (422) si déjà `livre`/`annule`, ou si un `Payment` `status=complete` existe
  déjà sur la facture (annuler un dépôt déjà réglé serait annuler de l'argent
  réellement encaissé — bloqué, pas de remboursement automatique fabriqué).
  Si une facture `emise`/`partiellement_payee` existe sans paiement complet,
  elle passe à `annulee` dans la même transaction.
  **Deux bugs latents trouvés et corrigés avant d'écrire le moindre test**
  (`'annule'` n'avait jamais été atteint en pratique avant cette passe — grep
  confirmé — donc rien n'avait jamais exercé ces chemins) :
  1. `OrderItemStatusTransitioner::transition()` n'avait aucune garde contre le
     statut `annule` de la commande parente — une transition d'article après
     coup aurait fait recalculer `OrderStatusSynchronizer::sync()` et aurait
     silencieusement **ressuscité** une commande annulée vers un statut en
     cours. Ajouté une garde explicite (rejet) en tête de `transition()`.
  2. Même lacune sur `PickupService::process()` (aucune vérification du statut
     de la commande avant de traiter un retrait) — corrigée symétriquement.
  Les deux corrections sont couvertes par des tests de régression dédiés
  (`test_no_item_status_transition_is_possible_on_a_cancelled_order`,
  `test_no_pickup_can_be_processed_on_a_cancelled_order`).
- **Boutons d'en-tête** : « Modifier le dépôt » (`button('secondary')`,
  icône crayon) et « Annuler le dépôt » (`button('danger')`, icône Ban) ajoutés
  à côté des boutons existants (Imprimer/Ticket et facture/Suivre l'atelier),
  tous deux masqués ensemble dès que le statut n'est plus modifiable — jamais
  affichés sur un dépôt déjà livré ou annulé.
- Tests : `tests/Feature/Orders/OrderDetailEnrichmentTest.php` (4 — solde client
  hors dépôt courant, cas à zéro, exposition de `receiver` sans collision de
  colonne sur l'endpoint commande et sur l'endpoint facture),
  `tests/Feature/Orders/OrderUpdateCancelTest.php` (13 — mise à jour des 3
  champs autorisés, rejet sur dépôt livré/annulé, gating permission/agence,
  annulation sans facture, annulation avec facture impayée qui bascule
  `annulee`, rejet si paiement déjà complet, rejet si déjà livré/annulé, gating
  permission, + les 2 tests de régression ci-dessus). Suite complète 454/454
  après ajout (aucune régression). `tsc --noEmit` et `npm run build` propres,
  parité i18n fr/en stricte. Vérifié par Playwright bout en bout, **parcours
  réel complet** (pas seulement HTTP) à 1440px et 390px : connexion → ouverture
  d'un dépôt → carte Client et solde affichés correctement → « Modifier le
  dépôt » → note modifiée → enregistrée et reflétée à l'écran sans rechargement
  → sur un second dépôt, « Annuler le dépôt » → motif saisi → confirmé → statut
  `annule` en base et à l'écran, boutons Modifier/Annuler/Suivre l'atelier
  correctement disparus, aucun débordement horizontal à 390px
  (`document.documentElement.scrollWidth === clientWidth`).
- **Tableau Articles — en-têtes de colonnes** (fait le 2026-10-05, suite
  immédiate) : barre d'en-têtes ARTICLE/PRIX/ÉTAT (`role="row"`, même langage
  visuel que le patron déjà établi sur `PickupProcessPage.tsx`) ajoutée
  au-dessus de la liste de `OrderItemRow`, visible à partir de `sm:` (masquée
  sur mobile, où les cartes empilées n'en ont pas besoin). **Décision
  délibérée** : ne **pas** collapser `OrderItemRow` en lignes de tableau denses
  façon `PickupProcessPage` — chaque article y porte une barre de progression,
  un panneau de contrôle qualité conditionnel et plusieurs boutons de
  transition de statut ; les forcer dans des colonnes de largeur fixe aurait
  dégradé l'ergonomie sans gain réel, et aucune capture exacte n'était
  disponible pour trancher un réagencement plus profond (capture d'origine
  « Dépôt DEP-240928 » revue dans un tour précédent, non re-disponible pour
  cette passe). La barre d'en-têtes seule comble l'essentiel de l'écart visuel
  (« tableau » perçu) sans rien inventer côté données — chaque colonne reflète
  une information déjà affichée sur la carte (prix de ligne, badge de statut).
  Vérifié par Playwright à 1440px (en-tête alignée avec les prix/badges de
  chaque carte) et 390px (en-tête masquée, aucun débordement). Suite complète
  454/454 inchangée (changement purement frontend).

**Nouveau dépôt — paiement intégré à la création (flux comptoir)** — fait le
2026-10-05, troisième et plus structurant des chantiers Dépôts identifiés par
l'audit de conformité du même jour (5 captures), planifié en mode plan avant
tout code vu l'ampleur (2 agents d'exploration frontend/backend + lecture
directe du code, plan sauvegardé puis exécuté). Capture `Nv_Depot.PNG`
(dossier Drive `Pressing/New`) retrouvée via recherche Drive après être sortie
du contexte — montre un panneau « Paiement et ticket » intégré **directement**
à l'écran de création (tuiles de moyen de paiement, « Montant reçu », « Monnaie
à rendre » calculée, bouton unique) sous un fil d'Ariane à 4 étapes (Client/
Articles/Paiement/Ticket). **Lecture clé** : ce fil d'Ariane est un indicateur
de progression visuel au-dessus d'une page à colonne unique déjà conforme
(jugée telle le 2026-09-30), pas un assistant multi-écrans à reconstruire — la
vraie nouveauté est le panneau de paiement lui-même, ajouté au panier latéral
sticky existant.

- **Constat vérifié avant tout code** : créer un dépôt et l'encaisser étaient
  deux actions totalement déconnectées (`POST /orders` ne touchait jamais
  `Invoice`/`Payment` ; facturation et encaissement se faisaient ensuite,
  séparément, sur `OrderDetail.tsx`). `InvoiceService::createFromOrder()` et
  `PaymentService::recordCashPayment()`/`recordManualPayment()` étaient déjà
  des blocs autonomes et transactionnels — la bonne architecture était de les
  appeler **depuis `OrderController::store()`, dans la même transaction**,
  plutôt que de chaîner 3 appels HTTP côté frontend (ce qui aurait cassé
  l'atomicité du replay hors-ligne : un seul `POST /orders`, déjà idempotent
  via `client_local_uuid`, doit rester l'unique opération rejouable).
- **Paiement strictement optionnel** : bascule « Encaisser à la création »
  (off par défaut) — un dépôt sans aucun champ de paiement soumis se comporte
  **exactement comme avant** (aucune facture créée, cas normal pour un client
  facturé plus tard ou qui paiera au retrait). Les 18 tests existants
  d'`OrderCreationTest.php` n'ont demandé aucune modification.
- **« Montant reçu »/« Monnaie à rendre » restent purement frontend, jamais
  persistés** — aucune colonne n'existe ni n'a été ajoutée pour la monnaie
  rendue (concept absent de tout le modèle de données, propre à l'espèce).
  Le montant réellement appliqué (`payment_amount`) est plafonné **côté
  serveur** à `min(payment_amount, invoice.total_amount)` avant transmission à
  `PaymentService` — jamais un paiement enregistré plus grand que la facture,
  même si le frontend calcule mal ; un montant inférieur au total reste un
  paiement partiel valide (`partiellement_payee`), cas déjà supporté ailleurs
  (Retraits, `InvoicePanel`).
- **Référence obligatoire pour carte/Flooz/T-Money, jamais pour l'espèce** —
  même règle PCI déjà actée pour Retraits/`InvoicePanel` (`Rule::requiredIf`),
  réutilise `PaymentMethodPicker.tsx`/`PaymentReferenceField.tsx` tels quels,
  aucun nouveau composant de paiement.
- **Garde RBAC explicite, pas supposée** : quand des champs de paiement sont
  soumis, `store()` vérifie désormais `invoices.manage` **et**
  `payments.manage` en plus de `orders.manage` déjà requis — tous les rôles
  actuels avec `orders.manage` (accueil/manager/admin) ont déjà les deux
  (`PermissionSeeder`), mais l'app supporte des rôles custom
  (`RoleManagementTest` le confirme) : un rôle personnalisé avec seulement
  `orders.manage` ne doit pas silencieusement hériter d'une capacité de
  facturation.
- **Redirection post-soumission** : `/orders/{id}/documents`
  (`TicketFacturePage.tsx`, déjà construit) au lieu de `/orders/{id}` — ferme
  la boucle vers l'« étape 4 : Ticket » de la capture sans fabriquer un
  nouvel écran d'impression. Le flux hors-ligne est inchangé (pas de
  navigation, le dépôt reste en file jusqu'à synchronisation).
- **Hors-ligne** : les champs de paiement voyagent dans le même payload déjà
  mis en file (`queuePendingOrder`/IndexedDB), rejoués par le même
  `POST /orders` au retour réseau — aucune nouvelle mécanique de
  synchronisation. `PendingOrderPayload` (`lib/offlineDb.ts`), qui avait
  dérivé de `StoreOrderRequest` au fil du temps, a été corrigé et étendu au
  passage (`agency_id`, `intake_condition_ids`, `intake_notes`,
  `treatment_type_id`, et les 3 nouveaux champs de paiement).
- **Backend** : `StoreOrderRequest` gagne `payment_method`/`payment_amount`
  (`required_with:payment_method`)/`payment_reference`
  (`Rule::requiredIf` si méthode non-espèce), tous optionnels.
  `OrderController::store()` : garde RBAC avant la transaction si
  `payment_method` est présent ; juste après `$order->save()`, dans la même
  transaction, crée la facture puis enregistre le paiement plafonné ; réponse
  finale étendue à `invoice.payments` (additif, aucun consommateur existant
  cassé).
- **Frontend (`NewOrder.tsx`)** : nouveau bloc « 3 Paiement » inséré dans le
  footer sticky du panier (entre le total TTC et le bouton de soumission) —
  toggle, puis si actif : `PaymentMethodPicker` (4 tuiles), et selon la
  méthode soit « Montant reçu » + « Monnaie à rendre » calculée (espèce) soit
  montant + `PaymentReferenceField` (carte/Flooz/T-Money). Bouton désactivé
  tant que le paiement actif est incomplet (montant nul, ou référence vide
  pour une méthode non-espèce) ; libellé `order.submitAndPay` au lieu de
  `order.submit` quand `payNow` est actif.
- Tests : 9 nouveaux dans `tests/Feature/Orders/OrderCreationTest.php`
  (espèce règle la facture, carte/flooz/tmoney sans référence → 422, avec
  référence → facture réglée, montant surnuméraire plafonné sans erreur,
  dépôt sans paiement → toujours aucune facture, rôle `orders.manage` sans
  `invoices.manage`/`payments.manage` → 403, replay idempotent par
  `client_local_uuid` ne crée pas de second paiement). 3 tests initialement
  en échec à cause d'une hypothèse de TVA à 0 % — corrigés en calculant le
  total attendu via `config('invoicing.tax_rate')` (18 % dans cet
  environnement) plutôt qu'en codant en dur le sous-total. Suite complète
  462/462 après ajout (aucune régression).
- Vérifié par Playwright bout en bout (navigateur réel, utilisateur
  `accueil` scopé agence plutôt que l'admin global, pour éviter la
  complication du sélecteur d'agence d'en-tête) à 1440px et 390px : dépôt
  encaissé en espèce → facture `payee` (1180 FCFA = 1000 + 18 % TVA),
  paiement `complete`, redirection vers `/orders/{id}/documents`, aucun
  débordement horizontal (`scrollWidth === clientWidth`) ; sélection Flooz →
  bouton de soumission désactivé tant que la référence est vide, réactivé dès
  qu'elle est saisie. Comparaison visuelle directe à `Nv_Depot.PNG` : panneau
  de paiement conforme (tuiles de moyen de paiement, montant, référence,
  TOTAL TTC déjà visible au-dessus).
- **Bug trouvé après coup par une capture annotée de l'utilisateur** (pas par
  le smoke Playwright initial, qui n'avait vérifié que l'absence de
  débordement de page, `scrollWidth === clientWidth`, sans zoomer sur le
  panneau lui-même) : `PaymentMethodPicker` était monté avec `layout="wide"`
  (grille 4 colonnes) dans le panier sticky de `NewOrder.tsx`, alors que les
  deux autres écrans qui le montent dans un panneau latéral tout aussi étroit
  (`PickupProcessPage.tsx`, `InvoicePanel.tsx`) utilisent déjà `layout="compact"`
  (grille 2×2) pour cette raison précise — convention existante, pas suivie ici
  par erreur. Résultat à 4 colonnes dans une colonne ~420px : le libellé
  « T-Money » se retrouvait contraint à 81px de large, forcé de passer à la
  ligne (« T-\nMoney »), ce qui donnait une impression de débordement/
  tassement du panneau et rendait le champ « Montant » juste en dessous plus
  difficile à lire. Mesure Playwright confirmant qu'il ne s'agissait pas d'un
  vrai débordement de boîte (`scrollHeight === clientHeight` sur le libellé,
  aucun `scrollWidth` de page dépassé) — un problème de densité/lisibilité,
  pas de clipping. Corrigé en alignant sur la convention déjà établie :
  `layout="compact"`. **Piège de validation noté pour la suite** : un
  `scrollWidth === clientWidth` global ne suffit pas à détecter un
  tassement visuel interne à un composant — comparer aussi à une capture
  réelle (ou zoomer sur la zone concernée) quand plusieurs tuiles/libellés
  sont impliqués. Rebuild (`npm run build`) + `tsc --noEmit` propres,
  revérifié par capture Playwright à 1440px et 390px (y compris au scroll
  maximal mobile, pour confirmer que la barre sticky bas de page ne masque
  jamais durablement le bouton de soumission — convention déjà établie dans
  ce fichier, toujours respectée).

Ce module (02 Dépôts) a maintenant un seul chantier restant : réagencement de
**Ticket et facture**.

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

**06 Caisse — renforcement complet (KPI, graphiques, journal unifié, panneaux
latéraux)** — fait le 2026-10-05, sur audit de conformité à 3 captures Figma fournies
par l'utilisateur (« Centre de caisse », « Nouveau mouvement de caisse », « Clôture et
rapprochement journalier »). Audit direct du code (pas supposé) a confirmé que les
points déjà listés ci-dessus comme « fait » étaient bien réels, mais que chaque écran
Figma montrait une bonne moitié de contenu absent du code (KPI en-tête, graphiques,
un vrai journal filtrable, et surtout une **mise en page à deux colonnes** sur les 2
formulaires avec des panneaux latéraux entiers). L'utilisateur a tranché via
`AskUserQuestion` : construire le renforcement complet (pas une implémentation
partielle). Plan détaillé en mode plan (2 agents d'exploration + 1 agent de
conception) approuvé avant tout code, vu l'ampleur (nouveaux agrégats, décisions de
modélisation réelles).

- **`CashService` — nouvelles méthodes d'agrégation**, toutes réutilisant les
  formules déjà standardisées ailleurs plutôt que d'en réinventer : `dailyStats()`
  (recettes/dépenses **du jour calendaire**, distinct de `previewBalance()` qui
  raisonne depuis la dernière clôture ; impayés = formule exacte
  `InvoiceController`/`OrderController` ; dernière clôture ou `null`, jamais un
  écart à 0 fabriqué), `paymentBreakdown()` (ventilation par moyen depuis la
  dernière clôture, pourcentage calculé côté backend pour qu'il ne puisse jamais
  diverger d'un arrondi frontend), `flowSeries()` (flux quotidien sur 14 jours,
  calqué sur `MultiAgencyService::revenueSeries()`, trous comblés à 0),
  `operatorsForDate()` (copie du patron `MultiAgencyService::teamPresent()` borné à
  une date passée en paramètre plutôt qu'à « maintenant »), `closurePrecheck()`
  (mêmes conditions **exactes** que les deux verrous réels de `closeRegister()` —
  pas une estimation séparée qui pourrait diverger), `eligibleValidators()`
  (collaborateurs de l'agence/pressing réellement habilités `payments.manage`,
  jamais une liste figée).
- **`app/Services/CashLedgerService.php`** (nouveau) — « Journal de caisse »
  **unifié** : assemble `CashMovement`/`Payment`/`CashClosure` d'une agence en un
  flux chronologique unique via `unionAll()` puis enveloppe (`fromSub`) pour les
  filtres (`type`/`status`/`method`/`search`/dates). **Décision de conception
  clé** : le filtre « mode de paiement » de la maquette n'a de sens réel que sur
  les lignes `encaissement` (un `Payment` a un vrai `method`) ; les lignes
  `mouvement` sont toujours en espèces par construction (`CashService` ne gère
  que les espèces manuelles) — `method` y est donc fixé à `espece`, pas un choix
  fabriqué. Filtrage agence/dates **avant** l'union (jamais après, contre toute
  fuite cross-agence) ; `status`/`method`/`search` appliqués **après** l'union sur
  les colonnes déjà normalisées (nécessaire car le statut des clôtures
  — `conforme`/`ecart` — est dérivé de `variance`, pas une colonne brute
  filtrable avant union).
- **Export du journal** : `app/Services/CashLedgerExcelExporter.php` (copie
  conforme du patron `KpiExcelExporter.php`, PhpSpreadsheet déjà une dépendance du
  projet) + `resources/views/cash/ledger-pdf.blade.php` (calqué sur
  `cash.closure-pdf.blade.php`, généré à la volée). Deux routes distinctes
  `GET /cash/ledger/export/pdf` et `/excel` (pas une seule route paramétrée
  `{kind}`, pour rester cohérent avec le patron déjà établi par
  `KpiController::exportPdf()`/`exportExcel()`) — bornes `from`/`to`
  **obligatoires** à l'export (422 sinon), pour ne jamais permettre un export sans
  limite sur tout l'historique de l'agence.
- **Nouvelle route `GET /cash/movements/{movement}`** (show, manquait) +
  **`GET /cash/closures/precheck`**, **`/closures/operators`**,
  **`/movements/eligible-validators`**, **`/stats`**, **`/payment-breakdown`**,
  **`/flow-series`** — toutes gardées par le même `payments.manage` que
  l'existant (pas de nouvelle permission). **Piège d'ordre de routes respecté** :
  chaque route littérale (`eligible-validators`, `precheck`, `operators`)
  déclarée **avant** sa route à paramètre correspondante
  (`{movement}`/`{closure}`), sinon Laravel tente un model-binding sur le segment
  littéral.
- **Décisions de scope actées** (faute de donnée réelle correspondant exactement
  à la maquette, pas des oublis) :
  - **« Synchronisation hors ligne »** (écran Centre de caisse) : la file
    IndexedDB (`useOnlineStatus()`/`useSyncQueue()`) ne couvre que les commandes
    comptoir, n'est pas scopée par agence, et aucune écriture de caisse n'y
    transite. Afficher des « dépôts en attente » façon maquette aurait été
    trompeur ou fabriqué — la carte se limite à la pastille réelle En ligne/Hors
    ligne + un texte honnête, sans liste ni bouton Synchroniser actif.
  - **« Double contrôle requis » avec des approbateurs nommés** : aucune table
    d'affectation de « validateurs désignés » n'existe, et `payments.manage` est
    partagé par 3 rôles sans hiérarchie (`accueil`/`manager`/`admin`, confirmé
    dans `PermissionSeeder.php`). La carte montre la règle réelle (seuil +
    « tout collaborateur habilité peut valider ») et la liste réelle des
    collaborateurs éligibles (`GET /cash/movements/eligible-validators`), avec
    leur **nombre réel** — jamais forcé à un nombre fixe. Testé explicitement
    (`test_eligible_validators_lists_only_real_users_with_the_payments_manage_permission`
    vérifie que le compte n'est jamais figé à 2).
  - **Statut « vérifié »/« en attente » des opérateurs** : dérivé honnêtement de
    `Attendance.clock_out` (pointage terminé = « vérifié », encore en poste =
    « en attente ») — pas de nouvelle colonne de validation RH.
  - **« Rapport de clôture » avant la clôture elle-même** : impossible par
    construction (le PDF n'est généré que dans la transaction
    `closeRegister()`) — la carte montre un état désactivé/explicatif avant
    clôture, et le vrai PDF de la **dernière** clôture existante sinon.
  - **Distinction dépôt/solde sur `Payment`** : reste différée (contrainte déjà
    actée ci-dessus) — la Synthèse détaillée de clôture affiche les totaux réels
    sans cette ventilation.
- **Frontend — nouveaux composants réutilisables** : `components/ui/SegmentedBar.tsx`
  (barre segmentée horizontale CSS pure, aucune dépendance de graphique dans ce
  projet — voir `RevenueBars.tsx` pour le même principe), `components/ui/CashFlowBars.tsx`
  (histogramme à deux séries entrées/sorties, même technique que `RevenueBars.tsx`).
  `pages/cash/CashJournalSection.tsx` (table filtrable/paginée/exportable, patron
  `AuditLogsPage.tsx` copié : filtre card → liste à colonnes fixes dans
  `overflow-x-auto` → `Pagination`). `pages/cash/CashMovementDetailPage.tsx`
  (nouveau, route `/cash/movements/:id`, mirrors `CashClosureDetail.tsx` — la
  carte « Traçabilité » y est réelle, construite depuis `created_at`/`created_by`/
  `validated_at`/`validated_by` déjà en base, via le composant `Timeline` déjà
  utilisé pour la chronologie atelier/audit d'`OrderDetail.tsx`).
  `CashRegisterPage.tsx`/`CashMovementFormPage.tsx`/`CashClosureFormPage.tsx`
  réécrits en profondeur (4 `StatCard` en en-tête — toujours
  `grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-4`/`xl:grid-cols-4` pour les
  montants FCFA, jamais `grid-cols-2` direct —, mise en page à deux colonnes avec
  colonne latérale sticky sur les 2 formulaires).
- **Bug réel trouvé et corrigé pendant la validation Playwright, pas par les
  tests backend** (deux occurrences du même piège CSS Grid, nouveau dans ce
  projet — jusqu'ici jamais rencontré car aucun contenu de ce type n'avait été
  placé dans un conteneur `grid ... lg:grid-cols-N` sans classe `grid-cols-1` de
  base) :
  1. Les 4 `StatCard` de l'écran Clôture, initialement placées **à l'intérieur**
     du conteneur deux-colonnes (`lg:grid-cols-[1fr_320px]`), se faisaient
     tronquer même à 1440px — parce que leur ligne de 4 cartes héritait de la
     largeur de la colonne gauche (plus étroite que la page entière), pas de la
     page. **Corrigé** en sortant la rangée de `StatCard` du conteneur deux-
     colonnes (pleine largeur, au-dessus), comme c'était déjà le cas sur l'écran
     Centre de caisse.
  2. Plus subtil : le conteneur `<div className="grid items-start gap-6
     lg:grid-cols-2">` (et les deux variantes `lg:grid-cols-[1fr_320px]`) n'avait
     **pas** de classe `grid-cols-1` de base — ce patron existe pourtant déjà
     dans toute l'app (`ProfilePage.tsx`, `UsersPage.tsx`, `DeliveriesPage.tsx`,
     etc.) sans jamais poser problème, car `lg:grid-cols-N` de Tailwind émet
     `repeat(N, minmax(0, 1fr))` (largeur bornée), mais **en dessous de `lg`**,
     sans classe de base, aucune `grid-template-columns` ne s'applique du tout :
     la grille dimensionne alors sa piste implicite sur le **contenu max**, pas
     sur le conteneur. La légende de `SegmentedBar` (`<ul className="flex
     flex-wrap ...">`) en est l'exemple qui a révélé le bug : un conteneur
     `flex-wrap` ne limite la largeur **visible** qu'une fois l'espace
     contraint, mais pour le calcul du contenu max (`max-content`) que CSS Grid
     utilise pour dimensionner une piste `auto` non contrainte, le navigateur
     raisonne « comme si tout tenait sur une seule ligne » — ce qui poussait
     toute la page à 676px de large à 390px de viewport (confirmé par
     `document.documentElement.scrollWidth` via Playwright, pas seulement à
     l'œil sur une capture). **Corrigé** en ajoutant `grid-cols-1` explicite en
     base sur les 3 conteneurs deux-colonnes de ce chantier (`CashRegisterPage.tsx`,
     `CashClosureFormPage.tsx`, `CashMovementFormPage.tsx`) — ce qui émet
     `repeat(1, minmax(0, 1fr))`, une piste bornée au conteneur même avant `lg`.
     **Les patrons `lg:grid-cols-[minmax(0,...)fr_...]` déjà utilisés ailleurs
     dans l'app ne sont pas affectés** (aucun n'a encore combiné ce conteneur
     avec un enfant `flex-wrap` au contenu large) mais le même correctif
     (`grid-cols-1` de base) est la bonne pratique à appliquer d'emblée sur tout
     futur écran combinant `grid lg:grid-cols-*` avec un enfant dont le contenu
     ne tient pas naturellement sur une ligne en dessous de `lg`.
  3. Troisième correctif mineur du même audit : les deux boutons d'export
     (PDF/Excel) du Journal de caisse se chevauchaient à 390px (texte `whitespace-nowrap`
     débordant visuellement de leur bouton rétréci) — leur conteneur `flex gap-2`
     n'avait pas `flex-wrap` contrairement au patron déjà établi par
     `KpiPage.tsx` (`flex flex-wrap items-center gap-2` pour ses propres boutons
     d'export). Corrigé en ajoutant `flex-wrap`.
- Tests : `tests/Feature/Cash/CashDashboardStatsTest.php` (6 — `stats`/
  `payment-breakdown`/`flow-series`, trous comblés à 0, le paramètre `agency_id`
  d'un utilisateur local est bien ignoré au profit de sa propre agence),
  `tests/Feature/Cash/CashLedgerTest.php` (9 — union des 3 sources, chaque
  filtre, isolation cross-agence, export PDF/Excel, 422 sans bornes de date),
  `tests/Feature/Cash/CashMovementTraceabilityTest.php` (4 — show + 403 croisé
  agence, validateurs éligibles réels, utilisateurs inactifs exclus),
  `tests/Feature/Cash/CashClosurePrecheckTest.php` (5 — `precheck` strictement
  identique aux verrous réels de `closeRegister()`, statut opérateur dérivé de
  `clock_out`). Suite complète 415/415 après ajout (aucune régression). Vérifié
  aussi par smoke test Playwright bout en bout (navigateur réel, données réelles
  créées via les endpoints — pas fabriquées) sur les 3 écrans, à 1440px et 390px,
  avec vérification explicite de l'absence de débordement horizontal
  (`document.documentElement.scrollWidth === clientWidth`) suite aux deux bugs
  CSS Grid trouvés en cours de route.

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
  du reste du projet — pas de nouvelle dépendance. **QR d'enrôlement** (ajouté
  2026-10-02, demande utilisateur après la Phase 1) : `PlatformAuthController::login()`
  renvoie désormais `qr_code_data_uri` à côté de `otpauth_uri`, généré en réutilisant
  tel quel `App\Services\QrCodeGenerator::toPngDataUri()` (déjà la dépendance
  `endroid/qr-code` pour les étiquettes articles) — aucune nouvelle dépendance,
  backend uniquement. La clé secrète en texte reste affichée en repli (saisie
  manuelle si le scan n'est pas possible). Connexion en 2 étapes
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

**Plateforme superadmin — Phase 2 (Utilisateurs transverses)** — fait le 2026-10-01,
sur demande explicite de l'utilisateur après avoir demandé une capture de cet écran
(différé en Phase 1 faute de modèle de permissions) : choix tranché via
`AskUserQuestion` entre « construire pour de vrai » et « juste revoir la maquette »
→ construire pour de vrai, avec un plan détaillé approuvé en mode plan avant tout
code :
- **Premier vrai modèle de permissions pour le personnel Spark** : avant cette
  passe, tout `platform_users` authentifié avait un accès illimité à toutes les
  routes `/api/platform/*` — le damier de permissions de la maquette aurait été
  cosmétique, contraire à la discipline « ne pas fabriquer » du projet. Nouveau
  RBAC **mirrors exactement** le patron tenant (`Role`/`Permission`/
  `role_permission`) plutôt que d'inventer un mécanisme différent :
  `platform_roles` (3 rôles système seedés en migration, même précédent que
  `platform_plans` en Phase 1 : `superadmin` toutes permissions, `admin_transverse`
  gère pressings/utilisateurs/rapports mais pas les licences, `auditeur_transverse`
  lecture seule sur les rapports), `platform_permissions` (4 permissions :
  `pressings.manage`, `platform_users.manage`, `reports.view`, `licenses.manage`),
  `platform_role_permission` (pivot), `pressing_platform_user` (pivot des
  « affectations » par pressing — sans effet pour un superadmin, qui a accès à
  tous les pressings indépendamment de ce pivot).
- **Permissions dérivées du rôle, pas de surcharge par utilisateur** : le damier
  affiché dans le panneau de création/édition est **en lecture seule**, il reflète
  ce que le rôle sélectionné accorde — pas un second mécanisme d'autorisation
  indépendant du premier. Catalogue de rôles fixe en Phase 2 (pas d'écran de
  gestion de rôles, juste un `<select>`, cohérent avec la maquette qui ne montre
  pas un tel écran ici).
- **`PlatformApiController` abstrait** (`authorizePermission`/`authorizePressing`/
  `resolvePressingFilter`, mirrors `ApiController` tenant) dont héritent désormais
  tous les contrôleurs `Api/Platform/*` : `PressingController` (liste/détail scopés
  par affectation pour un non-superadmin ; `update` distingue les champs licence
  — accessibles via `licenses.manage` OU `pressings.manage` — des autres champs —
  qui exigent `pressings.manage` — rendant la 4e permission de la maquette
  réellement signifiante plutôt que cosmétique) et `PlatformDashboardController`
  (agrégats restreints aux pressings affectés pour un non-superadmin, comme un
  manager d'agence tenant ne voit jamais les agrégats réseau complets).
- **Bug de sécurité auto-détecté et corrigé avant tout test** : `PressingController::index`
  utilisait `if ($pressingIds = $this->resolvePressingFilter($user))` (test de
  vérité) — un tableau vide (utilisateur transverse sans aucun pressing affecté)
  est falsy en PHP, donc le filtre de scoping ne se serait silencieusement jamais
  appliqué, exposant tous les pressings à un utilisateur qui ne devrait en voir
  aucun. Repéré en relisant mon propre code avant d'écrire le moindre test,
  corrigé en `$pressingIds = $this->resolvePressingFilter($user); if ($pressingIds
  !== null) { ... }`.
- **`PlatformUserController`** (`GET /users/stats`, `GET/POST /users`, `PATCH
  /users/{id}`, `GET /users/{id}/activity`) : mot de passe temporaire généré et
  affiché **une seule fois** (mirrors `UserController::store` tenant — pas de vrai
  envoi d'invitation par e-mail, même gap déjà documenté côté tenant). Chaque
  changement d'affectation (`sync()` du pivot, qui ne déclenche pas le hook
  `updated` d'Eloquent) écrit une entrée `platform_user.assignment_changed`
  explicite ; les changements de nom/e-mail/rôle/statut sont déjà journalisés
  automatiquement par `PlatformAuditable` (ajouté à `PlatformUser` dans cette
  passe, différé en Phase 1).
- **`PlatformAuthController` étendu** : chaque tentative de connexion journalise
  désormais `login.success`/`login.failed`/`login.locked` — couvre le « Journal
  d'activité » de la maquette sans nouveau mécanisme (réutilise `PlatformAuditLog`/
  `PlatformAuditable` de la Phase 1).
- **Frontend** : `pages/superadmin/UsersPage.tsx` (route `/superadmin/users`)
  mirrors `pages/UsersPage.tsx` tenant — annuaire + panneau latéral sticky (la
  maquette montre un panneau à côté de la liste, pas un écran dédié). KPI (total,
  % MFA activée, invitations en attente = jamais connecté, comptes suspendus) via
  `GET /platform/users/stats`. Filtres pressing/rôle/statut/sécurité MFA. Panneau :
  chips d'affectations retirables + liste à cocher (pressings chargés via
  `GET /pressings?per_page=100` — `per_page` ajouté au contrôleur existant, même
  convention que `OrderController`/`ClientController` côté tenant), `<select>` de
  rôle, damier de permissions en lecture seule (dérivé de l'union des permissions
  de tous les rôles chargés, pas un nouvel endpoint catalogue), badge MFA,
  suspendre/réactiver. Section « Journal d'activité » sous le panneau — formatage
  inline des actions (`describeActivity()`), pas de portage de `lib/auditLog.ts`
  (trop peu de types d'évènements ici pour le justifier, décision actée dans le
  plan). Nav « Utilisateurs transverses » ajoutée à `SuperadminLayout.tsx` (n'est
  plus omise, maintenant réellement construite). Toujours pas d'i18n sur cette
  console (décision Phase 1 inchangée, chaînes françaises codées en dur).
- Tests : `tests/Feature/Platform/PlatformScopingTest.php` (7, le plus important —
  un `admin_transverse` affecté à 2 pressings ne voit/modifie que ceux-là,
  `PlatformDashboardController` n'agrège que ses pressings affectés),
  `PlatformUserManagementTest.php` (7, CRUD + affectations + gating),
  `PlatformActivityLogTest.php` (4, connexion réussie/échouée/verrouillée +
  création journalisées). Suite complète 341/341 après ajout (aucune régression
  sur les 323 tests Phase 1 + tenant). Vérifié aussi par un smoke test Playwright
  bout en bout (navigateur réel, pas juste les tests HTTP) : connexion superadmin
  → création d'un `admin_transverse` affecté à un seul pressing → déconnexion →
  connexion avec ce compte → confirmation qu'il ne voit que son pressing affecté
  dans `/superadmin/pressings` (pas l'autre pressing du registre) et que le nav
  « Utilisateurs transverses » lui reste accessible (il a `platform_users.manage`).
  Captures à 1440px et 390px (aucune troncature, grille KPI en `grid-cols-1
  min-[480px]:grid-cols-2 sm:grid-cols-4`, même convention que partout ailleurs
  dans l'app).
- **Question connexe posée par l'utilisateur pendant cette passe, tranchée** : un
  Pressing créé dans ce registre n'est **pas** automatiquement relié à un véritable
  espace applicatif accessible (aucun provisionnement de base/déploiement — reste
  un simple enregistrement de suivi, cohérent avec la décision d'architecture de
  Phase 1). L'utilisateur a choisi explicitement de ne pas traiter le
  provisionnement maintenant et de continuer sur la Phase 2 — chantier distinct à
  reprendre si prioritaire un jour.
- **Hors scope de cette Phase 2** (inchangé depuis Phase 1, toujours non traité) :
  écran de gestion des rôles eux-mêmes (catalogue fixe), invitation par e-mail
  (mot de passe temporaire affiché à l'admin, comme côté tenant), provisionnement
  réel d'un espace tenant à la création d'un pressing (voir point ci-dessus).

**Pivot multi-tenant — un seul déploiement héberge plusieurs pressings** — fait le
2026-10-02, sur demande utilisateur explicite : *« le super admin [doit pouvoir]
créer un Pressing et ses agences et permettre ensuite au manager du Pressing de
créer/paramétrer son espace et gérer l'opérationnel »*. Inverse directement
l'hypothèse H1 (`docs/ARCHITECTURE.md`) sur laquelle toute l'app reposait jusque-là
— confirmé explicite via `AskUserQuestion` (« vrai pivot, pas une relecture »),
plan détaillé approuvé en mode plan avant tout code vu l'ampleur (touche ~22
contrôleurs, chantier de sécurité/isolation avant d'être fonctionnel) :
- **Modèle de données — footprint minimal** : nouvelle colonne `pressing_id` (FK
  `pressings`, `restrictOnDelete`) sur **seulement 5 tables racines** :
  `agencies`, `users`, `app_settings`, `services`, `treatment_types` (+ 2 de plus
  découvertes en cours de route, `subscription_plans`/`suppliers`, qui avaient un
  `agency_id` nullable « global » sans aucune dimension pressing). **Aucune autre
  table métier n'a été touchée** (orders, clients, invoices, payments,
  cash_movements, cash_closures, stock_movements, deliveries, shifts,
  attendances, order_pickups, audit_logs, customer_subscriptions...) — toutes ont
  déjà `agency_id` non-null, donc scopées **transitivement** via
  `agencies.pressing_id` une fois celui-ci autoritaire. `agencies.code`/
  `services.code`/`treatment_types.code` : unicité `unique()` → composite
  `unique(['pressing_id', 'code'])`. **`users.email` reste unique globalement**
  (décision explicite, pas un oubli) — scoper par pressing aurait exigé un
  sélecteur de pressing au login (gap déjà noté, non construit) pour lever
  l'ambiguïté `User::where('email', ...)->first()` ; garder l'unicité globale
  signifie zéro changement sur `AuthController::login()`. Conséquence acceptée :
  deux pressings ne peuvent pas avoir de personnel avec le même e-mail.
  Migration de backfill (`2026_10_02_300001_...`) : crée un pressing `LEGACY` si
  aucun n'existe déjà et y rattache toutes les lignes existantes avant de poser
  les contraintes NOT NULL — zéro perte de données sur la base de dev déjà
  peuplée, vérifié.
- **`roles`/`permissions` restent un catalogue partagé**, non personnalisable par
  pressing (décision explicite, rôles métier génériques). **`License` (licence
  logicielle du déploiement) reste deployment-wide**, volontairement **non
  fusionnée** avec le nouveau statut opérationnel par pressing
  (`pressings.status`, déjà actionnable par le superadmin via `suspend`/
  `reactivate`) — duplication assumée et documentée, pas un oubli, chantier à
  part si besoin réel un jour.
- **Les deux choke points centraux rendus sûrs, le reste suit sans y toucher** :
  - `User::canAccessAgency()` — `agency_id === null` signifiait avant cette passe
    *accès à absolument toutes les agences de la table* (un utilisateur global
    d'un pressing aurait pu accéder à n'importe quelle agence de n'importe quel
    autre pressing). Réécrite pour vérifier l'agence contre `pressing_id`
    (et, pour un utilisateur local, aussi contre `agency_id` exactement). Tous
    les appels existants à `authorizeAgency()` (déjà présents sur `show`/
    `update`/`destroy` dans ~15 contrôleurs) deviennent automatiquement sûrs
    **sans modifier ces call sites**.
  - `ApiController::resolveAgencyFilter()` — changeait de contrat : retournait
    `?int` (`null` = *« pas de filtre »*, le bug de fond : un utilisateur global
    sans agence choisie ne filtrait **rien du tout**, exposant toute la table).
    Retourne désormais `array<int>` (agences de son pressing, jamais vide) ;
    chaque site appelant passe de `->when($agencyId, ...)` à
    `->whereIn('agency_id', $agencyIds)` — changement mécanique et uniforme,
    donc auditable à 100 % plutôt qu'au cas par cas, appliqué aux 22
    contrôleurs déjà recensés dans le plan.
  - **Cas particuliers hors de ce patron** (filtrent `pressing_id` directement,
    pas via `agency_id`) : `AgencyController`, `UserController` (annuaire),
    `ServiceController`/`TreatmentTypeController` (catalogues). **Contrôleurs à
    une seule agence requise** (pas un tableau) : `AtelierController`,
    `CashController`, `PerformanceController`, `NotificationLogController`/
    `NotificationSettingController` — nouvelle méthode dédiée
    `resolveSingleAgency()` plutôt que de forcer `resolveAgencyFilter()` dans un
    cas qu'il ne couvre pas.
  - **`AppSetting::current()`** change de signature :
    `current(int $pressingId)` (ne peut plus deviner de pressing tout seul) —
    branding/politique de sécurité/etc. sont désormais réellement indépendants
    par pressing, pas un singleton deployment-wide comme avant.
  - **Fuites supplémentaires trouvées par relecture de code, pas par un test
    qui échouait** (aucun test existant n'exerçait un scénario à deux
    pressings avant cette passe) : `KpiService`/`MultiAgencyService` — les vues
    « consolidées/réseau » (`metrics(null, ...)`, `Agency::query()->get()` sans
    filtre) auraient agrégé/listé littéralement toutes les agences du
    déploiement, pas seulement celles du pressing courant, une fois plusieurs
    pressings partagés — corrigé en fil `pressingAgencyIds`/`pressingId` à
    travers les deux services. `TreatmentType::findOrFail()` dans
    `OrderController::store()` (aucun scoping pressing) et le lookup de plan
    global dans `CustomerSubscriptionController::store()` (un plan global d'un
    *autre* pressing passait la validation) — les deux corrigés.
  - **Fuites en écriture** : tout `store()` acceptant un `agency_id`
    client-fourni pour un utilisateur global (`OrderController`,
    `ClientController`, `StockMovementController`, `AttendanceController`,
    `PaymentController`, `DeliveryZoneController`, `SubscriptionPlanController`)
    gagne un appel `authorizeAgency()` avant la création — avant cette passe,
    cette garde n'existait qu'en lecture (`show`/`update`), jamais en écriture.
  - **Nouveau middleware `CheckPressingStatus`** (mirrors `CheckLicenseStatus`),
    alias `'pressing'`, ajouté au groupe `['auth:sanctum', 'license', 'pressing']`
    — bloque (403) toutes les routes tenant authentifiées si
    `$user->pressing->status === 'suspended'` (sauf `/logout`/`/me`). Distinct
    et non fusionné avec `CheckLicenseStatus` (décision ci-dessus).
- **Provisionnement superadmin** (`PressingController::store()`) : crée
  désormais Pressing + première Agence + compte manager bootstrap (rôle admin,
  `agency_id` null, `must_change_password: true`) **dans la même transaction
  DB** — avant cette passe, créer un pressing n'était qu'une ligne de registre,
  sans aucun espace réellement utilisable derrière (confirmé par l'utilisateur
  lui-même en question posée pendant la Phase 2). `StorePressingRequest` gagne
  `agency_code`/`agency_name`/`agency_city`/`manager_name`/`manager_email`
  (requis à la création). Réponse : jeton de rapport (existant, toujours
  affiché une fois) + `manager_email`/`manager_temporary_password` (nouveau,
  affiché une fois). Le superadmin crée **une seule agence initiale** — des
  agences supplémentaires s'ajoutent ensuite via l'écran `/agencies` existant
  (déjà un CRUD complet, maintenant pressing-scopé), pas de UI multi-agences
  dupliquée dans le formulaire superadmin.
- **Frontend** : `PressingFormPage.tsx` gagne deux sections create-only
  (« Première agence », « Compte manager ») avant le bloc existant ; l'écran de
  succès affiche désormais deux cartes « secret affiché une seule fois »
  (nouveau composant `CopyableSecret`, mirrors `TemporaryPasswordBanner` côté
  tenant `UsersPage.tsx`) — compte manager (e-mail + mot de passe temporaire)
  et jeton de rapport, chacune avec son propre avertissement contextuel (le
  jeton de rapport n'a de sens que pour un déploiement réellement séparé qui
  pousse des rapports, pas pour un pressing hébergé ici).
- **Bug latent corrigé en marge, prérequis bloquant pour tout déploiement
  neuf** : `SubscriptionPlanSeeder`/`StockSeeder` (création de `Supplier`)
  n'avaient jamais été mis à jour avec le nouveau `pressing_id` NOT NULL sur
  `subscription_plans`/`suppliers` — `php artisan migrate:fresh --seed` aurait
  cassé sur une base neuve immédiatement après cette passe. Repéré en
  validant la procédure de seed de bout en bout (pas par la suite de tests,
  qui ne passe jamais par les seeders), pas supposé fonctionner.
- Tests : `tests/Feature/Platform/PressingProvisioningTest.php` (provisionnement
  réel → connexion tenant du manager → `GET /me` renvoie le bon `pressing_id` →
  un deuxième pressing peut réutiliser le même code d'agence) et
  `tests/Feature/Tenancy/CrossPressingIsolationTest.php` (le plus important : un
  utilisateur global ne liste/n'atteint jamais les clients/commandes/catalogue
  d'un autre pressing, ni en devinant un id ni via `?agency_id=`, `AppSetting`
  diffère par pressing, écriture cross-pressing bloquée). Nouveau trait
  `tests/Concerns/SeedsTenant.php` (`pressingId()`) pour les rares tests qui ont
  besoin de nommer leur pressing explicitement. **Compatibilité ascendante** :
  les ~300 tests existants (écrits sous l'hypothèse mono-pressing implicite)
  n'ont demandé **aucune réécriture** — `AgencyFactory`/`UserFactory`/
  `ServiceFactory`/`TreatmentTypeFactory`/`SupplierFactory` réutilisent
  silencieusement le premier pressing déjà créé dans la transaction du test en
  cours (ou en créent un à la volée), donc un test qui ne crée jamais
  explicitement deux pressings continue de voir un monde mono-pressing, sans
  changement de comportement. Suite complète 351/351 après ajout (aucune
  régression). Smoke test Playwright bout en bout (navigateur réel, jeton
  Sanctum injecté pour contourner uniquement le flux de connexion MFA
  superadmin — inchangé dans cette passe, déjà couvert par ses propres tests) :
  remplissage du formulaire → écran de succès avec les deux cartes → les
  identifiants manager affichés à l'écran fonctionnent réellement sur
  `POST /api/login` (tenant), `pressing_id` correct, `agency_id` null.
- **Hors scope de cette passe** (décisions documentées, pas des oublis) :
  sélecteur de pressing au login (users.email reste unique globalement, voir
  ci-dessus), fusion `License`/`pressings.status`, dashboard superadmin
  interrogeant les données tenant en direct (reste basé sur les rapports
  poussés périodiquement, `pressing_report_logs` inchangé), personnalisation de
  `roles`/`permissions` par pressing, écran de transfert d'un pressing existant
  vers ce modèle hébergé (seul un pressing *créé* via ce flux en bénéficie).

**Hub Paramètres + Branding (brouillon/publication) + Paramètres opérationnels** —
fait le 2026-10-02, sur 3 captures Figma fournies par l'utilisateur (Branding,
Paramètres opérationnels, Hub) avec la demande « vérifie si ces vues sont
effectives… pas d'écart ». Audit direct du code (pas supposé) a confirmé des écarts
réels sur les trois écrans ; l'utilisateur a confirmé vouloir combler les trois
(« hub, branding et opérationnel »), tranché deux points via `AskUserQuestion`
(Branding avec un vrai workflow brouillon/publication/versions plutôt qu'un
enregistrement direct ; les trois chantiers enchaînés sans pause intermédiaire —
dérogation explicite à la discipline habituelle « un chantier → stop », un seul
point de validation à la fin des trois) puis approuvé un plan détaillé en mode plan
avant tout code.

- **Hub « Paramètres »** (`pages/SettingsPage.tsx`, inchangé en route) : nouvelle
  taxonomie à 4 groupes (Structure/Opérations/Finance & services/Plateforme, 16
  cartes réelles au total — coïncidence avec le compte de la maquette, pas forcé).
  Chaque carte pointe vers un écran qui existe réellement (y compris les 3 cartes
  nouvellement routées vers `/settings/operational` : Codes dépôt, Délais de
  traitement, Cycle atelier, Tarification) ; carte « Paiements » explicitement
  **omise** (aucune config de moyens de paiement n'existe, toujours `.env`), carte
  « Promotions » **omise** (chantier à part entière déjà documenté, bien plus gros
  qu'un écart de présentation).
  - **Badges honnêtes** : `Agency` et `AppSetting` gagnent `use Auditable;` (
    `auditAgencyId()` retourne respectivement `$this->id` et `null`, ce dernier
    pressing-scopé et non agence-scopé). Règle générique : badge « Modifié » (bleu)
    si la dernière entrée `AuditLog` du type associé date de < 48h, sinon « À jour »
    (vert) avec la date réelle ; Branding garde en plus son badge « À compléter »
    piloté par la checklist réelle. Catégorie sans type audité associé → pas de
    badge (jamais de statut fabriqué).
  - **Panneau « Dernières modifications »** : nouvel endpoint dédié
    `GET /settings/recent-changes` (`SettingsController::recentChanges()`),
    **volontairement pas** une réutilisation d'`AuditLogController::index()` — son
    filtre `whereIn('agency_id', $agencyIds)` exclurait silencieusement les lignes
    `AppSetting` (`agency_id` toujours `null`, scoping par `pressing_id`). Requête
    dédiée à 3 branches (Agency du pressing courant / AppSetting du pressing / —
    AgencySetting livré ci-dessous), triée desc, limite 5, réutilise le
    `decorate()`/`auditLogLabel()` déjà construits pour la fiche dépôt.
  - **Bug trouvé par capture Playwright, pas par les tests du premier jet** :
    `whereIn('agency_id', $agencyIds)` sans filtre `auditable_type` sur la branche
    Agency laissait fuiter n'importe quel modèle audité partageant ce même
    `agency_id` (`Shift`, `Order`…) dans le panneau — corrigé en exigeant
    `auditable_type = Agency::class` sur cette branche ; test de régression dédié
    (`test_it_never_shows_unrelated_audited_types_sharing_the_same_agency`, utilise
    `Order::factory()` pour le prouver).
  - **« État global »** remplace l'ancienne « État de configuration » : total réel
    de catégories visibles pour l'utilisateur courant (gating par permission), « à
    vérifier » = nombre avec badge « À compléter » (Branding seul au départ, honnête
    plutôt que de fabriquer d'autres conditions de vérification).
- **Branding du pressing** (`pages/settings/BrandingSettingsPage.tsx`) — premier
  écran de l'app avec un vrai cycle **brouillon → publication → historique
  restaurable** (partout ailleurs c'est un enregistrement direct) :
  - **Modèle de données** : `app_settings` gagne `draft_data` (JSON, fusionné pas
    remplacé à chaque frappe — `PATCH /settings/draft`, debounce 800ms côté front)
    et `draft_saved_at` ; nouvelle table `app_setting_versions` (append-only, même
    principe d'immuabilité que `AuditLog` — jamais de ligne modifiée, chaque
    publication ou restauration **crée** une nouvelle version,
    `restored_from_version_id` chaîne les restaurations sans jamais réécrire
    l'historique). `POST /settings/publish` applique `draft_data` sur les colonnes
    live, crée un snapshot, vide le brouillon, retourne `affected_agencies_count`
    (compte réel d'agences du pressing). `POST /settings/versions/{id}/restore`
    réapplique un ancien snapshot et enchaîne une nouvelle version (jamais de
    retour en arrière destructif).
  - **Nouveaux champs réels** : `primary_color`/`secondary_color` (validées en hex,
    ratio de contraste calculé en direct côté client — `lib/contrast.ts`, formule
    WCAG déjà utilisée pour générer les tokens `brand`/`accent` — **aperçu de cette
    page uniquement**, ne reteinte pas l'app en production, chantier CSS runtime
    séparé déjà flagué plus haut dans ce fichier), `monogram`, `website`,
    `legal_notice`, `ticket_footer`/`ticket_conditions` (**réellement injectés**
    dans `resources/views/tickets/pdf.blade.php` et `TicketReceiptContent.tsx`,
    pas juste stockés — remplacent l'ancien texte statique « Merci de votre
    confiance. »).
  - **Décisions de scope explicites** : logo/favicon restent hors du mécanisme de
    brouillon (upload immédiat comme avant — un cycle brouillon sur un fichier
    aurait exigé une distinction fichier-brouillon/fichier-publié jugée hors
    scope) ; pas de sélecteur de gabarit de document fabriqué (un seul format réel
    existe par document, ticket thermique et facture A4) ; bloc « Avant
    publication » est un texte informatif statique honnête (les documents et
    l'interface lisent réellement tous la même ligne `app_settings`, donc
    l'affirmation est vraie sans vérification canal par canal fabriquée).
- **Paramètres opérationnels** (`pages/settings/OperationalSettingsPage.tsx`, route
  `/settings/operational`, nouvel écran — mirrors la mise en page de
  `SecuritySettingsPage.tsx`, champs suffixés + bascules) — chantier le plus
  structurant des trois : réglages **réellement câblés**, pas un formulaire
  cosmétique.
  - **`AgencySetting`** (nouvelle table, singleton 1:1 par agence, même pattern que
    `AppSetting::current()` — `forAgency(int $agencyId)` auto-crée avec des
    défauts sûrs). `block_pickup_if_unpaid` **défaut `true`** — préserve
    explicitement le comportement historique (toujours bloqué) tant que personne
    n'a choisi de l'assouplir.
  - **Câblage réel, pas juste stocké** :
    - `PickupService::process()` — le blocage de retrait si impayé (codé en dur,
      toujours actif jusqu'ici — EF-RET-05, gap documenté depuis le chantier
      Retraits) devient `AgencySetting::forAgency($order->agency_id)
      ->block_pickup_if_unpaid`. Ferme ce gap.
    - `OrderController::store()` — `standard_delay_hours`/`express_delay_hours`
      agissent comme un **plancher** sur `promised_at` (`max()` avec la durée
      dérivée du catalogue), jamais un remplacement : ne raccourcit jamais une
      promesse déjà plus longue. `minimum_order_amount` rejette (422) avant toute
      facturation si le total du dépôt est sous le seuil configuré.
    - `AtelierController::board()` expose `washer_step_enabled`/
      `sorter_step_enabled` ; `AtelierBoard.tsx` masque conditionnellement les
      champs responsable Laveur/Classeur (formulaire et lecture seule) quand
      l'étape est désactivée pour l'agence.
    - `Agency::formatOrderNumber()` — couche d'**affichage seul** (préfixe +
      padding + suffixe), ne touche jamais `order_number` (entier brut, toujours
      la source de vérité pour le verrouillage de séquence
      d'`OrderNumberGenerator`). Appliqué **uniquement aux vues à un seul dépôt**
      (`OrderDetail.tsx`, aperçu/impression du ticket, `TicketFacturePage.tsx` via
      `order.order_number_formatted` posé par `OrderController::show()`) —
      **délibérément pas** aux vues en liste (`OrdersList.tsx`, Dashboard,
      `PickupsList.tsx`…) pour éviter un risque de N+1 sur
      `AgencySetting::forAgency()`, ni aux PDF de facture déjà émis (immuabilité
      d'un document financier déjà émis — principe déjà acté dans ce fichier).
    - **Fidélité** : `loyalty_redemption_threshold` câblé côté **frontend**
      (`NewOrder.tsx`, l'effet de pré-remplissage de la remise), pas côté backend
      — `discount_amount` est accepté tel quel par `OrderController::store()`,
      sans validation serveur contre le taux (architecture déjà en place,
      confirmée en lisant le code existant avant d'écrire la solution). La remise
      de palier n'est donc plus pré-appliquée automatiquement que si
      `client.loyalty_points >= (agencySettings.loyalty_redemption_threshold ??
      0)`.
  - **Explicitement affichage seul, pas fabriqué comme « actif »** :
    `offline_sync_interval_minutes`/`offline_retention_days` sont stockés et
    affichés avec un texte honnête (« pas encore lues par le module de
    synchronisation hors ligne ») — `sync.ts` a un `setInterval` au niveau module,
    hors arbre React ; le rendre configurable est un chantier à part, risque jugé
    disproportionné pour cette passe.
  - **Journal des modifications** (carte latérale) : **pas de nouvel endpoint** —
    réutilise directement `GET /audit-logs?type=agency_setting&agency_id=` (déjà
    accessible à `agencies.manage`, la même permission qui garde cet écran) plutôt
    que de dupliquer la logique multi-branches de `recent-changes` ci-dessus
    (`AgencySetting` a un vrai `agency_id`, contrairement à `AppSetting`, donc le
    filtre existant d'`AuditLogController::index()` fonctionne sans adaptation).
- Tests : `tests/Feature/Settings/RecentChangesTest.php` (5), 
  `tests/Feature/Settings/BrandingDraftPublishTest.php` (7, dont la restauration
  cross-pressing — piège de fixtures rencontré : `Pressing::factory()->create()`
  déclenche `PlatformAuditable`, dont la résolution de guard Sanctum sous
  `actingAs()` peut capter l'utilisateur tenant déjà actif et violer une FK vers
  `platform_users` — déjà documenté comme limite connue de `actingAs()` pour
  l'isolation de guards ; corrigé en créant tous les fixtures Pressing/User avant
  tout `actingAs()`, et en créant l'utilisateur « local » avant le pressing
  « étranger » pour éviter qu'`UserFactory` ne lui attribue par défaut le mauvais
  pressing), `tests/Feature/Settings/AgencySettingsTest.php` (6 — singleton,
  gating, format d'affichage sans toucher la colonne brute), + tests étendus
  `PickupTest.php` (blocage désactivable), `OrderCreationTest.php` (délai plancher
  dans les deux sens, montant minimum rejeté). Suite complète 373/373 après ajout
  (aucune régression). Vérifié aussi par smoke test Playwright bout en bout
  (navigateur réel, admin connecté) sur les trois écrans, 1440px et 390px :
  hub (16 cartes, panneau dernières modifications réel) → branding (saisie →
  bandeau brouillon → publier → « 3 agence(s) impactée(s) » → nouvelle version
  dans l'historique) → opérationnel (agence sélectionnée dans l'en-tête → aperçu de
  numérotation live → enregistrer → confirmation).
- **Hors scope de ces trois chantiers** (décisions documentées, pas des oublis) :
  réassociation de `AuditLogController::index()` pour couvrir nativement les
  entités pressing-scopées sans `agency_id` (contournée par l'endpoint dédié du
  hub plutôt que généralisée — aurait élargi un contrôleur partagé sans besoin
  prouvé ailleurs) ; retouche du thème runtime de l'app à partir de la palette
  Branding ; sélecteur de gabarit de document ; onglets Catégories/Tarifs/etc. sur
  le catalogue (déjà différés précédemment, inchangé) ; câblage réel de la
  synchronisation hors ligne ; configuration des règles express/premium par
  article vs traitement (déjà actée comme hors scope dans le chantier Types de
  traitement) ; refresh en direct du panneau « Dernières modifications » de
  l'écran opérationnel après un enregistrement sur cette même page (affiche l'état
  au chargement, comme le panneau équivalent du hub).

**Licence / facturation — gap d'harmonisation tenant ↔ plateforme (constaté le
2026-10-03, corrigé le 2026-10-05 — voir « Superadmin SaaS Phases 0-4 »
ci-dessous)** : audit demandé par l'utilisateur avant
d'investir dans la facturation/paiement superadmin (« regarde ce qui est
développé actuellement côté tenant, voir comment harmoniser avec le côté
superadmin »). État des lieux complet et recommandation détaillée dans
[Superadmin SaaS — État des lieux & plan d'action](https://claude.ai/artifact/GcB6NXP6m4Ac33fcy5xJSK)
(§7 et l'addendum « Décision actée »). Résumé pour ce fichier :
- **Constat** : `License`/`LicensePlan`/`LicensePayment` (tenant, antérieur au
  pivot multi-tenant) restent **deployment-wide** — `License::current()` n'a
  aucune colonne `pressing_id`, jamais touché par la migration de backfill du
  2026-10-02. La permission tenant `licenses.manage` (rôle `admin`) laisse
  n'importe quel manager de pressing créer ses propres `LicensePlan` (prix
  inclus) et s'auto-renouveler via `POST /license/renew` — ce qui, dans le
  modèle multi-tenant partagé actuel, bloque/débloque **tous les pressings du
  déploiement à la fois**, au prix que le client fixe lui-même. En parallèle,
  `pressings.license_expires_at`/`platform_plan_id` (côté plateforme, posés
  lors du pivot) existent en base mais ne sont **jamais lus** par
  `CheckPressingStatus` : deux systèmes de licence qui s'ignorent, un vrai trou
  d'isolation cross-tenant sur l'axe précisément étanchéifié partout ailleurs
  par le pivot (`User::canAccessAgency()`, `resolveAgencyFilter()`).
- **Décision actée (utilisateur, 2026-10-03)** : pour la v1, la facturation
  d'un pressing à Spark reste un **règlement cash/Mobile Money confirmé
  manuellement** par Spark — pas d'intégration Stripe/Paddle pour cette
  version, une phase distincte plus tard. Favorable : `LicensePayment.method`
  est déjà l'enum `['espece', 'carte', 'flooz', 'tmoney']` — `flooz`/`tmoney`
  déjà les bons opérateurs Mobile Money, rien à inventer sur le modèle de
  paiement lui-même.
- **Recommandation retenue, pas encore implémentée** : scoper `licenses` par
  `pressing_id` (même pattern que `AppSetting::current(int $pressingId)`),
  retirer `licenses.manage` du rôle tenant `admin`, fusionner
  `license_plans`→`platform_plans` (prix/devise/durée), fusionner
  `CheckLicenseStatus`/`CheckPressingStatus` en un seul garde qui lit
  `pressing.license_expires_at`, déplacer le renouvellement/l'enregistrement
  de paiement sur `PATCH /platform/pressings/{id}` (déjà gaté par
  `licenses.manage` **plateforme**), créer la ligne `licenses` du pressing dans
  la même transaction que `PressingController::store()`. Décision ouverte :
  l'écran tenant `/license` disparaît-il entièrement ou reste-t-il en lecture
  seule (statut + historique, sans bouton d'action) — seconde option
  recommandée. **À traiter avant toute intégration PSP réelle**, et avant la
  Phase 2 facturation du plan d'action (qui se réduit, avec la décision
  cash/Mobile Money, à ce même chantier d'harmonisation — plus d'effort L
  séparé pour Stripe).
- **Ce qui ne bouge pas** : `SubscriptionPlan`/`CustomerSubscription` (le
  pressing vend des abonnements à ses propres clients finaux) — déjà
  correctement `pressing_id`-scopé depuis le 2026-10-02, aucun rapport avec ce
  gap.

**Superadmin SaaS Phases 0-4 (continuité de compte, paramètres plateforme,
observabilité, harmonisation licence/facturation, opérations cross-tenant)** —
fait le 2026-10-05, sur demande utilisateur explicite (« Phase 0 à 4 selon
l'ordre de priorité de la recommandation »), avec une seule contrainte de
cadence tranchée via `AskUserQuestion` : **tout enchaîner, une seule validation
utilisateur à la fin** (dérogation explicite à la discipline habituelle « un
chantier → stop », comme déjà fait une fois pour le trio Hub/Branding/
Opérationnel). Plan détaillé = celui déjà documenté dans
[Superadmin SaaS — État des lieux & plan d'action](https://claude.ai/artifact/GcB6NXP6m4Ac33fcy5xJSK),
exécuté dans l'ordre recommandé (0 → 1 → 3 → 2 → 4, l'observabilité passant
avant l'harmonisation licence pour disposer d'un journal d'audit sur lequel
vérifier les futures actions de renouvellement/impersonation).

- **Phase 0 — Continuité de compte (`platform_users`)** : photo de profil,
  téléphone, `must_change_password` ajoutés à `platform_users` (mêmes colonnes
  que le modèle tenant `User`, même usage). `PATCH /platform/me` (identité +
  photo), `PATCH /platform/me/password` (`current_password:platform` — guard
  explicite, sans quoi la règle de validation testerait le mauvais guard),
  réinitialisation de mot de passe par un superadmin
  (`POST /platform/users/{id}/reset-password`, mot de passe temporaire affiché
  une seule fois, même convention que côté tenant). Nouvel écran
  `pages/superadmin/ProfilePage.tsx`.
- **Phase 1 — Paramètres plateforme (`platform_settings`)** : premier
  singleton de branding **de la console Spark elle-même** (nom de
  l'application, logo/favicon, couleurs, contacts support, raison sociale) —
  distinct de `AppSetting` (branding d'un pressing tenant). `current()` sans
  dimension pressing (c'est la console elle-même, pas un tenant). Édition
  réservée au rôle `superadmin` (`$this->user()->isSuperadmin()`) — un
  `admin_transverse`/`auditeur_transverse` peut le consulter (logo affiché
  dans sa propre sidebar) mais pas le modifier. Nouvel écran
  `pages/superadmin/PlatformSettingsPage.tsx` (champs désactivés avec alerte
  informative pour un non-superadmin).
- **Phase 3 — Observabilité (`PlatformAuditLogController`)** : le mécanisme
  `PlatformAuditLog`/`PlatformAuditable` existait déjà depuis la Phase 1 du
  chantier Plateforme (2026-10-02) mais, comme `AuditLog` côté tenant avant le
  2026-10-01, **sans aucun endpoint pour le lire** — même angle mort, même
  correctif. `GET /platform/audit-logs` (type `pressing`/`platform_user`,
  filtré par période), gating `reports.view`, scoping identique à
  `PlatformDashboardController` (`admin_transverse` affecté à des pressings
  précis ne voit jamais les entrées `platform_user` concernant d'autres
  membres du personnel Spark — seulement les entrées `pressing` de ses
  pressings affectés). Nouvel écran `pages/superadmin/AuditLogsPage.tsx`.
- **Phase 2 — Harmonisation licence/plateforme** (le chantier le plus
  structurant des cinq, correctif direct du trou d'isolation documenté
  ci-dessus) :
  - **`licenses` devient réellement par pressing** : migration
    `add_pressing_id_to_licenses_table` — colonne `pressing_id`
    (nullable→remplie→NOT NULL+unique), backfill : la licence globale unique
    existante est rattachée au pressing `LEGACY` (ou le plus ancien pressing
    si `LEGACY` n'existe pas), tout pressing sans licence reçoit un essai de
    30 jours, toute licence orpheline (aucun pressing du tout) est supprimée.
    `License::current()` devient `License::current(int $pressingId)` — même
    pattern que `AppSetting::current($pressingId)`, auto-création d'un essai
    de 30 jours si absent.
  - **Fusion des deux gardes** : `CheckLicenseStatus` (ancien, deployment-wide)
    **supprimé**, sa logique absorbée dans `CheckPressingStatus` (devenu le
    seul garde du groupe `['auth:sanctum', 'pressing']` — l'alias `'license'`
    retiré de `bootstrap/app.php`) : vérifie `pressing.status === 'suspended'`
    PUIS `License::current($pressing_id)->refreshStatus()` (expiré → 402 sur
    tout, période de grâce → 402 sur les écritures seulement). Les deux
    conditions qui s'ignoraient avant cette passe sont désormais un seul
    contrôle cohérent.
  - **Pricing déplacé sur `platform_plans`** : `price`/`currency`/
    `duration_days` ajoutés (migration de backfill depuis l'ancienne table
    `license_plans`, par correspondance de `slug` — table legacy laissée en
    base, non destructive, les données y sont déjà copiées). **Bug découvert
    par capture Playwright, pas par les tests** : les 6 plans cosmétiques
    seedés en Phase 1 (starter/essentiel/pro/business/growth/enterprise)
    n'avaient pas d'équivalent dans `license_plans` → restaient `price = null`
    tout en étant `is_active = true` → `PlansPage.tsx`/le sélecteur de
    renouvellement plantaient sur `.toLocaleString()` d'une valeur null.
    Corrigé par la migration elle-même (`whereNull('price')->update(['is_active'
    => false])`) plutôt que côté frontend uniquement, pour que l'API
    `GET /plans` (actifs, utilisée par le sélecteur de renouvellement) ne
    propose jamais un plan sans prix réel ; rendu aussi null-safe côté
    frontend par prudence (`PlansPage.tsx`, modale de renouvellement de
    `PressingsPage.tsx`).
  - **`licenses.manage` retiré du rôle tenant `admin`** (migration dédiée,
    supprime la permission des tables `permissions`/`role_permission` côté
    tenant — elle n'a plus de sens une fois le renouvellement déplacé côté
    plateforme) : un manager de pressing ne peut plus créer ses propres plans
    ni s'auto-renouveler. `LicensePlanController`/les routes `/license/plans`,
    `/license/renew`, `/license-plans*` **supprimés** côté tenant.
    `LicenseController` devient **lecture seule** (`show()`/`history()`,
    aucune permission — informatif, visible à tout utilisateur tenant, cohérent
    avec la recommandation retenue). Frontend : `LicensePage.tsx` et
    `LicenseBlockedScreen.tsx` réécrits sans formulaire de renouvellement,
    `LicenseRenewalForm.tsx` supprimé, carte « Licence » du hub et nav
    toujours visibles pour tous (plus de gating `licenses.manage`) puisque
    c'est maintenant un écran purement informatif.
  - **Renouvellement déplacé côté plateforme** : `POST
    /platform/pressings/{id}/renew` (`RenewPressingLicenseRequest`, gaté
    `licenses.manage` **plateforme** — la permission plateforme, pas la
    permission tenant supprimée ci-dessus), `LicenseService::renew()`
    réécrit pour accepter un `PlatformPlan` (au lieu de l'ancien
    `LicensePlan`) et synchroniser `pressings.license_expires_at`
    (dénormalisé, lu par le dashboard superadmin) à chaque renouvellement.
    Nouveau bouton « Enregistrer un paiement » sur `PressingsPage.tsx`
    (modale : plan, méthode espece/carte/flooz/tmoney, référence externe —
    conforme à la décision actée « paiement cash/Mobile Money confirmé
    manuellement par Spark », pas d'intégration PSP).
  - **Licence créée à la provision d'un pressing** : `PressingController::store()`
    (superadmin) crée désormais une licence (essai 30 jours) dans la même
    transaction que Pressing + Agence + manager bootstrap, et pose
    `pressings.license_expires_at` immédiatement — avant cette passe un
    pressing fraîchement créé n'avait aucune licence tant que
    `License::current()` n'était pas appelé une première fois.
  - **Bug de cross-contamination de guard découvert en écrivant les tests**,
    pas en production (tests uniquement, mais révélateur d'un piège Laravel
    général) : `Auth::shouldUse($guard)` — ce que fait `actingAs($user,
    $guard)` — **mute `config('auth.defaults.guard')` pour le reste du
    test/de la requête**. Un test qui enchaîne `actingAs($superadmin,
    'platform')` PUIS `actingAs($admin)` **sans préciser `'web'`** authentifie
    le second utilisateur contre le guard `platform` au lieu du guard par
    défaut dont dépend la vérification stateful de Sanctum → 401 inattendu.
    Lu le code source de `Illuminate\Auth\AuthManager` pour confirmer avant de
    corriger (pas supposé). Corrigé en passant systématiquement
    `actingAs($admin, 'web')` explicite pour toute assertion tenant qui suit
    un `actingAs` plateforme dans le même test — commenté inline comme piège à
    ne pas répéter.
  - Tests : `LicenseEnforcementTest` entièrement réécrit (isolation
    cross-pressing, renouvellement via la plateforme restaure l'accès, un
    admin tenant ne peut plus renouveler lui-même → 404),
    `ReminderCommandsTest` adapté au nouveau `License::current($pressingId)`,
    `LicensePlanManagementTest` supprimé (fonctionnalité intentionnellement
    retirée), nouveaux `PlatformPlanManagementTest`,
    `PressingImpersonationTest` (voir Phase 4).
- **Phase 4 — Opérations cross-tenant avancées** :
  - **Gestion des rôles plateforme** : `PlatformRoleController::store()`/
    `update()` (création de rôle custom `is_system=false` ; sur un rôle
    système, le nom reste éditable mais les permissions sont immuables — 409
    explicite plutôt qu'un échec silencieux). Écran `pages/superadmin/RolesPage.tsx`.
  - **Gestion des plans plateforme** (CRUD complet, pas seulement la lecture
    de la Phase 2) : `PlatformPlanController::store()`/`update()`, gaté
    `licenses.manage` plateforme. Écran `pages/superadmin/PlansPage.tsx`.
  - **Invitations par e-mail** (fermait un gap documenté des deux côtés,
    tenant et plateforme, depuis les chantiers précédents — « un mot de passe
    temporaire est affiché à l'admin » devient **affiché ET envoyé par
    e-mail**) : `UserInvitationNotification`/`PlatformUserInvitationNotification`
    (canal mail standard Laravel, driver `config('mail.default')` = `log` en
    dev — infrastructure réelle, même mécanisme que `LicenseExpiringNotification`
    déjà existante, pas de nouvelle dépendance). Déclenchées à la création
    d'un compte et à une réinitialisation de mot de passe, des deux côtés
    (`UserController`/`PlatformUserController`). Le mot de passe temporaire
    reste aussi affiché une fois à l'écran (ceinture et bretelles — l'e-mail
    peut échouer/tomber en spam).
  - **Impersonation (« Se connecter en tant que »)** : `POST
    /platform/pressings/{id}/impersonate`, gaté par une nouvelle permission
    plateforme dédiée `pressings.impersonate` (accordée au rôle `superadmin`
    uniquement — volontairement pas `admin_transverse`, agir *en tant que* le
    personnel d'un pressing est plus sensible que simplement le configurer).
    Trouve le compte manager bootstrap du pressing (`agency_id` null, rôle
    `admin`, actif, le plus ancien), émet un vrai jeton Sanctum tenant
    (`$tenantUser->createToken('platform-impersonation:'.$actor->id)`),
    journalise `pressing.impersonated` dans `PlatformAuditLog`. Pont frontend
    dédié `pages/ImpersonateBridge.tsx` (route `/impersonate?token=...`, hors
    de `ProtectedLayout`) : dépose le jeton dans `pm.token` puis redirige vers
    `/dashboard` — ouvert dans un nouvel onglet depuis `PressingsPage.tsx`
    (bouton « Se connecter en tant que »), ne touche jamais `pm.platform.token`
    (stockage séparé, la session superadmin reste active dans l'onglet
    d'origine).
    **Bug découvert et corrigé pendant la validation Playwright, pas par les
    tests backend** (ceux-ci couvraient déjà l'émission et la validité du
    jeton via un appel HTTP brut `Authorization: Bearer`, mais pas le parcours
    navigateur réel) : la page `/impersonate` restait montée dans le même
    arbre React que `AuthProvider` (qui enveloppe toute l'app dans
    `main.tsx`) ; au montage, l'effet de `ImpersonateBridge` pose le jeton
    PUIS déclenche `window.location.href = '/dashboard'`, mais l'effet de
    `AuthProvider` (`loadSession()`) se déclenche **aussi** au même montage et,
    voyant désormais un jeton disponible, lance son propre `GET /me` — requête
    que la navigation qui suit immédiatement **annule en plein vol**. Le
    `fetch` rejette alors avec `TypeError: Failed to fetch` (pas un 401), ce
    qui tombait dans le `catch` de `loadSession()` et effaçait le jeton
    (`setToken(null)`) **avant même que `/dashboard` ne se charge** — la
    nouvelle page démarrait donc avec un `localStorage` déjà vidé et
    redirigeait vers `/login`. Confirmé par instrumentation `console.log`
    temporaire + écoute `page.on('console', …)` en Playwright (la version
    précédente du script de diagnostic n'écoutait pas la console, d'où un
    faux sentiment de ne rien pouvoir observer). **Corrigé** en faisant
    sortir `loadSession()` tôt, sans appel réseau, quand
    `window.location.pathname === '/impersonate'` — cette route ne fait que
    déposer un jeton puis rediriger, `AuthProvider` n'a aucune raison d'y
    tenter sa propre résolution de session. Alternative envisagée et
    écartée : sortir `ImpersonateBridge` de l'arbre `AuthProvider` (aurait
    exigé un second point de montage React, changement plus large pour un
    gain équivalent). Vérifié par un test Playwright isolé (jeton connu
    injecté directement sur `/impersonate`, capture de la console confirmant
    l'absence de tentative `/me` concurrente) puis par le parcours complet
    réel (connexion superadmin → clic « Enregistrer un paiement » → clic
    « Se connecter en tant que » → nouvel onglet → tableau de bord tenant
    pleinement chargé sous l'identité du manager, capture d'écran à l'appui).
  - Tests : `PlatformRoleManagementTest` (4), `PlatformPlanManagementTest` (3),
    `PressingImpersonationTest` (3, dont un test d'authentification HTTP brute
    avec le jeton émis — preuve que le jeton fonctionne réellement, pas
    seulement qu'il est bien formé).
- **Hors scope de ces 5 phases** (décisions documentées, pas des oublis) :
  intégration PSP réelle (Stripe/Paddle) — décision actée 2026-10-03 inchangée,
  cash/Mobile Money confirmé manuellement reste le modèle v1 ; écran de gestion
  fine des permissions plateforme (catalogue de 4 permissions fixe, pas
  d'ajout/suppression de permission à la volée) ; provisionnement réel d'un
  espace tenant distinct par pressing (toujours un seul déploiement partagé,
  cf. pivot multi-tenant) ; préférences utilisateur plateforme (langue/thème —
  la console reste français uniquement, décision Phase 1 du chantier
  Plateforme inchangée) ; sessions actives/déconnexion à distance pour
  `platform_users` (même gap que documenté côté tenant, non traité ici).
- **Validation** : 391 tests backend passants (aucune régression), `tsc
  --noEmit` et `npm run build` propres, parité i18n fr/en stricte (0 écart),
  smoke test Playwright bout en bout (navigateur réel) couvrant les 5 phases :
  changement de mot de passe/profil superadmin, paramètres plateforme (logo/
  couleurs), les 7 écrans superadmin (profil/paramètres/rôles/plans/audit/
  pressings/utilisateurs) à 1440px, ouverture de la modale de renouvellement,
  et le parcours complet renouvellement → impersonation → tableau de bord
  tenant chargé.

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

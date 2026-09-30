# Pressing Manager — notes pour agents

Laravel 12 (API) + React 19/TypeScript (SPA Vite) + PostgreSQL. Multi-agence,
**mono-tenant par déploiement** (une base par client pressing — voir `docs/ARCHITECTURE.md`
hypothèse H1, ne pas remettre en cause sans validation produit).

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
| 00 Vue d'ensemble | Dashboard SPARK PRESSING | `pages/KpiPage.tsx` | à faire |
| 01 Authentification | Authentification staff | `pages/Login.tsx` | à faire |
| 02 Dépôts & POS | Gestion des dépôts (liste) | `pages/counter/OrdersList.tsx` | **fait** (commit `408e94e`) |
| 02 Dépôts & POS | Nouveau dépôt (formulaire) | `pages/counter/NewOrder.tsx` | jugé déjà conforme le 2026-09-30 — hérite des tokens, structure (client→catalogue groupé par catégorie→panier sticky) déjà proche de Figma et plus riche (recherche live, remise fidélité auto, conditions de réception, file offline). Ne pas réécrire sans raison concrète. |
| 03 Clients & fidélité | CRM clients (liste) | `pages/clients/ClientsList.tsx` | **fait** (commit `08a8922`) |
| 03 Clients & fidélité | Nouveau/Modifier client | `pages/clients/ClientFormPage.tsx` (routes `/clients/new`, `/clients/:id/edit`) | **fait** (commit `11de473`, écrans séparés depuis commit `eaf68bf`) — a aussi exposé le champ `notes` (backend déjà prêt, jamais affiché côté front) |
| 03 Clients & fidélité | Fiche client (consultation) | panneau détail dans `ClientsList.tsx` | **fait** — reste un panneau latéral sur la liste (pas de retour utilisateur demandant un écran séparé pour la consultation, contrairement à la création/édition) |
| 06 Caisse | Centre de caisse, Nouveau mouvement, Clôture | `pages/cash/CashRegisterPage.tsx`, `pages/cash/CashMovementFormPage.tsx`, `pages/cash/CashClosureFormPage.tsx`, `pages/cash/CashClosureDetail.tsx` (routes `/cash`, `/cash/movements/new`, `/cash/closures/new`, `/cash/closures/:id`) | **fait** — construit sans accès Figma direct (rate-limit MCP atteint), à partir de la description du gap dans ce fichier + conventions POS standards (mouvements manuels entrée/sortie, clôture = comptage vs théorique avec écart) ; à comparer visuellement à la maquette si l'accès Figma est rétabli |
| 07 Articles & tarifs | Catalogue (liste) | `pages/ServicesPage.tsx` | **fait** (commit `fc75065`, écrans séparés depuis commit `d52b79b`) |
| 07 Articles & tarifs | Création/édition article | `pages/services/ServiceFormPage.tsx` (routes `/services/new`, `/services/:id/edit`) | **fait** (commit `d52b79b`) — retour utilisateur du 2026-09-30 : le design a des écrans dédiés séparés de la liste, pas un panneau/modale inline ; voir convention ci-dessous |
| 08 Rapports & bilans | Rapports, Bilan journalier | `pages/KpiPage.tsx` | à faire |
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
- **Gestion des agences** (section 10, Multi-agences) : `GET /agencies` est en
  lecture seule, aucun CRUD. Pas de vue consolidée multi-agences ni de détail
  d'agence.
- **Atelier en vue Kanban** (section 04) : `OrdersList.tsx` est une liste filtrable
  par statut, pas un tableau Kanban par étape. Amélioration UX, pas un gap de
  données (le modèle `OrderItemStatus` le permet déjà).
- **Superadmin multi-tenant** (section 13) : la maquette suppose une plateforme SaaS
  où un superadmin gère plusieurs pressings indépendants. **Notre architecture est
  explicitement mono-tenant** (voir `docs/ARCHITECTURE.md`). Ne pas coder cette
  section sans clarifier au préalable si c'est une réinterprétation (l'admin global
  actuel = ce superadmin) ou un vrai chantier multi-tenant — décision produit à
  prendre avec l'utilisateur avant tout code.

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

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

### 1. Refonte visuelle écran par écran (en cours, non commencée au niveau page)
Les tokens sont en place ; aucune page n'a encore été restructurée pour suivre les
layouts Figma (cartes, tableaux, densité, composants de la page Design System).
Procéder page par page, un `get_design_context` par écran Figma pertinent, en
réutilisant les composants partagés (`resources/js/components/ui/`) plutôt qu'en
recréant du HTML brut. Écrans desktop disponibles dans la maquette (node id de la
frame top-level, à consommer un par un) :

| Section Figma | Écran(s) | Page(s) actuelle(s) |
|---|---|---|
| 00 Vue d'ensemble | Dashboard SPARK PRESSING | `pages/KpiPage.tsx` |
| 01 Authentification | Authentification staff | `pages/Login.tsx` |
| 02 Dépôts & POS | Gestion des dépôts, Détail, Ticket, Nouveau dépôt | `pages/counter/*` |
| 03 Clients & fidélité | CRM clients, Nouveau/Modifier/Fiche client | `pages/clients/ClientsList.tsx` |
| 06 Caisse | Centre de caisse, Nouveau mouvement, Clôture | **absent, voir §2** |
| 07 Articles & tarifs | Catalogue, Création/édition article | `pages/ServicesPage.tsx` (existe déjà, juste à restyler) |
| 08 Rapports & bilans | Rapports, Bilan journalier | `pages/KpiPage.tsx` |
| 09 Paramètres | Paramètres, Promotions/fidélité, Branding, Notifications | `pages/SettingsPage.tsx`, `pages/LoyaltyPage.tsx`, `pages/NotificationsPage.tsx` |
| 11 Équipe | Utilisateurs, Rôles & permissions, Profil | `pages/UsersPage.tsx`, `pages/RolesPermissionsPage.tsx`, `pages/ProfilePage.tsx` |

### 2. Écarts fonctionnels identifiés vs la maquette (backend + frontend à construire)

Gaps vérifiés en code (pas juste visuels) lors de l'audit du 2026-09-30 :

- **Module Caisse** (section 06) : aucune UI de mouvements de caisse manuels ni de
  clôture/rapprochement journalier. Seul `POST /payments/cash` (encaissement lié à
  une facture) existe. À construire de zéro (backend + frontend).
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

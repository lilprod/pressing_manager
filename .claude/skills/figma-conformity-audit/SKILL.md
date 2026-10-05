---
name: figma-conformity-audit
description: >
  Méthode pour auditer un ou plusieurs écrans de l'application contre des
  captures Figma fournies par l'utilisateur, et pour construire le
  renforcement qui comble les écarts réels sans jamais fabriquer de donnée.
  À utiliser chaque fois que l'utilisateur fournit une ou plusieurs captures
  Figma (ou un lien `figma.com`) et demande de vérifier la conformité d'un
  écran, de dire « est-ce que c'est pareil que la maquette ? », de relever
  les écarts, ou de « mettre à niveau »/« aligner »/« reprendre » un écran
  existant sur son design — même si le mot « audit » ou « conformité » n'est
  pas prononcé explicitement. S'applique à n'importe quel écran ou module de
  l'app (Caisse, Atelier, Clients, Paramètres, etc.), pas seulement à celui
  où la méthode a été développée la première fois. Décrit aussi les pièges
  CSS mobile récurrents de cette stack (Tailwind + grilles) et la discipline
  de vérification/documentation/commit propre à ce projet — à relire avant
  tout nouveau passage de restylage, même partiel.
---

# Conformité aux captures Figma — méthode

Cette méthode vient de plusieurs chantiers réels menés sur cette application
(Caisse, Atelier, Retraits, Multi-agences, Hub Paramètres…) et documentés en
détail dans `CLAUDE.md`. Elle existe parce que ces chantiers ont tous
rencontré les mêmes pièges — et que les éviter dès le départ coûte beaucoup
moins cher que de les découvrir en cours de route. Avant de commencer,
lire `CLAUDE.md` à la racine du projet : il documente déjà, écran par écran,
ce qui a été construit, ce qui a été volontairement omis et pourquoi — un
écart déjà documenté comme « différé » n'est pas un bug à corriger sans en
reparler à l'utilisateur.

Le principe directeur de tout ce qui suit : **ne jamais fabriquer de
donnée**. Un écart visuel qui demanderait d'inventer un agrégat, un champ ou
un comportement que le backend ne peut pas réellement produire aujourd'hui
n'est pas une excuse pour simuler cette donnée côté front — c'est un signal
qu'il faut soit construire le backend qui la rend réelle, soit omettre
l'élément en le documentant honnêtement. Toute la méthode ci-dessous découle
de ce principe.

## 1. Auditer le code réel, pas une impression visuelle

Avant de juger qu'un écran est conforme ou pas, lire directement :
- le composant React de la page concernée (`resources/js/pages/...`),
- le contrôleur et le service backend qui l'alimentent,
- les routes API associées.

Comparer ensuite zone par zone avec la capture Figma : régions de mise en
page, couleurs, typographie, libellés/texte exact, positionnement, et
fonctionnalités (pas seulement l'apparence — un bouton qui existe visuellement
mais ne déclenche rien n'est pas conforme). Un coup d'œil rapide sur une
capture d'écran de l'app suffit rarement à repérer qu'une carte entière de la
maquette n'a pas d'équivalent fonctionnel caché derrière une apparence
similaire, ou qu'un chiffre affiché est en fait toujours à zéro. Lire le code
avant de conclure.

Si plusieurs écrans sont à auditer d'un coup, un agent `Explore` par écran
(en parallèle) pour localiser rapidement les fichiers concernés est
raisonnable — mais la comparaison zone-par-zone elle-même doit rester une
lecture réelle du résultat, pas un résumé de résumé.

## 2. Classer chaque écart, pas seulement le repérer

Pour chaque élément de la capture qui diffère de l'écran actuel, trancher
dans laquelle de ces trois catégories il tombe :

- **(a) Déjà conforme** — l'élément existe et fonctionne, l'écart n'était
  qu'apparent (mauvaise lecture du code, ou détail mineur sans impact).
- **(b) Écart réel, construisible** — une vraie donnée ou un vrai agrégat
  backend permettrait de le construire honnêtement. C'est le cœur du travail.
- **(c) Écart qui demanderait de fabriquer une donnée** — aucune table,
  colonne ou calcul réel ne soutient cet élément (ex. un « score de
  satisfaction » sans système d'enquête, une « dernière synchro » sans file
  de synchronisation réelle, un statut « en ligne » sans télémétrie). Dans ce
  cas : **omettre l'élément**, jamais le simuler — et documenter pourquoi
  (voir §8).

Quand le volume d'écarts (b) à combler est important ou ambigu quant au
périmètre (tout construire en une passe ? une partie ? s'arrêter à l'audit ?),
poser la question à l'utilisateur via `AskUserQuestion` plutôt que de
supposer — ce projet a déjà tranché plusieurs fois ce genre de choix
explicitement (voir les entrées « tranché via AskUserQuestion » dans
`CLAUDE.md`), et se tromper de périmètre coûte cher à annuler après coup.

## 3. Réutiliser l'existant avant d'inventer

Cette application a déjà des patrons établis pour presque tout ce qu'un
écran Figma demande. Avant d'écrire un nouveau composant ou une nouvelle
convention, vérifier s'il en existe déjà un équivalent — le projet a un
historique documenté de bugs évités précisément en généralisant un mécanisme
existant plutôt qu'en le dupliquant :

- **Cartes de KPI avec montant** → `components/ui/Metrics.tsx` (`StatCard`).
- **Chronologie horodatée** (atelier, audit, traçabilité d'un mouvement) →
  `components/ui/Timeline.tsx`.
- **Graphique simple** (barres, répartition) → ce projet n'a **aucune
  dépendance de charting** ; tout est fait en CSS pur (voir `RevenueBars.tsx`
  comme patron à suivre, pas une librairie à ajouter).
- **Table filtrable/paginée/exportable** → le patron `AuditLogsPage.tsx`
  (carte de filtres → liste à colonnes fixes dans `overflow-x-auto` →
  `Pagination`).
- **Téléchargement d'un export** (PDF/Excel) → l'idiome `api.blob()` +
  `URL.createObjectURL` déjà utilisé plusieurs fois.
- **Export Excel côté backend** → copier le patron `KpiExcelExporter.php`
  (PhpSpreadsheet, déjà une dépendance — ne pas en ajouter une autre).
- **Export PDF côté backend** → copier un template Blade existant
  (`resources/views/cash/closure-pdf.blade.php` etc.) + DomPDF.
- **Historique/journal d'un modèle** → vérifier d'abord si le modèle a déjà
  `use Auditable` (trait `App\Models\Concerns\Auditable`, 11+ modèles
  l'utilisent déjà) avant d'inventer un nouveau mécanisme de journalisation.
  Souvent la donnée est déjà captée silencieusement, il manque juste
  l'endpoint pour la lire (`AuditLogController` est le patron).
- **Réglage unique par agence/pressing** → patron singleton
  `AppSetting::current()` / `AgencySetting::forAgency()` : ne jamais chercher
  par id codé en dur, toujours `::query()->first() ?? ::create([...])` puis
  `->refresh()`.
- **Convention de routes** : toute route littérale sous un même préfixe
  (`/cash/movements/eligible-validators`) doit être déclarée **avant** la
  route à paramètre correspondante (`/cash/movements/{movement}`), sinon
  Laravel tente un model-binding sur le segment littéral.
- **Gating de permission** : réutiliser la permission déjà appliquée aux
  endpoints voisins plutôt que d'en créer une nouvelle — et ne jamais
  élargir une permission partagée existante pour un nouveau besoin sans
  relire ses tests actuels (ce projet a un cas documenté où élargir
  `orders.update_status` à un endpoint du personnel a cassé un test qui
  vérifiait explicitement qu'un rôle `livreur` ne devait PAS y avoir accès —
  la bonne réponse était un endpoint dédié, pas une permission élargie).
- **Formule déjà standardisée** (impayés/`outstanding`, chiffre d'affaires du
  jour, présence du personnel…) : grep le nom de la formule ou du concept
  dans les contrôleurs/services existants avant de la rederiver — une
  divergence entre deux calculs du même concept dans deux écrans est un bug
  en soi, même si chacun des deux « marche ».

## 4. Ordre de construction

1. Backend : méthodes de service d'agrégation (en réutilisant les formules
   déjà standardisées), contrôleur, routes.
2. Tests backend (suite complète relancée, pas seulement les nouveaux tests
   — un contrôleur/service déjà utilisé par un autre module peut casser
   silencieusement ailleurs).
3. Composants frontend (nouveaux composants partagés si besoin, sinon
   réutilisation directe).
4. Câblage dans l'écran cible.
5. Validation complète (§6) avant tout commit.

## 5. Pièges CSS mobile propres à cette stack (Tailwind)

Ces quatre pièges ont chacun causé un bug réel, détecté uniquement par
capture Playwright (jamais par les tests automatisés ni par une relecture
visuelle du code) :

- **Grilles de `StatCard` avec un montant** (FCFA) : ne jamais démarrer à
  `grid-cols-2` dès le mobile — `StatCard` tronque sa valeur, et un montant à
  6-7 caractères ne tient pas dans la moitié d'un écran à 390px. Utiliser
  `grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-4` (adapter le nombre de
  colonnes au nombre de cartes). `grid-cols-2` direct reste correct
  uniquement pour des valeurs courtes (compteurs sans unité).
- **Enfant `flex-1` dans une rangée qui doit passer à la ligne au mobile** :
  ajouter `basis-full sm:basis-auto`, sinon il se fait écraser par ses
  voisins au lieu de passer à la ligne.
- **Conteneur `grid ... lg:grid-cols-[...]` (mise en page à deux colonnes,
  panneau latéral) sans classe `grid-cols-1` de base** — le piège le plus
  subtil et le plus facile à rater : en dessous du breakpoint `lg`, Tailwind
  n'émet alors **aucune** `grid-template-columns`, donc la piste implicite
  unique se dimensionne sur le **contenu maximal** (`max-content`) de ses
  enfants plutôt que sur la largeur du conteneur. Un enfant `flex flex-wrap`
  (ex. une légende de graphique) a un `max-content` égal à la somme de tous
  ses éléments mis à plat sur une seule ligne — ce qui pousse silencieusement
  toute la largeur de page à bien plus que le viewport, sans que ça se voie
  à l'œil sur une capture (c'est la mise en page entière qui est trop large,
  pas un élément isolé qui dépasse). Toujours ajouter `grid-cols-1` en base
  sur tout conteneur `grid lg:grid-cols-N` ou `lg:grid-cols-[...]`, même si
  le contenu semble inoffensif — ce patron existe ailleurs dans l'app sans
  avoir encore déclenché le bug, uniquement par chance de contenu.
- **Boutons groupés avec texte `whitespace-nowrap`** (ex. deux boutons
  d'export côte à côte) : le conteneur doit être `flex flex-wrap`, pas
  `flex` seul, sinon le texte déborde visuellement du bouton rétréci à
  largeur étroite.

## 6. Vérifier empiriquement, pas seulement relire le code

Un écran peut sembler correct à la lecture du JSX et pourtant déborder
horizontalement au mobile (voir §5) — la vérification doit donc être un test
réel dans un navigateur, avec de vraies données :

1. Se connecter réellement (Playwright), sélectionner une vraie agence si
   l'écran en dépend.
2. Capturer une capture d'écran pleine page à **1440px** (desktop) et à
   **390px** (mobile) — les deux systématiquement, pas seulement un des deux.
3. À 390px, vérifier explicitement par script
   (`page.evaluate(() => document.documentElement.scrollWidth ===
   document.documentElement.clientWidth)`) l'absence de débordement
   horizontal — c'est cette vérification programmatique, pas la capture
   elle-même, qui a déjà détecté plusieurs bugs invisibles à l'œil.
4. Comparer explicitement, zone par zone, aux captures Figma fournies.

## 7. Porte de validation avant tout commit

Avant de committer quoi que ce soit, tout ce qui suit doit être vert :

- `php artisan test` — suite complète (pas de régression sur les tests
  existants, pas seulement les nouveaux).
- `npx tsc --noEmit` et `npm run build` — propres.
- Script de parité i18n `fr.json`/`en.json` existant — les deux dictionnaires
  à clés plates doivent avoir exactement le même jeu de clés dans les deux
  sens (une clé manquante dans un seul sens est une régression).
- Les vérifications Playwright du §6.

Ne pas committer tant qu'un seul de ces points est rouge.

## 8. Documenter dans CLAUDE.md

Après la livraison, ajouter une entrée dans `CLAUDE.md` au même niveau de
détail que les chantiers déjà documentés (lire quelques entrées existantes
pour calibrer le ton — honnête, précis, qui justifie chaque décision plutôt
que de simplement lister ce qui a été fait). Couvrir :

- ce qui a été audité et ce que l'audit a trouvé (y compris les points déjà
  conformes, pas seulement les écarts),
- ce qui a été construit, avec les décisions de modélisation importantes,
- les décisions de scope explicites — chaque élément omis de la catégorie
  (c) du §2, avec la raison honnête (pas un simple « omis »),
- tout bug trouvé et corrigé pendant le travail, avec la cause réelle
  (pas juste « corrigé ») — ces écritures servent aussi de mémoire pour éviter
  de retomber dans le même piège sur un futur écran (voir §5, déjà alimenté
  par ce mécanisme),
- le résumé de validation (tests, build, i18n, Playwright).

Si le travail touche un nouveau type de piège CSS/structurel qui n'est pas
déjà dans ce fichier Skill ou dans `CLAUDE.md`, l'ajouter aux deux — ce
fichier Skill est lui-même amené à être étendu au fil des chantiers, au même
titre que `CLAUDE.md`.

## 9. Discipline de commit

Un commit par chantier (un écran ou un petit groupe d'écrans directement
liés), message de commit descriptif en français (convention de ce projet),
puis **arrêt pour validation utilisateur** avant d'enchaîner un chantier non
lié. Ne chaîner plusieurs modules indépendants dans une seule passe que si
l'utilisateur l'a explicitement demandé (ce projet a quelques précédents où
l'utilisateur a validé explicitement cette dérogation via `AskUserQuestion` —
sans cette validation explicite, rester sur « un chantier → stop »).

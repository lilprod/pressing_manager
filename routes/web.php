<?php

use Illuminate\Support\Facades\Route;

// SPA React : toutes les routes web (hors /api et /up) servent le même shell. Une
// requête de navigation complète (chargement de page) ne porte jamais le jeton
// Sanctum (celui-ci vit en localStorage, attaché uniquement par les appels fetch
// du JS déjà chargé) — impossible de savoir ici de quel pressing il s'agit (pivot
// multi-tenant, voir CLAUDE.md ; pas de sous-domaine par pressing dans cette app).
// Coquille toujours générique ; la marque réelle du pressing s'applique côté
// client une fois connecté, via SettingsContext (`GET /settings`, qui lui reçoit
// le jeton et peut donc résoudre le pressing).
Route::get('/{any?}', fn () => view('app', ['settings' => (object) ['pressing_name' => null, 'favicon_path' => null]]))
    ->where('any', '^(?!api|up).*$');

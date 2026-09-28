<?php

use App\Models\AppSetting;
use Illuminate\Support\Facades\Route;

// SPA React : toutes les routes web (hors /api et /up) servent le même shell,
// le routage applicatif est géré côté client par React Router. Une closure (plutôt que
// Route::view) est nécessaire pour lire les paramètres du pressing à chaque requête,
// et non une seule fois au chargement des routes.
Route::get('/{any?}', fn () => view('app', ['settings' => AppSetting::current()]))->where('any', '^(?!api|up).*$');

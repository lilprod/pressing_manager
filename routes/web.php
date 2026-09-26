<?php

use Illuminate\Support\Facades\Route;

// SPA React : toutes les routes web (hors /api et /up) servent le même shell,
// le routage applicatif est géré côté client par React Router.
Route::view('/{any?}', 'app')->where('any', '^(?!api|up).*$');

<?php

namespace App\OpenApi;

use OpenApi\Attributes as OA;

#[OA\Info(
    version: '1.0.0',
    title: 'Pressing Manager API',
    description: "API du système de gestion multi-agences d'un pressing (Togo)."
)]
#[OA\Server(url: '/api', description: 'Serveur API')]
#[OA\SecurityScheme(
    securityScheme: 'sanctum',
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'token',
    description: "Jeton Sanctum obtenu via POST /login, à passer en en-tête Authorization: Bearer {token}."
)]
class OpenApiSpec
{
    //
}

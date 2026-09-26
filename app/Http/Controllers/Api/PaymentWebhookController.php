<?php

namespace App\Http\Controllers\Api;

use App\Services\PaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpKernel\Exception\HttpException;

/**
 * Callback des opérateurs (Flooz, T-Money) et du gateway carte.
 *
 * Aucun identifiant réel n'étant disponible en développement, l'authenticité du
 * callback est vérifiée par un secret partagé statique (X-Webhook-Secret), à
 * remplacer par la vérification de signature propre à chaque opérateur en
 * production (voir `config/services.php`).
 */
class PaymentWebhookController extends ApiController
{
    private const METHODS = ['carte', 'flooz', 'tmoney'];

    public function __construct(private readonly PaymentService $payments) {}

    #[OA\Post(
        path: '/webhooks/payments/{method}',
        summary: "Callback opérateur (idempotent par (method, reference)) — pas d'authentification Sanctum",
        tags: ['Paiements'],
        parameters: [new OA\Parameter(name: 'method', in: 'path', required: true, schema: new OA\Schema(type: 'string', enum: ['carte', 'flooz', 'tmoney']))],
        responses: [
            new OA\Response(response: 200, description: 'Callback traité (ou rejoué sans effet)'),
            new OA\Response(response: 404, description: 'Référence de paiement inconnue'),
            new OA\Response(response: 401, description: 'Secret de callback invalide'),
        ]
    )]
    public function handle(Request $request, string $method): JsonResponse
    {
        if (! in_array($method, self::METHODS, true)) {
            throw new HttpException(404, "Opérateur inconnu : {$method}.");
        }

        $expectedSecret = config("services.payment_webhooks.{$method}");
        if ($expectedSecret && $request->header('X-Webhook-Secret') !== $expectedSecret) {
            throw new HttpException(401, 'Signature de callback invalide.');
        }

        $reference = $request->input('reference') ?? $request->input('external_reference');
        $rawStatus = Str::lower((string) $request->input('status'));

        if (! $reference) {
            throw new HttpException(422, "Champ 'reference' manquant.");
        }

        $status = match (true) {
            in_array($rawStatus, ['success', 'succeeded', 'ok', 'completed'], true) => 'success',
            in_array($rawStatus, ['failed', 'failure', 'error', 'declined'], true) => 'failed',
            default => 'unknown',
        };

        $payment = $this->payments->handleWebhook($method, $reference, $status, $request->all());

        if ($payment === null) {
            Log::warning('Callback de paiement sans correspondance', ['method' => $method, 'reference' => $reference]);

            throw new HttpException(404, 'Aucun paiement en attente pour cette référence.');
        }

        return response()->json(['status' => $payment->status]);
    }
}

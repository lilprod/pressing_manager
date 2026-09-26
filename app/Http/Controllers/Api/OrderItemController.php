<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\InvalidStatusTransitionException;
use App\Http\Requests\OrderItem\UpdateOrderItemStatusRequest;
use App\Models\OrderItem;
use App\Services\OrderItemStatusTransitioner;
use App\Services\QrCodeGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use OpenApi\Attributes as OA;
use Symfony\Component\HttpKernel\Exception\HttpException;

class OrderItemController extends ApiController
{
    public function __construct(
        private readonly OrderItemStatusTransitioner $transitioner,
        private readonly QrCodeGenerator $qrCodes,
    ) {}

    #[OA\Patch(
        path: '/order-items/{orderItem}/status',
        summary: 'Change le statut d\'un article en respectant le workflow (voir docs/ARCHITECTURE.md)',
        tags: ['Articles'],
        security: [['sanctum' => []]],
        parameters: [new OA\Parameter(name: 'orderItem', in: 'path', required: true, schema: new OA\Schema(type: 'integer'))],
        responses: [
            new OA\Response(response: 200, description: 'Nouveau statut appliqué'),
            new OA\Response(response: 422, description: 'Transition de statut invalide'),
            new OA\Response(response: 403, description: 'Article hors de l\'agence de l\'utilisateur'),
        ]
    )]
    public function updateStatus(UpdateOrderItemStatusRequest $request, OrderItem $orderItem): JsonResponse
    {
        $this->authorizeAgency($request->user(), $orderItem->agency_id);

        try {
            $item = $this->transitioner->transition(
                $orderItem,
                $request->string('status')->value(),
                $request->user(),
                $request->only(['quality_check_result', 'quality_check_notes', 'is_damaged', 'damage_compensation_amount', 'notes']),
            );
        } catch (InvalidStatusTransitionException $exception) {
            throw new HttpException(422, $exception->getMessage());
        }

        return response()->json($item->load('statusHistories'));
    }

    public function showByQrCode(Request $request, string $qrCode): JsonResponse
    {
        $item = OrderItem::where('qr_code', $qrCode)->firstOrFail();
        $this->authorizeAgency($request->user(), $item->agency_id);

        return response()->json($item->load('order.client', 'service', 'statusHistories'));
    }

    public function qrImage(Request $request, OrderItem $orderItem): JsonResponse
    {
        $this->authorizeAgency($request->user(), $orderItem->agency_id);

        return response()->json([
            'qr_code' => $orderItem->qr_code,
            'data_uri' => $this->qrCodes->toPngDataUri($orderItem->qr_code),
        ]);
    }
}

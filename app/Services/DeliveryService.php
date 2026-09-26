<?php

namespace App\Services;

use App\Exceptions\InvalidStatusTransitionException;
use App\Models\Delivery;
use App\Models\DeliveryZone;
use App\Models\Order;
use App\Notifications\DeliveryCompletedNotification;
use App\Notifications\DeliveryFailedNotification;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class DeliveryService
{
    private const TRANSITIONS = [
        'a_planifier' => ['en_cours'],
        'en_cours' => ['livree', 'echouee'],
        // Une livraison échouée peut être replanifiée (nouvelle tentative), jamais relivrée directement.
        'echouee' => ['a_planifier'],
        'livree' => [],
    ];

    public function __construct(private readonly NotificationService $notifications) {}

    public function createForOrder(
        Order $order,
        string $address,
        ?string $phone,
        ?int $zoneId,
        ?int $livreurId,
        ?int $fee,
        ?\DateTimeInterface $scheduledAt,
    ): Delivery {
        $resolvedFee = $fee ?? ($zoneId ? DeliveryZone::find($zoneId)?->fee : 0) ?? 0;

        return Delivery::create([
            'order_id' => $order->id,
            'agency_id' => $order->agency_id,
            'delivery_zone_id' => $zoneId,
            'livreur_id' => $livreurId,
            'address' => $address,
            'phone' => $phone,
            'fee' => $resolvedFee,
            'status' => 'a_planifier',
            'scheduled_at' => $scheduledAt,
        ]);
    }

    public function assign(Delivery $delivery, int $livreurId): Delivery
    {
        $delivery->livreur_id = $livreurId;
        $delivery->save();

        return $delivery;
    }

    public function transition(Delivery $delivery, string $to): Delivery
    {
        $this->assertAllowed($delivery->status, $to);

        $delivery->status = $to;
        if ($to === 'a_planifier') {
            // Nouvelle tentative : on efface l'échec précédent, on garde le reste de l'historique.
            $delivery->failure_reason = null;
        }
        $delivery->save();

        return $delivery;
    }

    public function complete(
        Delivery $delivery,
        UploadedFile $photo,
        UploadedFile $signature,
        float $latitude,
        float $longitude,
        ?string $notes,
    ): Delivery {
        $this->assertAllowed($delivery->status, 'livree');

        $delivery = DB::transaction(function () use ($delivery, $photo, $signature, $latitude, $longitude, $notes) {
            $disk = Storage::disk(config('filesystems.default'));
            $photoPath = $photo->store("deliveries/{$delivery->id}", ['disk' => config('filesystems.default')]);
            $signaturePath = $signature->store("deliveries/{$delivery->id}", ['disk' => config('filesystems.default')]);

            $delivery->status = 'livree';
            $delivery->delivered_at = now();
            $delivery->latitude = $latitude;
            $delivery->longitude = $longitude;
            $delivery->proof_photo_path = $photoPath;
            $delivery->signature_path = $signaturePath;
            $delivery->notes = $notes;
            $delivery->save();

            return $delivery;
        });

        $delivery->loadMissing('order.client');
        $this->notifications->notify($delivery->agency_id, 'delivery_completed', $delivery->order->client, new DeliveryCompletedNotification($delivery));

        return $delivery;
    }

    public function fail(Delivery $delivery, string $reason): Delivery
    {
        $this->assertAllowed($delivery->status, 'echouee');

        $delivery->status = 'echouee';
        $delivery->failure_reason = $reason;
        $delivery->save();

        $delivery->loadMissing('order.client');
        $this->notifications->notify($delivery->agency_id, 'delivery_failed', $delivery->order->client, new DeliveryFailedNotification($delivery));

        return $delivery;
    }

    private function assertAllowed(string $from, string $to): void
    {
        if (! in_array($to, self::TRANSITIONS[$from] ?? [], true)) {
            throw new InvalidStatusTransitionException($from, $to);
        }
    }
}

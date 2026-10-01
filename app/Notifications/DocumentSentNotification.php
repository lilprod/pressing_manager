<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Mail\Attachment;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Envoi manuel (déclenché par le staff depuis l'écran « Ticket et facture »), pas un
 * événement métier automatique piloté par NotificationSetting — contrairement aux
 * autres ConfigurableNotification, l'acteur choisit explicitement d'envoyer maintenant.
 */
class DocumentSentNotification extends ConfigurableNotification
{
    public function __construct(
        private readonly Order $order,
        private readonly string $documentType,
        private readonly string $attachmentFilename,
        private readonly ?string $pdfAttachmentData = null,
        private readonly ?string $pdfAttachmentDisk = null,
        private readonly ?string $pdfAttachmentPath = null,
    ) {}

    public function toMail(object $notifiable): MailMessage
    {
        $label = $this->documentType === 'invoice' ? 'votre facture' : 'votre ticket de dépôt';

        $message = (new MailMessage)
            ->subject("Commande n° {$this->order->order_number} — {$label}")
            ->line("Veuillez trouver ci-joint {$label} pour la commande n° {$this->order->order_number}.")
            ->line('Merci de votre confiance.');

        if ($this->pdfAttachmentData !== null) {
            $message->attachData($this->pdfAttachmentData, $this->attachmentFilename, ['mime' => 'application/pdf']);
        } elseif ($this->pdfAttachmentPath !== null) {
            $message->attach(
                Attachment::fromStorageDisk($this->pdfAttachmentDisk ?? config('filesystems.default'), $this->pdfAttachmentPath)
                    ->as($this->attachmentFilename)
                    ->withMime('application/pdf'),
            );
        }

        return $message;
    }

    public function summary(): string
    {
        return "Document ({$this->documentType}) envoyé par e-mail pour la commande n° {$this->order->order_number}.";
    }
}

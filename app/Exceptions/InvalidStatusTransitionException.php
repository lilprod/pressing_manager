<?php

namespace App\Exceptions;

use DomainException;

class InvalidStatusTransitionException extends DomainException
{
    public function __construct(string $from, string $to, ?string $reason = null)
    {
        parent::__construct(
            $reason ?? "Transition de statut invalide : '{$from}' -> '{$to}'."
        );
    }
}

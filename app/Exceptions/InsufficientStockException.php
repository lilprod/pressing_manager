<?php

namespace App\Exceptions;

use DomainException;

class InsufficientStockException extends DomainException
{
    public function __construct(int $available, int $requested)
    {
        parent::__construct("Stock insuffisant : {$available} disponible(s), {$requested} demandé(s).");
    }
}

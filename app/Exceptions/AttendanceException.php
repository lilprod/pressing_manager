<?php

namespace App\Exceptions;

use DomainException;

class AttendanceException extends DomainException
{
    public static function alreadyClockedIn(): self
    {
        return new self('Un pointage est déjà en cours — veuillez pointer votre sortie avant de pointer une nouvelle entrée.');
    }

    public static function noOpenAttendance(): self
    {
        return new self("Aucun pointage d'entrée en cours à clôturer.");
    }
}

<?php

namespace App\Support;

/** Libellé lisible « Navigateur · Système » à partir d'un user-agent (sessions, connexions). */
class UserAgent
{
    public static function describe(?string $ua): ?string
    {
        if ($ua === null || $ua === '') {
            return null;
        }

        $browser = match (true) {
            str_contains($ua, 'Edg/') => 'Edge',
            str_contains($ua, 'OPR/') => 'Opera',
            str_contains($ua, 'Firefox/') => 'Firefox',
            str_contains($ua, 'Chrome/') => 'Chrome',
            str_contains($ua, 'Safari/') => 'Safari',
            default => null,
        };

        $os = match (true) {
            str_contains($ua, 'iPhone') => 'iPhone',
            str_contains($ua, 'iPad') => 'iPad',
            str_contains($ua, 'Android') => 'Android',
            str_contains($ua, 'Mac OS X') || str_contains($ua, 'Macintosh') => 'macOS',
            str_contains($ua, 'Windows') => 'Windows',
            str_contains($ua, 'Linux') => 'Linux',
            default => null,
        };

        $parts = array_filter([$browser, $os]);

        return $parts ? implode(' · ', $parts) : substr($ua, 0, 60);
    }

    public static function kind(?string $ua): string
    {
        return match (true) {
            $ua === null => 'desktop',
            str_contains($ua, 'iPhone') || (str_contains($ua, 'Android') && str_contains($ua, 'Mobile')) => 'phone',
            str_contains($ua, 'iPad') || str_contains($ua, 'Android') => 'tablet',
            default => 'desktop',
        };
    }
}

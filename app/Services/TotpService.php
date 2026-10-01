<?php

namespace App\Services;

/**
 * TOTP maison (RFC 6238 sur RFC 4226, HMAC-SHA1, pas de dépendance composer — aucun
 * package 2FA n'est présent dans ce projet, cohérent avec le RBAC maison existant).
 */
class TotpService
{
    private const PERIOD = 30;

    private const DIGITS = 6;

    private const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public function generateSecret(int $bytes = 20): string
    {
        return $this->base32Encode(random_bytes($bytes));
    }

    public function provisioningUri(string $secret, string $accountEmail, string $issuer = 'Spark Pressing Superadmin'): string
    {
        return sprintf(
            'otpauth://totp/%s:%s?secret=%s&issuer=%s&algorithm=SHA1&digits=%d&period=%d',
            rawurlencode($issuer),
            rawurlencode($accountEmail),
            $secret,
            rawurlencode($issuer),
            self::DIGITS,
            self::PERIOD,
        );
    }

    public function currentCode(string $secret): string
    {
        return $this->codeAt($secret, intdiv(time(), self::PERIOD));
    }

    /** Tolère un décalage d'horloge de ±1 pas (RFC 6238 §5.2). */
    public function verify(string $secret, string $code, int $window = 1): bool
    {
        $counter = intdiv(time(), self::PERIOD);

        for ($i = -$window; $i <= $window; $i++) {
            if (hash_equals($this->codeAt($secret, $counter + $i), $code)) {
                return true;
            }
        }

        return false;
    }

    private function codeAt(string $secret, int $counter): string
    {
        $hash = hash_hmac('sha1', pack('N*', 0, $counter), $this->base32Decode($secret), true);
        $offset = ord($hash[19]) & 0xf;
        $value = ((ord($hash[$offset]) & 0x7f) << 24)
            | (ord($hash[$offset + 1]) << 16)
            | (ord($hash[$offset + 2]) << 8)
            | ord($hash[$offset + 3]);

        return str_pad((string) ($value % (10 ** self::DIGITS)), self::DIGITS, '0', STR_PAD_LEFT);
    }

    private function base32Encode(string $binary): string
    {
        $bits = '';
        foreach (str_split($binary) as $byte) {
            $bits .= str_pad(decbin(ord($byte)), 8, '0', STR_PAD_LEFT);
        }

        $output = '';
        foreach (str_split($bits, 5) as $chunk) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
            $output .= self::BASE32_ALPHABET[bindec($chunk)];
        }

        return $output;
    }

    private function base32Decode(string $encoded): string
    {
        $bits = '';
        foreach (str_split(strtoupper($encoded)) as $char) {
            $index = strpos(self::BASE32_ALPHABET, $char);
            if ($index === false) {
                continue;
            }
            $bits .= str_pad(decbin($index), 5, '0', STR_PAD_LEFT);
        }

        $binary = '';
        foreach (str_split($bits, 8) as $byte) {
            if (strlen($byte) < 8) {
                continue;
            }
            $binary .= chr(bindec($byte));
        }

        return $binary;
    }
}

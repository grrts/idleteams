<?php

namespace App\Service;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Sends Web Push messages without a payload, signed with VAPID (RFC 8292). Without a payload nothing has to be
 * encrypted, so plain OpenSSL is enough; the service worker asks the server what to show when the push arrives.
 * Make a key with: php bin/console app:push:keys
 */
class WebPush
{
    private ?\OpenSSLAsymmetricKey $key = null;
    private ?string $public = null;

    public function __construct(
        #[Autowire('%env(default::VAPID_PRIVATE_KEY)%')] ?string $privateKey,
        #[Autowire('%env(default::VAPID_SUBJECT)%')] private ?string $subject,
    ) {
        if ($privateKey) {
            $pem = base64_decode($privateKey, true) ?: $privateKey;
            $this->key = openssl_pkey_get_private($pem) ?: null;
            if ($this->key) {
                $ec = openssl_pkey_get_details($this->key)['ec'];
                $this->public = self::b64("\x04".str_pad($ec['x'], 32, "\0", STR_PAD_LEFT).str_pad($ec['y'], 32, "\0", STR_PAD_LEFT));
            }
        }
    }

    public function enabled(): bool
    {
        return $this->key !== null;
    }

    /** The application server key browsers subscribe with (base64url, uncompressed P-256 point). */
    public function publicKey(): ?string
    {
        return $this->public;
    }

    /** @return int HTTP status from the push service (201 is fine, 404 and 410 mean the subscription is gone) */
    public function send(string $endpoint, int $ttl = 86400): int
    {
        if (!$this->key) {
            return 0;
        }
        $u = parse_url($endpoint);
        if (($u['scheme'] ?? '') !== 'https' || empty($u['host'])) {
            return 400;
        }
        $aud = 'https://'.$u['host'].(isset($u['port']) ? ':'.$u['port'] : '');
        $jwt = $this->jwt(['aud' => $aud, 'exp' => time() + 12 * 3600, 'sub' => $this->subject ?: 'mailto:admin@localhost']);
        $ctx = stream_context_create(['http' => [
            'method' => 'POST', 'ignore_errors' => true, 'timeout' => 5,
            'header' => "Authorization: vapid t=$jwt, k={$this->public}\r\nTTL: $ttl\r\nUrgency: normal\r\nContent-Length: 0\r\n",
            'content' => '',
        ]]);
        @file_get_contents($endpoint, false, $ctx);
        $status = 0;
        foreach ($http_response_header ?? [] as $line) {
            if (preg_match('~^HTTP/\S+\s+(\d{3})~', $line, $m)) {
                $status = (int) $m[1];
            }
        }

        return $status;
    }

    public function jwt(array $claims): string
    {
        $data = self::b64(json_encode(['typ' => 'JWT', 'alg' => 'ES256'])).'.'.self::b64(json_encode($claims));
        openssl_sign($data, $der, $this->key, OPENSSL_ALGO_SHA256);

        return $data.'.'.self::b64(self::derToRaw($der));
    }

    /** OpenSSL signs in DER (SEQUENCE of two INTEGERs); JWS wants r and s as 32 bytes each. */
    private static function derToRaw(string $der): string
    {
        $pos = 2;
        if (ord($der[1]) & 0x80) {
            $pos += ord($der[1]) & 0x7F;
        }
        $out = '';
        for ($i = 0; $i < 2; ++$i) {
            $len = ord($der[$pos + 1]);
            $int = substr($der, $pos + 2, $len);
            $out .= str_pad(ltrim($int, "\0"), 32, "\0", STR_PAD_LEFT);
            $pos += 2 + $len;
        }

        return $out;
    }

    public static function b64(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    /** @return array{private: string, public: string} a new key pair, private as base64 PEM for the env file */
    public static function newKeys(): array
    {
        $k = openssl_pkey_new(['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC]);
        openssl_pkey_export($k, $pem);
        $ec = openssl_pkey_get_details($k)['ec'];

        return ['private' => base64_encode($pem), 'public' => self::b64("\x04".str_pad($ec['x'], 32, "\0", STR_PAD_LEFT).str_pad($ec['y'], 32, "\0", STR_PAD_LEFT))];
    }
}

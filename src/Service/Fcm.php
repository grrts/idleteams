<?php

namespace App\Service;

use Psr\Cache\CacheItemPoolInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Push to the phone apps through Firebase Cloud Messaging (HTTP v1), which reaches Android directly and iPhones through
 * APNs. FCM_SERVICE_ACCOUNT is the Firebase service account's JSON key (the text, or a path to the file). The server
 * signs a short JWT with it, trades that for an access token (kept 50 minutes) and sends one message per device.
 */
class Fcm
{
    public const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

    private ?array $account = null;

    public function __construct(
        private HttpClientInterface $http,
        #[Autowire(service: 'cache.app')] private CacheItemPoolInterface $cache,
        #[Autowire('%env(FCM_SERVICE_ACCOUNT)%')] private string $serviceAccount,
    ) {
    }

    public function enabled(): bool
    {
        return $this->account() !== null;
    }

    /**
     * One notification to one device token.
     *
     * @return int 200 when sent, 404 when the token is gone for good (drop it), anything else to try again later
     */
    public function send(string $token, string $title, string $body, string $url, int $badge = 0): int
    {
        $a = $this->account() ?? throw new \LogicException('FCM is not set up.');
        $res = $this->http->request('POST', 'https://fcm.googleapis.com/v1/projects/'.rawurlencode($a['project_id']).'/messages:send', [
            'auth_bearer' => $this->accessToken(),
            'json' => ['message' => [
                'token' => $token,
                'notification' => ['title' => $title, 'body' => $body],
                'data' => ['url' => $url],
                'android' => ['priority' => 'high', 'notification' => ['tag' => 'idleteams', 'color' => '#e8b84a']],
                'apns' => ['payload' => ['aps' => ['sound' => 'default', 'thread-id' => 'idleteams'] + ($badge ? ['badge' => $badge] : [])]],
            ]],
        ]);
        $status = $res->getStatusCode();
        if ($status === 200) {
            return 200;
        }
        $error = json_encode($res->toArray(false));
        // the app was removed or the token replaced: FCM says UNREGISTERED (404) or, for a malformed one, INVALID_ARGUMENT
        if ($status === 404 || str_contains($error, 'UNREGISTERED') || ($status === 400 && str_contains($error, 'registration token'))) {
            return 404;
        }

        return $status;
    }

    private function accessToken(): string
    {
        $item = $this->cache->getItem('fcm_token');
        if ($item->isHit()) {
            return $item->get();
        }
        $a = $this->account();
        $now = time();
        $b64 = fn (string $s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
        $unsigned = $b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])).'.'.$b64(json_encode([
            'iss' => $a['client_email'], 'scope' => self::SCOPE, 'aud' => $a['token_uri'], 'iat' => $now, 'exp' => $now + 3600,
        ]));
        if (!openssl_sign($unsigned, $sig, $a['private_key'], OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('FCM_SERVICE_ACCOUNT has no usable private key.');
        }
        $res = $this->http->request('POST', $a['token_uri'], ['body' => [
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $unsigned.'.'.$b64($sig),
        ]])->toArray(false);
        $token = $res['access_token'] ?? throw new \RuntimeException('Google refused the FCM service account: '.($res['error_description'] ?? $res['error'] ?? 'no answer'));
        $this->cache->save($item->set($token)->expiresAfter(min(3000, (int) ($res['expires_in'] ?? 3600) - 300)));

        return $token;
    }

    private function account(): ?array
    {
        if ($this->account === null && trim($this->serviceAccount) !== '') {
            $json = str_starts_with(ltrim($this->serviceAccount), '{') ? $this->serviceAccount : (string) @file_get_contents($this->serviceAccount);
            $a = json_decode($json, true);
            if (is_array($a) && isset($a['project_id'], $a['client_email'], $a['private_key'])) {
                $this->account = $a + ['token_uri' => 'https://oauth2.googleapis.com/token'];
            }
        }

        return $this->account;
    }
}

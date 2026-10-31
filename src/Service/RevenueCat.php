<?php

namespace App\Service;

use App\Entity\Purchase;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Purchases on iOS and Android go through the RevenueCat SDK in the app (mobile/). RevenueCat tells the server about
 * them two ways, and both land in Shop::record(), which pays each store transaction once:
 *
 *  - webhook(): RevenueCat calls POST /api/shop/revenuecat with the Authorization header set in its dashboard
 *    (RC_WEBHOOK_AUTH). Purchases, renewals, refunds and the supporter subscription's end come this way.
 *  - sync(): the server asks RevenueCat's REST API (RC_SECRET_KEY) for everything the account has bought. The app calls
 *    it right after a purchase and on "Restore purchases", so nothing waits on the webhook.
 *
 * The account's RevenueCat app user id is User::$billingId, a random id the app logs in with.
 * Test-mode (sandbox) purchases only count when RC_ALLOW_SANDBOX is on, which it must not be in production.
 */
class RevenueCat
{
    public const API = 'https://api.revenuecat.com/v1/';

    /** Events that are a payment for the product they name. */
    private const PAID = ['INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE', 'UNCANCELLATION'];

    public function __construct(
        private EntityManagerInterface $em,
        private HttpClientInterface $http,
        private Shop $shop,
        #[Autowire('%env(RC_SECRET_KEY)%')] private string $secret,
        #[Autowire('%env(RC_WEBHOOK_AUTH)%')] private string $webhookAuth,
        #[Autowire('%env(bool:RC_ALLOW_SANDBOX)%')] private bool $allowSandbox,
    ) {
    }

    public function configured(): bool
    {
        return $this->secret !== '' && $this->webhookAuth !== '';
    }

    /**
     * One webhook call. Trusts only the Authorization header; everything else it acts on is checked against the
     * account's own records (and, with a secret key, against RevenueCat's REST API).
     *
     * @return string what happened, for the log
     */
    public function webhook(string $authorization, string $payload): string
    {
        if ($this->webhookAuth === '' || !hash_equals($this->webhookAuth, preg_replace('/^Bearer\s+/i', '', trim($authorization)))) {
            throw new GameError('Bad authorization.');
        }
        $e = json_decode($payload, true)['event'] ?? null;
        if (!is_array($e) || !isset($e['type'])) {
            throw new GameError('No event.');
        }
        $type = (string) $e['type'];
        if ($type === 'TEST') {
            return 'test event';
        }
        $sandbox = ($e['environment'] ?? '') === 'SANDBOX';
        if ($sandbox && !$this->allowSandbox) {
            return 'sandbox, ignored';
        }
        $ids = $type === 'TRANSFER' ? (array) ($e['transferred_to'] ?? []) : [$e['app_user_id'] ?? null, $e['original_app_user_id'] ?? null, ...(array) ($e['aliases'] ?? [])];
        $u = $this->user($ids);
        if (!$u) {
            return 'no account for '.json_encode($e['app_user_id'] ?? $ids);
        }
        $product = (string) ($e['product_id'] ?? '');
        $store = strtolower((string) ($e['store'] ?? ''));
        $tx = (string) ($e['transaction_id'] ?? '');
        $what = $type;

        if (in_array($type, self::PAID, true) && $product !== '' && $tx !== '') {
            $what .= ': '.$this->shop->record($u, $product, $store, 'rc:'.$tx, $sandbox, self::cents($e), $e['currency'] ?? null);
            if ($this->supporter($product) && isset($e['expiration_at_ms'])) {
                $u->supporterUntil = max($u->supporterUntil, intdiv((int) $e['expiration_at_ms'], 1000));
            }
        }
        // RevenueCat reports a refund as a cancellation by customer support
        if ($type === 'CANCELLATION' && ($e['cancel_reason'] ?? '') === 'CUSTOMER_SUPPORT' && $tx !== '') {
            $p = $this->em->getRepository(Purchase::class)->findOneBy(['transactionId' => 'rc:'.$tx]);
            $what .= ': '.($p ? $this->shop->refund($p) : 'unknown transaction');
        }
        if ($type === 'EXPIRATION' && $this->supporter($product)) {
            $u->supporterUntil = min($u->supporterUntil, time());
        }
        if ($this->secret !== '') {
            $what .= '; '.$this->sync($u);
        }

        return $what;
    }

    /**
     * Brings the account in line with what RevenueCat says it bought: pays anything not yet paid, refunds refunded
     * subscriptions and sets the supporter subscription's end.
     *
     * @return string what happened, for the log
     */
    public function sync(User $u): string
    {
        if ($this->secret === '') {
            throw new GameError('The shop is not open yet.');
        }
        $id = $this->shop->billingId($u);
        $res = $this->http->request('GET', self::API.'subscribers/'.rawurlencode($id), ['headers' => ['Authorization' => 'Bearer '.$this->secret, 'Accept' => 'application/json']]);
        if ($res->getStatusCode() !== 200) {
            throw new GameError('The store could not be reached. Try again in a moment.');
        }
        $sub = $res->toArray(false)['subscriber'] ?? [];
        $done = [];

        foreach ($sub['non_subscriptions'] ?? [] as $product => $buys) {
            foreach ($buys as $b) {
                if (!empty($b['is_sandbox']) && !$this->allowSandbox) {
                    continue;
                }
                $tx = $b['store_transaction_id'] ?? $b['id'] ?? null;
                if ($tx !== null) {
                    $done[] = $this->shop->record($u, (string) $product, strtolower((string) ($b['store'] ?? '')), 'rc:'.$tx, !empty($b['is_sandbox']));
                }
            }
        }
        foreach ($sub['subscriptions'] ?? [] as $product => $s) {
            if (!empty($s['is_sandbox']) && !$this->allowSandbox) {
                continue;
            }
            $tx = $s['store_transaction_id'] ?? null;
            if ($tx === null) {
                continue;
            }
            $known = $this->em->getRepository(Purchase::class)->findOneBy(['transactionId' => 'rc:'.$tx]);
            if (!empty($s['refunded_at'])) {
                $done[] = $known ? $this->shop->refund($known) : 'refunded before we saw it';
            } elseif (!$known) {
                $done[] = $this->shop->record($u, (string) $product, strtolower((string) ($s['store'] ?? '')), 'rc:'.$tx, !empty($s['is_sandbox']));
            }
        }
        $ent = $sub['entitlements']['supporter'] ?? null;
        if ($ent && (empty($ent['is_sandbox']) || $this->allowSandbox)) {
            $until = $ent['expires_date'] ? (int) strtotime($ent['expires_date']) : 4102444800; // no end: a lifetime grant
            // only ever moved forward here: Steam's 30-day passes add to the same end, and a lapsed one simply passes
            $u->supporterUntil = max($u->supporterUntil, $until);
        }

        return sprintf('synced %d', count(array_filter($done, fn ($d) => $d === 'paid' || $d === 'refunded')));
    }

    private function supporter(string $product): bool
    {
        return (Shop::byProduct($product)[0]['kind'] ?? null) === 'supporter';
    }

    private function user(array $ids): ?User
    {
        foreach (array_filter($ids, 'is_string') as $id) {
            if ($u = $this->em->getRepository(User::class)->findOneBy(['billingId' => $id])) {
                return $u;
            }
        }

        return null;
    }

    private static function cents(array $e): ?int
    {
        $p = $e['price_in_purchased_currency'] ?? null;

        return is_numeric($p) ? (int) round($p * 100) : null;
    }
}

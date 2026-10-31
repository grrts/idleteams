<?php

namespace App\Service;

use App\Entity\Purchase;
use App\Entity\User;
use App\Game\Dungeons;
use App\Game\Seasons;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * The cosmetic shop. Offers are data (content/<pack>/shop/*.json): looks for the wardrobe, a 30-day supporter pass and
 * the season track's premium side. Nothing sold changes a hero's power.
 *
 * Payment goes through Stripe Checkout: checkout() makes a pending Purchase and a Checkout Session and hands back its
 * page; Stripe calls webhook() when the payment is through (or refunded), and only then is anything given. With no
 * STRIPE_SECRET_KEY the shop shows its offers and says it is not open.
 */
class Shop
{
    public const STRIPE = 'https://api.stripe.com/v1/';

    /** How old a webhook's signature may be. */
    public const TOLERANCE = 300;

    private static ?array $offers = null;

    public function __construct(
        private EntityManagerInterface $em,
        private HttpClientInterface $http,
        private Notifier $notifier,
        #[Autowire('%env(STRIPE_SECRET_KEY)%')] private string $key,
        #[Autowire('%env(STRIPE_WEBHOOK_SECRET)%')] private string $webhookSecret,
        #[Autowire('%env(APP_URL)%')] private string $appUrl,
    ) {
    }

    /** @return array<string, array> every offer by id */
    public static function offers(?string $dir = null): array
    {
        if ($dir === null && self::$offers !== null) {
            return self::$offers;
        }
        $out = [];
        foreach (glob(($dir ?? Dungeons::dir()).'/*/shop/*.json') ?: [] as $file) {
            foreach (json_decode((string) file_get_contents($file), true, 64, JSON_THROW_ON_ERROR)['offers'] ?? [] as $id => $o) {
                in_array($o['kind'] ?? null, ['look', 'supporter', 'track'], true) || throw new \RuntimeException(basename($file).": offer $id needs a kind: look, supporter or track");
                is_int($o['price'] ?? null) && $o['price'] > 0 || throw new \RuntimeException(basename($file).": offer $id needs a price in cents");
                $out[$id] = $o + ['id' => $id, 'looks' => [], 'text' => '', 'currency' => 'eur', 'days' => 0];
            }
        }

        return $dir === null ? self::$offers = $out : $out;
    }

    public function open(): bool
    {
        return $this->key !== '';
    }

    /** Whether the account already has everything the offer gives (a supporter pass can always be bought again). */
    public function owns(User $u, array $o, ?array $wardrobe): bool
    {
        return match ($o['kind']) {
            'look' => !array_diff($o['looks'], $wardrobe ?? []),
            'track' => ($s = Seasons::current()) && in_array($s['id'], $u->seasonPremium ?? [], true),
            default => false,
        };
    }

    /** Starts a payment: a pending purchase and a Stripe Checkout page to send the player to. */
    public function checkout(User $u, string $offerId, bool $waive): string
    {
        $o = self::offers()[$offerId] ?? throw new GameError('No such offer.');
        if (!$this->open()) {
            throw new GameError('The shop is not open yet.');
        }
        if (!$waive) {
            throw new GameError('Tick the box to have it delivered at once.');
        }
        $season = null;
        if ($o['kind'] === 'track') {
            $season = Seasons::current() ?? throw new GameError('No season is running.');
        }
        $hero = (new Roster($this->em))->active($u);
        if ($this->owns($u, $o, $hero?->wardrobe)) {
            throw new GameError('You already have that.');
        }
        $p = new Purchase();
        $p->user = $u;
        $p->offer = $o['id'];
        $p->season = $season['id'] ?? null;
        $p->amount = $o['price'];
        $p->currency = $o['currency'];
        $p->waivedWithdrawalAt = time();
        $p->createdAt = time();
        $this->em->persist($p);
        $this->em->flush();
        $name = $o['name'].($season ? ': '.$season['name'] : '');
        $form = [
            'mode' => 'payment',
            'line_items' => [['quantity' => 1, 'price_data' => ['currency' => $o['currency'], 'unit_amount' => $o['price'], 'product_data' => ['name' => $name, 'description' => $o['text'] ?: $name]]]],
            'success_url' => $this->appUrl.'/#/shop?paid='.$p->id,
            'cancel_url' => $this->appUrl.'/#/shop',
            'client_reference_id' => (string) $p->id,
            'metadata' => ['purchase' => (string) $p->id],
            'payment_intent_data' => ['metadata' => ['purchase' => (string) $p->id]],
        ];
        if ($u->email && $u->emailVerified) {
            $form['customer_email'] = $u->email;
        }
        $res = $this->http->request('POST', self::STRIPE.'checkout/sessions', ['auth_bearer' => $this->key, 'body' => http_build_query($form)]);
        $data = $res->toArray(false);
        if ($res->getStatusCode() >= 300 || empty($data['url'])) {
            throw new GameError('The payment page could not be opened. Try again in a minute.');
        }
        $p->checkoutSession = $data['id'];

        return $data['url'];
    }

    /**
     * A call from Stripe: checks the signature, then pays or refunds the purchase it names. Safe to repeat.
     *
     * @return string what happened, for the log
     */
    public function webhook(string $payload, string $signature, ?int $now = null): string
    {
        if ($this->webhookSecret === '' || !$this->signed($payload, $signature, $now ?? time())) {
            throw new GameError('Bad signature.');
        }
        $e = json_decode($payload, true, 64, JSON_THROW_ON_ERROR);
        $obj = $e['data']['object'] ?? [];
        switch ($e['type'] ?? '') {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
                if (($obj['payment_status'] ?? '') !== 'paid') {
                    return 'waiting for the payment';
                }
                $p = $this->em->find(Purchase::class, (int) ($obj['metadata']['purchase'] ?? 0));
                if (!$p) {
                    return 'unknown purchase';
                }
                $p->checkoutSession ??= $obj['id'] ?? null;
                $p->paymentIntent = $obj['payment_intent'] ?? $p->paymentIntent;

                return $this->pay($p);
            case 'charge.refunded':
                if (!($obj['refunded'] ?? false)) {
                    return 'partly refunded, kept';
                }
                $p = $this->em->getRepository(Purchase::class)->findOneBy(['paymentIntent' => $obj['payment_intent'] ?? '']);

                return $p ? $this->refund($p) : 'unknown payment';
        }

        return 'ignored';
    }

    public function pay(Purchase $p): string
    {
        if ($p->state !== 'pending') {
            return 'already '.$p->state;
        }
        $p->state = 'paid';
        $p->paidAt = time();
        $u = $p->user;
        $o = self::offers()[$p->offer] ?? null;
        if (!$u || !$o) {
            return 'paid, nothing to give';
        }
        $roster = new Roster($this->em);
        $roster->grant($u, $o['looks']);
        if ($o['kind'] === 'supporter') {
            $u->supporterUntil = max(time(), $u->supporterUntil) + 86400 * $o['days'];
        }
        if ($o['kind'] === 'track' && ($s = Seasons::get((string) $p->season))) {
            $u->seasonPremium = array_values(array_unique([...($u->seasonPremium ?? []), $s['id']]));
            $roster->grant($u, Seasons::rewards($s, 0, Seasons::tier($s, $u->seasonPoints[$s['id']] ?? 0), true));
        }
        if ($h = $roster->active($u)) {
            $this->notifier->notify($h, 'shop', 'Thank you!', sprintf('%s is yours. It is in the wardrobe of every hero on your account.', $o['name']), '#/shop');
        }

        return 'paid';
    }

    public function refund(Purchase $p): string
    {
        if ($p->state !== 'paid') {
            return 'not paid';
        }
        $p->state = 'refunded';
        $u = $p->user;
        $o = self::offers()[$p->offer] ?? null;
        if (!$u || !$o) {
            return 'refunded';
        }
        $roster = new Roster($this->em);
        $roster->revoke($u, $o['looks']);
        if ($o['kind'] === 'supporter') {
            $u->supporterUntil = max(0, $u->supporterUntil - 86400 * $o['days']);
        }
        if ($o['kind'] === 'track' && ($s = Seasons::get((string) $p->season))) {
            $u->seasonPremium = array_values(array_diff($u->seasonPremium ?? [], [$s['id']]));
            $roster->revoke($u, array_values(array_filter(array_column($s['track']['tiers'], 'premium'))));
        }

        return 'refunded';
    }

    /** Stripe's scheme: HMAC-SHA256 of "t.payload" in a v1 entry of the header, signed recently. */
    private function signed(string $payload, string $header, int $now): bool
    {
        $t = null;
        $sigs = [];
        foreach (explode(',', $header) as $part) {
            [$k, $v] = array_pad(explode('=', trim($part), 2), 2, '');
            if ($k === 't') {
                $t = (int) $v;
            } elseif ($k === 'v1') {
                $sigs[] = $v;
            }
        }
        if ($t === null || abs($now - $t) > self::TOLERANCE) {
            return false;
        }
        $want = hash_hmac('sha256', $t.'.'.$payload, $this->webhookSecret);
        foreach ($sigs as $s) {
            if (hash_equals($want, $s)) {
                return true;
            }
        }

        return false;
    }
}

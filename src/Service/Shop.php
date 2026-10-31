<?php

namespace App\Service;

use App\Entity\Purchase;
use App\Entity\User;
use App\Game\Dungeons;
use App\Game\Seasons;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Uid\Uuid;

/**
 * The cosmetic shop, the same on every platform. Offers are data (content/<pack>/shop/*.json): looks for the wardrobe,
 * the supporter pass and the season track's premium side. Nothing sold changes a hero's power.
 *
 * The stores take the money: the App Store and Google Play through RevenueCat (src/Service/RevenueCat.php), Steam
 * through its in-game purchases (src/Service/Steam.php). Each tells the server about a purchase, which lands here as a
 * Purchase keyed by the store's transaction, so one account keeps what it bought on every platform.
 */
class Shop
{
    /** Stores whose purchases RevenueCat reports. */
    public const RC_STORES = ['app_store', 'play_store', 'mac_app_store', 'amazon', 'promotional', 'test_store'];

    private static ?array $offers = null;

    public function __construct(private EntityManagerInterface $em, private Notifier $notifier)
    {
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
                $bad = fn (string $why) => throw new \RuntimeException(basename($file).": offer $id $why");
                in_array($o['kind'] ?? null, ['look', 'supporter', 'track'], true) || $bad('needs a kind: look, supporter or track');
                is_int($o['price'] ?? null) && $o['price'] > 0 || $bad('needs a price in cents');
                preg_match('/^[a-z0-9_.{}]{3,80}$/', $o['product'] ?? '') || $bad('needs a store product id (lower case, digits, _ and .)');
                is_int($o['steamItem'] ?? null) || $bad('needs a steamItem number');
                $out[$id] = $o + ['id' => $id, 'looks' => [], 'text' => '', 'currency' => 'eur', 'entitlement' => null];
            }
        }

        return $dir === null ? self::$offers = $out : $out;
    }

    /** The store product id of an offer; the season track has one per season ("it_track_{season}"). */
    public static function product(array $o, ?string $season = null): string
    {
        return str_replace('{season}', (string) $season, $o['product']);
    }

    /** The Steam item id: the season track adds the season's number. */
    public static function steamItem(array $o, ?string $season = null): int
    {
        return $o['steamItem'] + ($o['kind'] === 'track' ? (int) (Seasons::get((string) $season)['number'] ?? 0) : 0);
    }

    /**
     * The offer a store product id belongs to, and its season for the track.
     *
     * @return array{0: array, 1: ?string}|null
     */
    public static function byProduct(string $product): ?array
    {
        foreach (self::offers() as $o) {
            if ($o['kind'] === 'track') {
                foreach (Seasons::all() as $s) {
                    if (self::product($o, $s['id']) === $product) {
                        return [$o, $s['id']];
                    }
                }
            } elseif ($o['product'] === $product) {
                return [$o, null];
            }
        }

        return null;
    }

    /** The account's id at the stores, made on first need. */
    public function billingId(User $u): string
    {
        return $u->billingId ??= Uuid::v4()->toRfc4122();
    }

    /** Whether the account already has everything the offer gives (the supporter pass can always be bought again). */
    public function owns(User $u, array $o, ?array $wardrobe): bool
    {
        return match ($o['kind']) {
            'look' => !array_diff($o['looks'], $wardrobe ?? []),
            'track' => ($s = Seasons::current()) && in_array($s['id'], $u->seasonPremium ?? [], true),
            default => false,
        };
    }

    /**
     * Before the store's purchase sheet opens: checks the offer can be bought and records the player's consent to
     * delivery at once (which ends the right of withdrawal). Returns what the app needs to start the purchase.
     *
     * @return array{purchase: int, product: string, appUserId: string, steamItem: int}
     */
    public function consent(User $u, string $offerId, bool $waive): array
    {
        $o = self::offers()[$offerId] ?? throw new GameError('No such offer.');
        if (!$waive) {
            throw new GameError('Tick the box to have it delivered at once.');
        }
        $season = null;
        if ($o['kind'] === 'track') {
            $season = (Seasons::current() ?? throw new GameError('No season is running.'))['id'];
        }
        if ($this->owns($u, $o, (new Roster($this->em))->active($u)?->wardrobe)) {
            throw new GameError('You already have that.');
        }
        $p = new Purchase();
        $p->user = $u;
        $p->offer = $o['id'];
        $p->season = $season;
        $p->product = self::product($o, $season);
        $p->amount = $o['price'];
        $p->currency = $o['currency'];
        $p->waivedWithdrawalAt = time();
        $p->createdAt = time();
        $this->em->persist($p);
        $this->em->flush();

        return ['purchase' => $p->id, 'product' => $p->product, 'appUserId' => $this->billingId($u), 'steamItem' => self::steamItem($o, $season)];
    }

    /**
     * A purchase a store has confirmed: pays it once, whatever store or call reports it again.
     *
     * @return string what happened, for the log
     */
    public function record(User $u, string $product, string $store, string $transactionId, bool $sandbox = false, ?int $amount = null, ?string $currency = null, ?Purchase $pending = null): string
    {
        $known = $this->em->getRepository(Purchase::class)->findOneBy(['transactionId' => $transactionId]);
        if ($known) {
            return $known->state === 'paid' ? 'already paid' : 'already '.$known->state;
        }
        [$o, $season] = self::byProduct($product) ?? [null, null];
        if (!$o) {
            return 'unknown product '.$product;
        }
        // the consent recorded when the sheet opened, if this account has one waiting for this product
        $p = $pending ?? $this->em->getRepository(Purchase::class)->findOneBy(['user' => $u, 'product' => $product, 'state' => 'pending', 'store' => null], ['id' => 'DESC']) ?? new Purchase();
        if (!$p->id) {
            $p->user = $u;
            $p->createdAt = time();
            $this->em->persist($p);
        }
        $p->offer = $o['id'];
        $p->season = $season;
        $p->product = $product;
        $p->store = $store;
        $p->transactionId = $transactionId;
        $p->sandbox = $sandbox;
        $p->amount = $amount ?? $o['price'];
        $p->currency = strtolower($currency ?? $o['currency']);
        $what = $this->pay($p);
        $this->em->flush(); // so a second report of the same transaction in this request finds it

        return $what;
    }

    public function pay(Purchase $p): string
    {
        if ($p->state === 'paid' || $p->state === 'refunded') {
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
        // on Steam the pass is 30 days a time; on the phone stores RevenueCat sets the end from the subscription
        if ($o['kind'] === 'supporter' && $p->store === 'steam') {
            $u->supporterUntil = max(time(), $u->supporterUntil) + 30 * 86400;
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
            $u->supporterUntil = $p->store === 'steam' ? max(0, $u->supporterUntil - 30 * 86400) : min($u->supporterUntil, time());
        }
        if ($o['kind'] === 'track' && ($s = Seasons::get((string) $p->season))) {
            $u->seasonPremium = array_values(array_diff($u->seasonPremium ?? [], [$s['id']]));
            $roster->revoke($u, array_values(array_filter(array_column($s['track']['tiers'], 'premium'))));
        }

        return 'refunded';
    }
}

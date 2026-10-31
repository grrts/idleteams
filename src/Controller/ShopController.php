<?php

namespace App\Controller;

use App\Entity\Purchase;
use App\Game\Seasons;
use App\Service\GameError;
use App\Service\Roster;
use App\Service\RevenueCat;
use App\Service\Shop;
use App\Service\Steam;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/** The cosmetic shop and the season track (src/Service/Shop.php, src/Game/Seasons.php). */
class ShopController extends ApiController
{
    #[Route('/api/shop', methods: ['GET'])]
    public function index(Shop $shop, RevenueCat $rc, Steam $steam, #[Autowire('%env(RC_PUBLIC_IOS_KEY)%')] string $iosKey, #[Autowire('%env(RC_PUBLIC_ANDROID_KEY)%')] string $androidKey): JsonResponse
    {
        $u = $this->me();
        $hero = (new Roster($this->em))->active($u);
        $s = Seasons::current();
        $points = $s ? ($u->seasonPoints[$s['id']] ?? 0) : 0;
        $purchases = $this->em->getRepository(Purchase::class)->findBy(['user' => $u, 'state' => ['paid', 'refunded']], ['id' => 'DESC'], 20);

        $res = $this->json([
            // where the player can buy: the phone apps through RevenueCat, the Steam build through Steam; not the web
            'stores' => ['revenuecat' => $rc->configured(), 'steam' => $steam->configured()],
            'revenuecat' => $rc->configured() ? ['ios' => $iosKey, 'android' => $androidKey, 'appUserId' => $shop->billingId($u)] : null,
            'offers' => array_values(array_map(fn ($o) => [
                'id' => $o['id'], 'name' => $o['name'], 'kind' => $o['kind'], 'price' => $o['price'], 'currency' => $o['currency'], 'text' => $o['text'],
                'looks' => $o['looks'], 'product' => Shop::product($o, $s['id'] ?? null), 'steamItem' => Shop::steamItem($o, $s['id'] ?? null),
                'subscription' => $o['entitlement'] !== null, 'owned' => $shop->owns($u, $o, $hero?->wardrobe),
            ], array_filter(Shop::offers(), fn ($o) => $o['kind'] !== 'track' || $s))),
            'supporterUntil' => $u->supporterUntil,
            'season' => $s ? [
                'id' => $s['id'], 'name' => $s['name'], 'summary' => $s['summary'], 'endsAt' => $s['endsAt'], 'points' => $points,
                'tier' => Seasons::tier($s, $points), 'tierPoints' => $s['track']['tierPoints'], 'tiers' => $s['track']['tiers'],
                'premium' => in_array($s['id'], $u->seasonPremium ?? [], true),
                'affix' => $s['affix'] ? [\App\Game\Modes::AFFIXES[$s['affix']][0], \App\Game\Modes::SEASON_AT] : null,
                'raid' => $s['raid'] ? (\App\Game\Raids::get($s['raid'])['name'] ?? null) : null,
                'world' => $s['worldRaid']['name'] ?? null, 'items' => $s['items'] ?? null,
            ] : null,
            'next' => ($n = array_values(array_filter(Seasons::all(), fn ($x) => $x['startsAt'] > time()))[0] ?? null) ? ['name' => $n['name'], 'startsAt' => $n['startsAt']] : null,
            'steamLinked' => $u->steamId !== null,
            'purchases' => array_map(fn (Purchase $p) => ['offer' => Shop::offers()[$p->offer]['name'] ?? $p->offer, 'amount' => $p->amount, 'currency' => $p->currency, 'state' => $p->state, 'store' => $p->store, 'at' => $p->paidAt ?: $p->createdAt], $purchases),
        ]);
        $this->em->flush(); // the billing id, made on first look

        return $res;
    }

    /** Before a store's purchase sheet opens: the player's consent, and what the app needs to start the purchase. */
    #[Route('/api/shop/consent', methods: ['POST'])]
    public function consent(Request $r, Shop $shop): JsonResponse
    {
        $in = $this->body($r);
        $res = $shop->consent($this->me(), (string) ($in['offer'] ?? ''), ($in['waive'] ?? false) === true);
        $this->em->flush();

        return $this->json($res);
    }

    /** iOS and Android, after a purchase and on "Restore purchases": asks RevenueCat what the account owns. */
    #[Route('/api/shop/sync', methods: ['POST'])]
    public function sync(RevenueCat $rc): JsonResponse
    {
        $what = $rc->sync($this->me());
        $this->em->flush();

        return $this->json(['ok' => true, 'result' => $what]);
    }

    /** RevenueCat calls this; it is not behind the login (security.yaml) and trusts only the Authorization header. */
    #[Route('/api/shop/revenuecat', methods: ['POST'])]
    public function revenuecat(Request $r, RevenueCat $rc, LoggerInterface $log): JsonResponse
    {
        try {
            $what = $rc->webhook((string) $r->headers->get('Authorization', ''), $r->getContent());
        } catch (GameError $e) {
            return $this->json(['error' => $e->getMessage()], 401);
        }
        $this->em->flush();
        $log->info('RevenueCat webhook: '.$what);

        return $this->json(['ok' => true, 'result' => $what]);
    }

    /** Steam: opens the purchase in the Steam overlay for a consent made a moment ago. */
    #[Route('/api/shop/steam/start', methods: ['POST'])]
    public function steamStart(Request $r, Steam $steam): JsonResponse
    {
        $in = $this->body($r);
        $res = $steam->start($this->me(), (int) ($in['purchase'] ?? 0), preg_replace('/[^a-z]/', '', strtolower((string) ($in['language'] ?? 'en'))) ?: 'en');
        $this->em->flush();

        return $this->json($res);
    }

    /** Steam: the player said yes in the overlay; settle it and pay it. */
    #[Route('/api/shop/steam/finish', methods: ['POST'])]
    public function steamFinish(Request $r, Steam $steam): JsonResponse
    {
        $what = $steam->finish($this->me(), (string) ($this->body($r)['orderId'] ?? ''));
        $this->em->flush();

        return $this->json(['ok' => true, 'result' => $what]);
    }
}

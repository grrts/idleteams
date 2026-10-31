<?php

namespace App\Controller;

use App\Entity\Purchase;
use App\Game\Seasons;
use App\Service\GameError;
use App\Service\Roster;
use App\Service\Shop;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

/** The cosmetic shop and the season track (src/Service/Shop.php, src/Game/Seasons.php). */
class ShopController extends ApiController
{
    #[Route('/api/shop', methods: ['GET'])]
    public function index(Shop $shop): JsonResponse
    {
        $u = $this->me();
        $hero = (new Roster($this->em))->active($u);
        $s = Seasons::current();
        $points = $s ? ($u->seasonPoints[$s['id']] ?? 0) : 0;
        $purchases = $this->em->getRepository(Purchase::class)->findBy(['user' => $u, 'state' => ['paid', 'refunded']], ['id' => 'DESC'], 20);

        return $this->json([
            'open' => $shop->open(),
            'offers' => array_values(array_map(fn ($o) => [
                'id' => $o['id'], 'name' => $o['name'], 'kind' => $o['kind'], 'price' => $o['price'], 'currency' => $o['currency'], 'text' => $o['text'],
                'looks' => $o['looks'], 'owned' => $shop->owns($u, $o, $hero?->wardrobe),
            ], array_filter(Shop::offers(), fn ($o) => $o['kind'] !== 'track' || $s))),
            'supporterUntil' => $u->supporterUntil,
            'season' => $s ? [
                'id' => $s['id'], 'name' => $s['name'], 'summary' => $s['summary'], 'endsAt' => $s['endsAt'], 'points' => $points,
                'tier' => Seasons::tier($s, $points), 'tierPoints' => $s['track']['tierPoints'], 'tiers' => $s['track']['tiers'],
                'premium' => in_array($s['id'], $u->seasonPremium ?? [], true),
            ] : null,
            'next' => ($n = array_values(array_filter(Seasons::all(), fn ($x) => $x['startsAt'] > time()))[0] ?? null) ? ['name' => $n['name'], 'startsAt' => $n['startsAt']] : null,
            'purchases' => array_map(fn (Purchase $p) => ['offer' => Shop::offers()[$p->offer]['name'] ?? $p->offer, 'amount' => $p->amount, 'currency' => $p->currency, 'state' => $p->state, 'at' => $p->paidAt ?: $p->createdAt], $purchases),
        ]);
    }

    #[Route('/api/shop/checkout', methods: ['POST'])]
    public function checkout(Request $r, Shop $shop): JsonResponse
    {
        $in = $this->body($r);
        $url = $shop->checkout($this->me(), (string) ($in['offer'] ?? ''), ($in['waive'] ?? false) === true);
        $this->em->flush();

        return $this->json(['url' => $url]);
    }

    /** Stripe calls this; it is not behind the login (security.yaml) and trusts only the signature. */
    #[Route('/api/shop/webhook', methods: ['POST'])]
    public function webhook(Request $r, Shop $shop, LoggerInterface $log): JsonResponse
    {
        try {
            $what = $shop->webhook($r->getContent(), (string) $r->headers->get('Stripe-Signature', ''));
        } catch (GameError $e) {
            return $this->json(['error' => $e->getMessage()], 400);
        }
        $this->em->flush();
        $log->info('Shop webhook: '.$what);

        return $this->json(['ok' => true, 'result' => $what]);
    }
}

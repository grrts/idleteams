<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Entity\Purchase;
use App\Entity\User;
use App\Game\Seasons;
use App\Service\Shop;
use App\Tests\StripeMock;

/** The cosmetic shop: Stripe Checkout, the signed webhook, looks for every hero, the supporter pass and refunds. */
class ShopTest extends ApiTestCase
{
    private function webhook(array $event, ?string $secret = 'whsec_idleteams'): array
    {
        $payload = json_encode($event);
        $t = time();
        $sig = 't='.$t.',v1='.hash_hmac('sha256', $t.'.'.$payload, $secret);
        $this->client->request('POST', '/api/shop/webhook', [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_STRIPE_SIGNATURE' => $sig], $payload);

        return json_decode($this->client->getResponse()->getContent(), true);
    }

    private function paid(int $purchase, string $intent): array
    {
        return $this->webhook(['type' => 'checkout.session.completed', 'data' => ['object' => ['id' => 'cs_x', 'payment_status' => 'paid', 'payment_intent' => $intent, 'metadata' => ['purchase' => (string) $purchase]]]]);
    }

    public function testBuyingALookGivesItToEveryHeroAndARefundTakesItBack(): void
    {
        $this->as('buyer');
        $shop = $this->api('GET', '/shop');
        $this->assertTrue($shop['open']);
        $crown = array_values(array_filter($shop['offers'], fn ($o) => $o['id'] === 'emberCrown'))[0];
        $this->assertFalse($crown['owned']);

        $res = $this->api('POST', '/shop/checkout', ['offer' => 'emberCrown']);
        $this->assertSame(400, $this->httpStatus());
        $res = $this->api('POST', '/shop/checkout', ['offer' => 'emberCrown', 'waive' => true]);
        $this->assertSame('https://checkout.stripe.test/pay', $res['url']);
        $this->assertStringContainsString('unit_amount%5D=299', StripeMock::$last['body']);
        $p = $this->em()->getRepository(Purchase::class)->findOneBy(['offer' => 'emberCrown']);
        $this->assertSame('pending', $p->state);
        $this->assertNotNull($p->checkoutSession);

        // a forged call does nothing
        $this->webhook(['type' => 'checkout.session.completed', 'data' => ['object' => ['payment_status' => 'paid', 'metadata' => ['purchase' => (string) $p->id]]]], 'whsec_wrong');
        $this->assertSame(400, $this->httpStatus());

        $this->assertSame('paid', $this->paid($p->id, 'pi_1')['result']);
        $this->assertSame('already paid', $this->paid($p->id, 'pi_1')['result']);
        $this->em()->clear();
        $hero = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Buyer']);
        $look = Shop::offers()['emberCrown']['looks'][0];
        $this->assertContains($look, $hero->wardrobe);
        $this->api('POST', '/shop/checkout', ['offer' => 'emberCrown', 'waive' => true]);
        $this->assertSame(400, $this->httpStatus());

        $this->assertSame('refunded', $this->webhook(['type' => 'charge.refunded', 'data' => ['object' => ['payment_intent' => 'pi_1', 'refunded' => true]]])['result']);
        $this->em()->clear();
        $this->assertNotContains($look, $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Buyer'])->wardrobe);
    }

    public function testTheSupporterPassStacksAndShowsAStarInChat(): void
    {
        $this->as('patron');
        $this->api('POST', '/shop/checkout', ['offer' => 'supporter', 'waive' => true]);
        $p = $this->em()->getRepository(Purchase::class)->findOneBy(['offer' => 'supporter']);
        $this->paid($p->id, 'pi_2');
        $this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'Thanks for the game']);
        $line = array_values(array_filter($this->api('GET', '/chat?channel=tavern'), fn ($m) => $m['body'] === 'Thanks for the game'));
        $this->assertTrue($line[0]['author']['supporter'] ?? false);
        $this->em()->clear();
        $u = $this->em()->getRepository(User::class)->findOneBy(['username' => 'patron']);
        $this->assertEqualsWithDelta(time() + 30 * 86400, $u->supporterUntil, 5);
    }

    public function testTheSeasonTrackGivesWhatWasReachedOnPurchase(): void
    {
        $this->as('climber');
        $s = Seasons::get('s1');
        $u = $this->em()->getRepository(User::class)->findOneBy(['username' => 'climber']);
        $u->seasonPoints = ['s1' => 5 * $s['track']['tierPoints']];
        $p = new Purchase();
        $p->user = $u;
        $p->offer = 'seasonTrack';
        $p->season = 's1';
        $p->amount = 799;
        $p->createdAt = time();
        $this->em()->persist($p);
        $this->em()->flush();
        $this->assertSame('paid', $this->paid($p->id, 'pi_3')['result']);
        $this->em()->clear();
        $hero = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Climber']);
        foreach (array_slice($s['track']['tiers'], 0, 5) as $t) {
            $this->assertContains($t['premium'], $hero->wardrobe);
        }
        $this->assertNotContains($s['track']['tiers'][5]['premium'], $hero->wardrobe);
    }
}

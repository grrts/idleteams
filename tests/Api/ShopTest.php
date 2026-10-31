<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Entity\Purchase;
use App\Entity\User;
use App\Game\Seasons;
use App\Service\Shop;
use App\Tests\StoreMock;

/**
 * The cosmetic shop on every store: RevenueCat for iOS and Android (webhook and sync), Steam's in-game purchases,
 * looks for every hero, the supporter pass, the season track and refunds. tests/StoreMock.php plays the stores.
 */
class ShopTest extends ApiTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        StoreMock::reset();
    }

    private function rc(array $event, string $auth = 'rc_hook_secret'): array
    {
        $this->client->request('POST', '/api/shop/revenuecat', [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_AUTHORIZATION' => $auth], json_encode(['api_version' => '1.0', 'event' => $event]));

        $c = $this->client->getResponse()->getContent(); return json_decode($c, true) ?? [$c];
    }

    private function user(string $name): User
    {
        $this->em()->clear();

        return $this->em()->getRepository(User::class)->findOneBy(['username' => $name]);
    }

    private function wardrobe(string $hero): array
    {
        $this->em()->clear();

        return $this->em()->getRepository(Hero::class)->findOneBy(['name' => $hero])->wardrobe;
    }

    public function testAPhonePurchaseThroughRevenueCatGivesTheLookToEveryHeroOnce(): void
    {
        $this->as('buyer');
        $shop = $this->api('GET', '/shop');
        $this->assertSame(['revenuecat' => true, 'steam' => true], $shop['stores']);
        $this->assertSame('appl_test', $shop['revenuecat']['ios']);
        $appUser = $shop['revenuecat']['appUserId'];
        $this->assertMatchesRegularExpression('/^[0-9a-f-]{36}$/', $appUser);
        $crown = array_values(array_filter($shop['offers'], fn ($o) => $o['id'] === 'emberCrown'))[0];
        $this->assertSame('it_look_ember_crown', $crown['product']);
        $this->assertFalse($crown['owned']);

        $this->api('POST', '/shop/consent', ['offer' => 'emberCrown']);
        $this->assertSame(400, $this->httpStatus());
        $res = $this->api('POST', '/shop/consent', ['offer' => 'emberCrown', 'waive' => true]);
        $this->assertSame(['purchase' => $res['purchase'], 'product' => 'it_look_ember_crown', 'appUserId' => $appUser, 'steamItem' => 1], $res);

        // the app finishes the purchase with the store and asks the server to look
        StoreMock::$subscribers[$appUser] = ['non_subscriptions' => ['it_look_ember_crown' => [['id' => 'rc1', 'store_transaction_id' => '2000001', 'store' => 'app_store', 'is_sandbox' => false]]]];
        $this->assertSame('synced 1', $this->api('POST', '/shop/sync')['result']);
        $this->assertContains(Shop::offers()['emberCrown']['looks'][0], $this->wardrobe('Buyer'));
        $p = $this->em()->getRepository(Purchase::class)->find($res['purchase']);
        $this->assertSame(['paid', 'app_store', 'rc:2000001'], [$p->state, $p->store, $p->transactionId]);
        $this->assertGreaterThan(0, $p->waivedWithdrawalAt);

        // the webhook about the same transaction changes nothing, and a forged one is turned away
        $event = ['type' => 'NON_RENEWING_PURCHASE', 'app_user_id' => $appUser, 'product_id' => 'it_look_ember_crown', 'transaction_id' => '2000001', 'store' => 'APP_STORE', 'environment' => 'PRODUCTION', 'price_in_purchased_currency' => 2.99, 'currency' => 'EUR'];
        $this->rc($event, 'wrong');
        $this->assertSame(401, $this->httpStatus());
        $this->assertStringStartsWith('NON_RENEWING_PURCHASE: already paid', $this->rc($event)['result']);
        $this->assertCount(1, $this->em()->getRepository(Purchase::class)->findBy(['state' => 'paid']));
        $this->api('POST', '/shop/consent', ['offer' => 'emberCrown', 'waive' => true]);
        $this->assertSame(400, $this->httpStatus());

        // a refund through the store takes it back
        $this->assertSame('CANCELLATION: refunded; synced 0', $this->rc(['type' => 'CANCELLATION', 'cancel_reason' => 'CUSTOMER_SUPPORT'] + $event)['result']);
        $this->assertNotContains(Shop::offers()['emberCrown']['looks'][0], $this->wardrobe('Buyer'));
    }

    public function testTheWebhookAloneIsEnoughAndSandboxPurchasesDoNotCount(): void
    {
        $this->as('hooked');
        $appUser = $this->api('GET', '/shop')['revenuecat']['appUserId'];
        $event = ['type' => 'NON_RENEWING_PURCHASE', 'app_user_id' => '$RCAnonymousID:abc', 'aliases' => [$appUser], 'product_id' => 'it_look_fox_hood', 'transaction_id' => 'GPA.1', 'store' => 'PLAY_STORE', 'environment' => 'SANDBOX'];
        $this->assertSame('sandbox, ignored', $this->rc($event)['result']);
        $this->assertSame('test event', $this->rc(['type' => 'TEST'])['result']);
        $this->assertStringStartsWith('NON_RENEWING_PURCHASE: paid', $this->rc(['environment' => 'PRODUCTION', 'price_in_purchased_currency' => 1.99, 'currency' => 'EUR'] + $event)['result']);
        $this->assertContains(Shop::offers()['foxHood']['looks'][0], $this->wardrobe('Hooked'));
        $p = $this->em()->getRepository(Purchase::class)->findOneBy(['transactionId' => 'rc:GPA.1']);
        $this->assertSame([199, 'eur', 'play_store'], [$p->amount, $p->currency, $p->store]);
        $this->assertStringStartsWith('no account', $this->rc(['app_user_id' => 'stranger', 'aliases' => [], 'environment' => 'PRODUCTION'] + $event)['result']);
    }

    public function testTheSupporterSubscriptionFollowsTheStoreAndShowsAStarInChat(): void
    {
        $this->as('patron');
        $appUser = $this->api('GET', '/shop')['revenuecat']['appUserId'];
        $ends = time() + 31 * 86400;
        StoreMock::$subscribers[$appUser] = [
            'subscriptions' => ['it_supporter_monthly' => ['store_transaction_id' => '3000001', 'store' => 'play_store', 'expires_date' => gmdate('Y-m-d\TH:i:s\Z', $ends), 'is_sandbox' => false]],
            'entitlements' => ['supporter' => ['expires_date' => gmdate('Y-m-d\TH:i:s\Z', $ends), 'product_identifier' => 'it_supporter_monthly']],
        ];
        $this->rc(['type' => 'INITIAL_PURCHASE', 'app_user_id' => $appUser, 'product_id' => 'it_supporter_monthly', 'transaction_id' => '3000001', 'store' => 'PLAY_STORE', 'environment' => 'PRODUCTION', 'expiration_at_ms' => $ends * 1000]);
        $this->assertEqualsWithDelta($ends, $this->user('patron')->supporterUntil, 2);
        $this->assertContains(Shop::offers()['supporter']['looks'][0], $this->wardrobe('Patron'));
        $this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'Thanks for the game']);
        $line = array_values(array_filter($this->api('GET', '/chat?channel=tavern'), fn ($m) => $m['body'] === 'Thanks for the game'));
        $this->assertTrue($line[0]['author']['supporter'] ?? false);

        // a renewal is a new payment on the same subscription
        $this->rc(['type' => 'RENEWAL', 'app_user_id' => $appUser, 'product_id' => 'it_supporter_monthly', 'transaction_id' => '3000002', 'store' => 'PLAY_STORE', 'environment' => 'PRODUCTION', 'expiration_at_ms' => ($ends + 30 * 86400) * 1000]);
        $this->assertCount(2, $this->em()->getRepository(Purchase::class)->findBy(['offer' => 'supporter', 'state' => 'paid']));
        $this->assertEqualsWithDelta($ends + 30 * 86400, $this->user('patron')->supporterUntil, 2);

        StoreMock::$subscribers[$appUser]['entitlements']['supporter']['expires_date'] = gmdate('Y-m-d\TH:i:s\Z', time() - 60);
        $this->rc(['type' => 'EXPIRATION', 'app_user_id' => $appUser, 'product_id' => 'it_supporter_monthly', 'store' => 'PLAY_STORE', 'environment' => 'PRODUCTION']);
        $this->assertLessThanOrEqual(time(), $this->user('patron')->supporterUntil);
    }

    public function testASteamPurchaseIsSettledWithSteamBeforeAnythingIsGiven(): void
    {
        $this->as('steamer');
        $u = $this->user('steamer');
        $u->steamId = '76561198000000001';
        $this->em()->flush();

        $c = $this->api('POST', '/shop/consent', ['offer' => 'supporter', 'waive' => true]);
        $this->assertSame(100, $c['steamItem']);
        $this->assertSame((string) $c['purchase'], $this->api('POST', '/shop/steam/start', ['purchase' => $c['purchase'], 'language' => 'en'])['orderId']);
        $init = array_values(array_filter(StoreMock::$calls, fn ($x) => str_contains($x['url'], 'InitTxn')))[0];
        $this->assertStringContainsString('ISteamMicroTxn/InitTxn/v3', $init['url']);
        $this->assertStringContainsString('amount%5B0%5D=499', $init['body']);
        $this->assertStringContainsString('itemid%5B0%5D=100', $init['body']);

        // the player cancelled in the overlay: nothing is given
        StoreMock::$declined = [(string) $c['purchase']];
        $this->api('POST', '/shop/steam/finish', ['orderId' => (string) $c['purchase']]);
        $this->assertSame(400, $this->httpStatus());
        $this->assertSame(0, $this->user('steamer')->supporterUntil);

        StoreMock::$declined = [];
        $this->assertSame('paid', $this->api('POST', '/shop/steam/finish', ['orderId' => (string) $c['purchase']])['result']);
        $this->assertSame('already paid', $this->api('POST', '/shop/steam/finish', ['orderId' => (string) $c['purchase']])['result']);
        $this->assertEqualsWithDelta(time() + 30 * 86400, $this->user('steamer')->supporterUntil, 5);

        // someone else cannot finish it, and an account without Steam cannot start one
        $this->as('other');
        $c2 = $this->api('POST', '/shop/consent', ['offer' => 'foxHood', 'waive' => true]);
        $this->api('POST', '/shop/steam/start', ['purchase' => $c2['purchase']]);
        $this->assertSame(400, $this->httpStatus());
        $this->api('POST', '/shop/steam/finish', ['orderId' => (string) $c['purchase']]);
        $this->assertSame(400, $this->httpStatus());

        // a refund on Steam shows up in its report
        StoreMock::$report = [['orderid' => (string) $c['purchase'], 'status' => 'Refunded', 'timecreated' => gmdate('Y-m-d\TH:i:s\Z')]];
        $this->assertSame(['refunded' => 1], array_intersect_key(static::getContainer()->get(\App\Service\Steam::class)->refunds(time() - 3600), ['refunded' => 0]));
        $this->em()->flush();
        $this->assertLessThanOrEqual(time() + 5, $this->user('steamer')->supporterUntil);
    }

    public function testSteamPricesFollowThePlayersWalletCurrency(): void
    {
        $this->as('yank');
        $u = $this->user('yank');
        $u->steamId = '76561198000000002';
        $this->em()->flush();
        StoreMock::$steamCurrency = 'USD';
        $c = $this->api('POST', '/shop/consent', ['offer' => 'emberCrown', 'waive' => true]);
        $this->api('POST', '/shop/steam/start', ['purchase' => $c['purchase']]);
        $this->assertStringContainsString('currency=USD', end(StoreMock::$calls)['body']);
        StoreMock::$steamCurrency = 'JPY';
        $c = $this->api('POST', '/shop/consent', ['offer' => 'foxHood', 'waive' => true]);
        $this->assertSame('This is not on sale in your Steam currency yet.', $this->api('POST', '/shop/steam/start', ['purchase' => $c['purchase']])['error']);
    }

    public function testTheSeasonTrackGivesWhatWasReachedOnPurchase(): void
    {
        $this->as('climber');
        $s = Seasons::get('s1');
        $u = $this->em()->getRepository(User::class)->findOneBy(['username' => 'climber']);
        $u->seasonPoints = ['s1' => 5 * $s['track']['tierPoints']];
        $this->em()->flush();
        $this->assertSame('paid', static::getContainer()->get(Shop::class)->record($u, 'it_track_s1', 'app_store', 'rc:4000001'));
        $this->em()->flush();
        $hero = $this->wardrobe('Climber');
        foreach (array_slice($s['track']['tiers'], 0, 5) as $t) {
            $this->assertContains($t['premium'], $hero);
        }
        $this->assertNotContains($s['track']['tiers'][5]['premium'], $hero);
        $this->assertSame('unknown product it_track_s99', static::getContainer()->get(Shop::class)->record($u, 'it_track_s99', 'app_store', 'rc:4000002'));
    }
}

<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Entity\Notice;
use App\Entity\PushSubscription;
use App\Entity\User;
use App\Service\Notifier;
use App\Service\WebPush;

/** Notices are stored, pushed only to players who are away, and shown once by the service worker. */
class PushTest extends ApiTestCase
{
    public function testVapidTokenVerifiesWithThePublicKey(): void
    {
        $keys = WebPush::newKeys();
        $push = new WebPush($keys['private'], 'mailto:ops@example.com');
        $this->assertTrue($push->enabled());
        $this->assertSame($keys['public'], $push->publicKey());
        $raw = base64_decode(strtr($push->publicKey(), '-_', '+/'));
        $this->assertSame(65, strlen($raw), 'uncompressed P-256 point');

        [$h, $c, $sig] = explode('.', $push->jwt(['aud' => 'https://push.example.com', 'exp' => time() + 60, 'sub' => 'mailto:ops@example.com']));
        $this->assertSame(['typ' => 'JWT', 'alg' => 'ES256'], json_decode(base64_decode(strtr($h, '-_', '+/')), true));
        $rs = base64_decode(strtr($sig, '-_', '+/').'==');
        $this->assertSame(64, strlen($rs));
        // Back to DER so OpenSSL can check the signature against the public key.
        $int = fn (string $x) => "\x02".chr(strlen($x = ltrim($x, "\0") ?: "\0") + (ord($x[0]) > 0x7F ? 1 : 0)).(ord($x[0]) > 0x7F ? "\0" : '').$x;
        $seq = $int(substr($rs, 0, 32)).$int(substr($rs, 32));
        $der = "\x30".chr(strlen($seq)).$seq;
        $pub = openssl_pkey_get_details(openssl_pkey_get_private(base64_decode($keys['private'])))['key'];
        $this->assertSame(1, openssl_verify("$h.$c", $der, $pub, OPENSSL_ALGO_SHA256));
    }

    public function testDeliverPushesOnlyToPlayersWhoAreAway(): void
    {
        $this->as('ann');
        $this->api('POST', '/push/subscribe', ['endpoint' => 'https://push.example.com/send/abc123456789']);
        $this->assertSame(200, $this->httpStatus());
        $this->api('POST', '/push/subscribe', ['endpoint' => 'http://insecure.example.com/x']);
        $this->assertSame(400, $this->httpStatus(), 'only https push services');

        $em = $this->em();
        $ann = $em->getRepository(User::class)->findOneBy(['username' => 'ann']);
        $sent = [];
        $fake = new class($sent) extends WebPush {
            public function __construct(private array &$log) { parent::__construct(null, null); }
            public function enabled(): bool { return true; }
            public function send(string $endpoint, int $ttl = 86400): int { $this->log[] = $endpoint; return 201; }
        };
        $notifier = new Notifier($em, $fake);
        $now = time();

        $hero = $em->getRepository(Hero::class)->findOneBy(['user' => $ann]);
        $ann->lastSeenAt = $now;
        $notifier->notify($hero, 'wipe', 'Your group fell', 'After 1 of 3 bosses.');
        $em->flush();
        $this->assertSame(0, $notifier->deliver($now), 'no push while the player is in the game');
        $this->assertSame([], $sent);

        $ann->lastSeenAt = $now - 600;
        $notifier->notify($hero, 'chest', 'Loot in the group chest', '2 items to roll on.');
        $notifier->notify($hero, 'level', 'Ann reached level 2', 'New points to spend.');
        $em->flush();
        $this->assertSame(1, $notifier->deliver($now), 'one push per device, however many notices');
        $this->assertSame(['https://push.example.com/send/abc123456789'], $sent);
        $this->assertSame(0, $notifier->deliver($now), 'nothing pending any more');

        // The service worker asks what to show: everything pushed, once.
        $shown = $this->api('GET', '/notices/push');
        $this->assertEqualsCanonicalizing(['wipe', 'chest', 'level'], array_column($shown, 'kind'));
        $this->assertSame([], $this->api('GET', '/notices/push'));

        // A push service that says the subscription is gone loses it.
        $gone = new class extends WebPush {
            public function __construct() { parent::__construct(null, null); }
            public function enabled(): bool { return true; }
            public function send(string $endpoint, int $ttl = 86400): int { return 410; }
        };
        $em->clear();
        $hero = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Ann']);
        $n2 = new Notifier($this->em(), $gone);
        $n2->notify($hero, 'invite', 'Bo invited you', 'Open the tavern to answer.');
        $this->em()->flush();
        $n2->deliver(time() + 3600);
        $this->assertSame(0, $this->em()->getRepository(PushSubscription::class)->count([]));

        $this->api('POST', '/push/unsubscribe', ['endpoint' => 'https://push.example.com/send/abc123456789']);
        $this->assertSame(200, $this->httpStatus());
        $this->assertSame(0, $n2->prune(time() + 3600));
        $this->assertSame(4, $n2->prune(time() + 8 * 86400), 'old notices are cleared');
        $this->assertSame(0, $this->em()->getRepository(Notice::class)->count([]));
    }
}

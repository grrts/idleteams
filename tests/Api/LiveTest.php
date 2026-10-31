<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Service\Game;
use App\Service\Live;
use App\Service\Social;
use Psr\Log\NullLogger;
use Symfony\Component\Mercure\Jwt\StaticTokenProvider;
use Symfony\Component\Mercure\MockHub;
use Symfony\Component\Mercure\Update;

/** What the game writes becomes live pings, sent once per topic, and never carries game data. */
class LiveTest extends ApiTestCase
{
    public function testWritesBecomePingsForTheRightTopics(): void
    {
        $this->as('ann');
        $this->as('cara');
        $this->assertNull($this->api('GET', '/state')['live'], 'no hub configured: the client polls');

        $em = $this->em();
        $live = static::getContainer()->get(Live::class);
        $live->flush();
        $ann = $em->getRepository(Hero::class)->findOneBy(['name' => 'Ann']);
        $cara = $em->getRepository(Hero::class)->findOneBy(['name' => 'Cara']);
        $social = static::getContainer()->get(Social::class);

        static::getContainer()->get(Game::class)->post('tavern', 'Hello');
        $em->flush();
        $this->assertSame(['/chat/tavern'], $live->pending());

        $party = $social->createParty($ann, 'Test group');
        $em->flush();
        $live->flush();
        $request = $social->invite($ann, $cara, 'join us');
        $em->flush();
        $this->assertEqualsCanonicalizing(['/party/'.$party->id, '/user/'.$cara->user->id], $live->pending(), 'the invite pings the group and the invited player');
        $live->flush();

        $social->accept($cara, $request);
        $em->flush();
        $this->assertContains('/party/'.$party->id, $live->pending());
        $this->assertContains('/user/'.$cara->user->id, $live->pending(), 'joining changes what the new member sees');
        $this->assertSame(
            ['/user/'.$cara->user->id, '/party/'.$party->id, '/chat/tavern', '/chat/party:'.$party->id],
            $live->topicsFor($cara->user, $cara, $social->channels($cara)),
        );
    }

    public function testFlushSendsEachTopicOnceAsAPrivatePing(): void
    {
        $sent = [];
        $hub = new MockHub('https://hub.example/.well-known/mercure', new StaticTokenProvider('x'), function (Update $u) use (&$sent) {
            $sent[] = $u;

            return 'id';
        });
        $live = new Live($hub, new NullLogger(), 'https://hub.example/.well-known/mercure', 'https://hub.example/.well-known/mercure');
        $live->chat('guild:4');
        $live->party(7);
        $live->party(7);
        $live->party(null);
        $this->assertSame(2, $live->flush());
        $this->assertSame([['/chat/guild:4'], ['/party/7']], array_map(fn (Update $u) => $u->getTopics(), $sent));
        $this->assertTrue($sent[0]->isPrivate());
        $this->assertSame(['t' => 'party'], json_decode($sent[1]->getData(), true), 'a ping, no game data');
        $this->assertSame(0, $live->flush(), 'nothing left');
        $this->assertSame('https://hub.example/.well-known/mercure?match=%2Fuser%2F3&match=%2Fchat%2Fguild%3A4', $live->subscribeUrl(['/user/3', '/chat/guild:4']));

        $down = new MockHub('https://hub.example/.well-known/mercure', new StaticTokenProvider('x'), fn () => throw new \RuntimeException('down'));
        $live = new Live($down, new NullLogger(), 'https://hub.example/x', 'https://hub.example/x');
        $live->user(3);
        $this->assertSame(0, $live->flush(), 'a hub that is down does not break the request');
    }
}

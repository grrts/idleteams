<?php

namespace App\Tests\Api;

use App\Entity\User;

/** Report, block, automatic mute and the moderator's queue. */
class ModerationTest extends ApiTestCase
{
    public function testThreeReportsMuteTheAuthorUntilAModeratorDismisses(): void
    {
        $this->as('troll');
        $line = $this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'buy gold at example dot com']);
        $this->assertArrayHasKey('id', $line);

        foreach (['ann', 'bob', 'cat'] as $who) {
            $this->as($who);
            $this->assertTrue($this->api('POST', '/chat/'.$line['id'].'/report', ['reason' => 'spam'])['ok']);
        }
        $this->as('troll');
        $this->assertStringContainsString('muted', $this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'hello?'])['error'] ?? '', 'three reporters mute the author');
        $this->assertGreaterThan(0, $this->api('GET', '/state')['user']['mutedUntil']);

        $this->as('mod');
        $this->api('GET', '/admin/reports');
        $this->assertSame(403, $this->httpStatus(), 'players cannot read the queue');
        $u = $this->em()->getRepository(User::class)->findOneBy(['username' => 'mod']);
        $u->admin = true;
        $this->em()->flush();
        $this->as('mod');
        $queue = $this->api('GET', '/admin/reports');
        $this->assertCount(3, $queue);
        $this->assertSame('troll', $queue[0]['author']['user']);
        $this->assertTrue($this->api('POST', '/admin/reports/'.$queue[0]['id'], ['outcome' => 'dismiss'])['ok']);
        $this->assertCount(0, $this->api('GET', '/admin/reports'), 'one decision settles every report on the line');

        $this->as('troll');
        $this->assertArrayNotHasKey('error', $this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'sorry']), 'a dismissed report lifts the automatic mute');
    }

    public function testAModeratorCanRemoveALineAndMuteForADay(): void
    {
        $this->as('troll');
        $line = $this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'something nasty']);
        $this->as('ann');
        $this->api('POST', '/chat/'.$line['id'].'/report', ['reason' => 'abuse']);
        $this->as('mod');
        $u = $this->em()->getRepository(User::class)->findOneBy(['username' => 'mod']);
        $u->admin = true;
        $this->em()->flush();
        $this->as('mod');
        $queue = $this->api('GET', '/admin/reports');
        $this->api('POST', '/admin/reports/'.$queue[0]['id'], ['outcome' => 'mute', 'hours' => 24]);
        $bodies = array_column($this->api('GET', '/chat?channel=tavern'), 'body', 'id');
        $this->assertSame('[removed by a moderator]', $bodies[$line['id']]);
        $this->as('troll');
        $this->assertGreaterThan(time() + 23 * 3600, $this->api('GET', '/state')['user']['mutedUntil']);
    }

    public function testBlockingHidesThatHerosLines(): void
    {
        $this->as('troll');
        $this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'first']);
        $this->as('ann');
        $this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'hi all']);
        $blocked = $this->api('POST', '/block', ['name' => 'Troll'])['blocked'];
        $this->assertSame('Troll', $blocked[0]['name']);
        $said = fn () => array_column(array_filter($this->api('GET', '/chat?channel=tavern'), fn ($m) => $m['author']), 'body');
        $this->assertSame(['hi all'], $said());
        $this->api('DELETE', '/block/'.$blocked[0]['id']);
        $this->assertSame(['first', 'hi all'], $said());
    }

    public function testChatIsRateLimited(): void
    {
        $this->as('ann');
        $errors = 0;
        for ($i = 0; $i < 8; ++$i) {
            $errors += isset($this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'line '.$i])['error']) ? 1 : 0;
        }
        $this->assertGreaterThanOrEqual(3, $errors, 'five lines go through at once, then one every few seconds');
    }
}

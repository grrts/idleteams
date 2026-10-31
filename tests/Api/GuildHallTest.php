<?php

namespace App\Tests\Api;

use App\Entity\Guild;
use App\Entity\Hero;
use App\Entity\Item;
use App\Game\GuildHall;
use App\Game\Items;
use App\Game\Modes;
use App\Service\Game;
use Random\Engine\Mt19937;
use Random\Randomizer;

/** The guild hall: the bank with its limits, the notice board, ranks and the weekly goals. */
class GuildHallTest extends ApiTestCase
{
    public function testTheBankNoticeAndRanks(): void
    {
        $this->as('boss');
        $boss = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Boss']);
        $boss->gold = '1000';
        $this->em()->flush();
        $this->api('POST', '/guild/create', ['name' => 'Vault Keepers', 'tag' => 'VK', 'motto' => 'Share']);
        $guild = $this->api('GET', '/guilds')['mine'];
        $this->assertSame(['hall'], $guild['hall']['rooms']);
        $this->assertCount(3, $guild['hall']['goals']);
        $this->assertSame(20, $guild['hall']['bankSize']);

        $this->em()->clear();
        $boss = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Boss']);
        $items = [];
        foreach ([1, 2, 3] as $n) {
            $i = Items::fromSpec(Items::generate(new Randomizer(new Mt19937($n)), 10, 'rare'));
            $i->owner = $boss;
            $this->em()->persist($i);
            $items[] = $i;
        }
        $this->em()->flush();
        foreach ($items as $i) {
            $this->api('POST', '/guild/bank/deposit', ['id' => $i->id]);
            $this->assertSame(200, $this->httpStatus());
        }
        $this->api('POST', '/guild/bank/goldIn', ['gold' => 300]);
        $guild = $this->api('GET', '/guilds')['mine'];
        $this->assertCount(3, $guild['hall']['bank']);
        $this->assertSame(300, $guild['hall']['bankGold']);
        $this->assertSame('goldIn', $guild['hall']['log'][0][3]);

        $res = $this->api('POST', '/guild/notice', ['notice' => 'Raid on Friday']);
        $this->assertStringContainsString('level 2', $res['error'], 'the notice board opens at guild level 2');

        // A plain member takes two items a day and no gold.
        $this->as('mate');
        $gid = $this->em()->getRepository(Guild::class)->findOneBy(['name' => 'Vault Keepers'])->id;
        $this->api('POST', '/guild/'.$gid.'/join');
        $bank = $this->api('GET', '/guilds')['mine']['hall']['bank'];
        $before = count($this->api('GET', '/state')['inventory']);
        $this->api('POST', '/guild/bank/withdraw', ['id' => $bank[0]['id']]);
        $this->api('POST', '/guild/bank/withdraw', ['id' => $bank[1]['id']]);
        $res = $this->api('POST', '/guild/bank/withdraw', ['id' => $bank[2]['id']]);
        $this->assertStringContainsString('2 items a day', $res['error']);
        $res = $this->api('POST', '/guild/bank/goldOut', ['gold' => 10]);
        $this->assertStringContainsString('officers', $res['error']);
        $this->assertCount($before + 2, $this->api('GET', '/state')['inventory']);

        // The leader makes them an officer: no limit and gold too.
        $this->as('boss');
        $mate = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Mate']);
        $this->api('POST', '/guild/rank', ['hero' => $mate->id, 'rank' => 'officer']);
        $this->as('mate');
        $this->api('POST', '/guild/bank/withdraw', ['id' => $bank[2]['id']]);
        $this->assertSame(200, $this->httpStatus());
        $this->api('POST', '/guild/bank/goldOut', ['gold' => 100]);
        $this->assertSame(200, $this->httpStatus());
        $this->assertSame(200, $this->api('GET', '/guilds')['mine']['hall']['bankGold']);
    }

    public function testRunsFillTheWeeklyGoalsAndPayTheHelpers(): void
    {
        $this->as('boss');
        $boss = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Boss']);
        $boss->gold = '1000';
        $this->em()->flush();
        $this->api('POST', '/guild/create', ['name' => 'Goal Getters', 'tag' => 'GG']);
        $this->api('POST', '/party/create', ['name' => 'Goalies']);
        $game = static::getContainer()->get(Game::class);
        $this->em()->clear();
        $boss = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Boss']);
        $g = $boss->guild;
        $game->guildWeek($g);
        // One goal, near its end, so a single run finishes it.
        $g->goals = [['id' => 'bosses', 'target' => 3, 'progress' => 0, 'done' => false], ['id' => 'clears', 'target' => 10, 'progress' => 0, 'done' => false]];
        $xpBefore = $g->xp;
        $goldBefore = (int) $boss->gold;
        $b = $game->start($boss->party, time());
        $b->report = ['wiped' => false, 'encountersDone' => count($b->report['plan']), 'bossesKilled' => 3] + $b->report;
        $game->finish($b);
        $this->em()->flush();
        $this->assertTrue($g->goals[0]['done']);
        $this->assertSame(1, $g->goals[1]['progress']);
        $this->assertSame(4, $g->helpers[(string) $boss->id]);
        $this->assertSame(1, $g->trophies['goals']);
        $this->assertGreaterThan($xpBefore + GuildHall::reward(1)['guildXp'] - 1, $g->xp);
        $this->assertGreaterThan($goldBefore + GuildHall::reward($boss->level)['gold'] - 1, (int) $boss->gold);

        // A new week brings new goals and forgets who helped.
        $game->guildWeek($g, time() + 7 * 86400);
        $this->assertSame(Modes::week(time()) + 1, $g->week);
        $this->assertSame([], $g->helpers);
        $this->assertFalse($g->goals[0]['done']);
    }
}

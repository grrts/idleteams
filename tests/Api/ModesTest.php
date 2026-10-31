<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Service\Game;

/** Heroic once a group outgrows a dungeon, and the Mythic ladder at level 50. */
class ModesTest extends ApiTestCase
{
    public function testHeroicAndTheMythicLadder(): void
    {
        $this->as('lead');
        $this->api('POST', '/party/create', ['name' => 'Ladder']);
        $res = $this->api('POST', '/party/settings', ['difficulty' => 'heroic']);
        $this->assertSame(400, $this->httpStatus(), 'level 1 has not outgrown Ember Hollow');
        $this->assertStringContainsString('outgrows', $res['error']);

        $hero = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Lead']);
        $hero->level = 12;
        $this->em()->flush();
        $this->api('POST', '/party/settings', ['dungeon' => 'ember-hollow']);
        $this->api('POST', '/party/settings', ['difficulty' => 'heroic']);
        $party = $this->api('GET', '/state')['party'];
        $this->assertSame(['heroic', 0], $party['mode']);
        $this->assertSame(12, $party['dungeonLevel'], 'heroic runs at the group\'s own level');

        // Back to the newest dungeon: the group has not outgrown it, so the run falls back to normal.
        $this->api('POST', '/party/settings', ['dungeon' => null]);
        $this->assertSame(['normal', 0], $this->api('GET', '/state')['party']['mode']);

        $this->api('POST', '/party/settings', ['difficulty' => 'mythic']);
        $this->assertSame(400, $this->httpStatus(), 'mythic opens at 50');
        $hero = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Lead']);
        $hero->level = 50;
        $this->em()->flush();
        $this->api('POST', '/party/settings', ['difficulty' => 'mythic']);
        $res = $this->api('POST', '/party/settings', ['mythicTier' => 3]);
        $this->assertSame(400, $this->httpStatus(), 'no tier above one past the best cleared');
        $party = $this->api('GET', '/state')['party'];
        $this->assertSame(['mythic', 1], $party['mode']);
        $this->assertTrue($party['mythicOpen']);

        // A clear moves the group up one tier.
        $game = static::getContainer()->get(Game::class);
        $hero = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Lead']);
        $b = $game->start($hero->party, time());
        $this->assertSame('mythic', $b->mode);
        $this->assertSame(1, $b->tier);
        $this->assertNotEmpty($b->affixes);
        $b->report = ['wiped' => false, 'encountersDone' => count($b->report['plan']), 'bossesKilled' => 3] + $b->report;
        $game->finish($b);
        $this->em()->flush();
        $this->assertSame(1, $hero->party->mythicBest);
        $this->assertSame(2, $hero->party->mythicTier);
        $this->assertSame(1, $hero->career['mythicBest']);
        $this->api('POST', '/party/settings', ['mythicTier' => 1]);
        $this->assertSame(200, $this->httpStatus(), 'the leader may step back down');
    }
}

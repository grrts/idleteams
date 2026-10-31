<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Service\Game;

/** Groups run the newest dungeon they have reached, or one the leader picks from those. */
class DungeonChoiceTest extends ApiTestCase
{
    public function testTheLeaderPicksFromReachedDungeons(): void
    {
        $this->as('lead');
        $this->api('POST', '/party/create', ['name' => 'Bands']);
        $party = $this->api('GET', '/state')['party'];
        $this->assertSame('ember-hollow', $party['dungeon']);
        $this->assertSame(['ember-hollow'], $party['unlocked']);

        $res = $this->api('POST', '/party/settings', ['dungeon' => 'ashen-grove']);
        $this->assertSame(400, $this->httpStatus(), 'level 1 has not reached the Ashen Grove');
        $this->assertStringContainsString('not reached', $res['error']);

        $hero = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Lead']);
        $hero->level = 20;
        $this->em()->flush();
        $party = $this->api('GET', '/state')['party'];
        $this->assertSame('ashen-grove', $party['dungeon'], 'the newest reached is the default');
        $this->assertSame(20, $party['dungeonLevel']);

        $this->api('POST', '/party/settings', ['dungeon' => 'ember-hollow']);
        $party = $this->api('GET', '/state')['party'];
        $this->assertSame('ember-hollow', $party['dungeon']);
        $this->assertSame(10, $party['dungeonLevel'], 'an older dungeon is fought at the top of its band');

        $this->api('POST', '/party/settings', ['dungeon' => null]);
        $this->assertSame('ashen-grove', $this->api('GET', '/state')['party']['dungeon']);
        $this->em()->clear();
        $p = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Lead'])->party;
        $this->assertSame('ashen-grove', static::getContainer()->get(Game::class)->dungeonFor($p)['id']);
    }
}

<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Entity\Party;
use App\Entity\WorldRaid;
use App\Game\Seasons;
use App\Service\WorldRaids;

/** The season's world raid: whole groups sign up as squads, and the tick fights them all at once. */
class WorldRaidTest extends ApiTestCase
{
    public function testGroupsSignUpAndTheRaidIsFoughtWhenDue(): void
    {
        $s = Seasons::get('s1');
        $monday = $s['startsAt'] + 604800;
        $world = static::getContainer()->get(WorldRaids::class);
        $em = $this->em();
        $leaders = [];
        foreach (['alpha', 'beta'] as $g) {
            $this->as($g.'one');
            $this->api('POST', '/party/create', ['name' => ucfirst($g).' Squad']);
            $party = $em->getRepository(Party::class)->findOneBy(['name' => ucfirst($g).' Squad']);
            foreach (['two', 'three', 'four'] as $n) {
                $this->as($g.$n);
                $h = $em->getRepository(Hero::class)->findOneBy(['name' => ucfirst($g).$n]);
                $h->party = $party;
                $party->members->add($h);
            }
            $em->flush();
            $leaders[] = $party->leader;
        }
        foreach ($em->getRepository(Hero::class)->findAll() as $h) {
            $h->level = 50;
        }
        $em->flush();

        $low = $leaders[0];
        $r = $world->signup($leaders[0], $monday);
        $world->signup($leaders[1], $monday);
        $em->flush();
        $this->assertCount(2, $r->squads);
        $this->assertSame(WorldRaids::startsAt($s['worldRaid'], $r->week), $r->startsAt);
        $this->assertSame(6, (int) gmdate('N', $r->startsAt));
        try {
            $world->signup($leaders[0], $monday);
            $this->fail('signed up twice');
        } catch (\App\Service\GameError) {
        }

        $this->assertSame(0, $world->due($r->startsAt - 1));
        $this->assertSame(1, $world->due($r->startsAt));
        $em->flush();
        $em->clear();
        $r = $em->getRepository(WorldRaid::class)->findOneBy([]);
        $this->assertSame('done', $r->state);
        $this->assertSame(8, $r->report['heroes']);
        $this->assertCount(2, $r->report['squads']);
        $this->assertGreaterThan(0, $r->report['squads'][0]['damage']);
        $this->assertFalse($r->report['won']);
        $hero = $em->find(Hero::class, $low->id);
        $this->assertGreaterThan(0, $hero->user->seasonPoints['s1'] ?? 0);
        try {
            $world->signup($hero, $r->startsAt + 60);
            $this->fail('signed up after the start');
        } catch (\App\Service\GameError) {
        }
    }

    public function testFiftySquadsAreFoughtInAFewSeconds(): void
    {
        // The world raid's own load test: 50 squads of 5 (250 heroes) through the simulator, as the tick does.
        $w = Seasons::get('s1')['worldRaid'];
        $party = [];
        foreach (['guardian', 'cleric', 'ranger', 'mage', 'rogue'] as $n => $cls) {
            $b = \App\Game\Reference::build($cls, 50, 'epic');
            $b['path'] = array_key_first(\App\Game\Rules::CLASSES[$cls]['paths']);
            $party[] = \App\Game\Combatants::make($b, $n + 1, $cls);
        }
        $t = microtime(true);
        $total = 0.0;
        for ($k = 0; $k < 50; ++$k) {
            $total += (new \App\Game\Simulator())->run($party, 50, 900 + $k, $w['fight'], ['pack' => [1.0, 1.0], 'boss' => [$w['health'], $w['damage']], 'affixes' => []])['report']['bossShare'];
        }
        $this->assertLessThan(10.0, microtime(true) - $t);
        // epic squads alone are close to the line: the raid is won with some legendary help, or lost by a little
        $this->assertEqualsWithDelta($w['needed'] * 50, $total, 10.0);
    }
}

<?php

namespace App\Tests\Api;

use App\Game\Prologue;
use App\Game\Rules;

/** The first fight: shaped like a run, always a clear, never rewarded, shown once. */
class PrologueTest extends ApiTestCase
{
    public function testEveryClassClearsIt(): void
    {
        foreach (array_keys(Rules::CLASSES) as $cls) {
            $hero = \App\Game\Combatants::make(\App\Game\Reference::build($cls, 1), 7, 'Me');
            $run = Prologue::run($hero, []);
            $this->assertFalse($run['report']['wiped'], $cls);
            $this->assertSame(['tank', 'healer', 'dps', 'dps', 'dps'], array_column($run['roster'], 'role'), $cls);
            $this->assertContains(7, array_column($run['roster'], 'id'));
            $this->assertLessThan(60, $run['timeline']['length'], 'one short wing');
        }
    }

    public function testShownOnceAndWorthNothing(): void
    {
        $this->as('newbie');
        $hero = $this->api('GET', '/state')['hero'];
        $this->assertTrue($hero['prologue']);
        $gold = $hero['gold'];

        $run = $this->api('GET', '/prologue')['current'];
        $this->assertTrue($run['prologue']);
        $this->assertSame(Prologue::SECONDS, $run['endsAt'] - $run['startedAt']);
        $this->assertCount(Prologue::ENCOUNTERS, $run['plan']);
        $this->assertNotEmpty($run['timeline']['events']);

        $hero = $this->api('POST', '/prologue/done');
        $this->assertFalse($hero['prologue']);
        $this->assertSame($gold, $hero['gold']);
        $this->assertSame(0, $hero['xp']);
        $this->assertFalse($this->api('GET', '/state')['hero']['prologue']);
    }
}

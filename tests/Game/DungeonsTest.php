<?php

namespace App\Tests\Game;

use App\Game\Combatants;
use App\Game\Dungeons;
use App\Game\Reference;
use App\Game\Rules;
use App\Game\Simulator;
use PHPUnit\Framework\TestCase;

/** Dungeons are data files; every one must load, and the simulator must run it. */
class DungeonsTest extends TestCase
{
    public function testEveryDungeonLoadsAndRuns(): void
    {
        $all = Dungeons::all();
        $this->assertArrayHasKey(Dungeons::DEFAULT, $all);
        foreach ($all as $id => $d) {
            $this->assertGreaterThan(0, Dungeons::bossCount($d), $id);
            $this->assertSame('boss', end($d['plan'])[0], "$id ends on a boss");
            $level = max(1, $d['levels'][0]);
            $party = [];
            foreach (Reference::COMP as $n => $cls) {
                $b = Reference::build($cls, $level);
                $b['path'] = $level >= Rules::PATH_LEVEL ? array_key_first(Rules::CLASSES[$cls]['paths']) : null;
                $party[] = Combatants::make($b, $n + 1, $cls.$n);
            }
            $rep = (new Simulator())->run($party, $level, 11, $d)['report'];
            $this->assertSame($d['name'], $rep['dungeon']);
            $this->assertSame(Dungeons::plan($d), $rep['plan']);
        }
    }

    public function testABrokenFileFailsLoudly(): void
    {
        $dir = sys_get_temp_dir().'/it-dungeons-'.getmypid();
        @mkdir($dir.'/x/dungeons', 0777, true);
        file_put_contents($dir.'/x/pack.json', '{"id":"x"}');
        $d = json_decode(file_get_contents(Dungeons::dir().'/base/dungeons/ember-hollow.json'), true);
        $d['plan'][] = ['boss', 'nobody', 0];
        file_put_contents($dir.'/x/dungeons/bad.json', json_encode($d));
        try {
            $this->expectExceptionMessage('plan 9: unknown boss nobody');
            Dungeons::all($dir);
        } finally {
            unlink($dir.'/x/dungeons/bad.json');
        }
    }

    public function testFractionsKeepTheOldArithmetic(): void
    {
        $x = 1234.567 * 11 * 0.73;
        $this->assertSame($x / 3, Dungeons::share($x, '1/3'));
        $this->assertSame($x * 0.5, Dungeons::share($x, 0.5));
    }
}

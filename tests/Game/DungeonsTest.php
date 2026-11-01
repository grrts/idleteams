<?php

namespace App\Tests\Game;

use App\Game\Combatants;
use App\Game\Dungeons;
use App\Game\Modes;
use App\Game\Lore;
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
            $this->assertNotNull(Lore::entry($d['lore']), "$id has a lore entry");
            foreach ($d['bosses'] as $b) {
                $this->assertNotNull(Lore::entry($b['lore'] ?? ''), "$id: {$b['name']} has a lore entry");
            }
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

    public function testBandsCoverEveryLevelAndGroupsMoveOn(): void
    {
        for ($level = 1; $level <= 150; ++$level) {
            $d = Dungeons::newest($level);
            $this->assertGreaterThanOrEqual($d['levels'][0], $level);
            $this->assertSame($level, Dungeons::clamp($d, $level), "level $level fits the band of {$d['name']}");
        }
        $this->assertSame('ember-hollow', Dungeons::newest(1)['id']);
        $this->assertSame('wyvern-roost', Dungeons::newest(50)['id']);
        $this->assertSame('starfall-observatory', Dungeons::newest(52)['id'], 'past 50 there are new dungeons');
        $this->assertSame('dreaming-deep', Dungeons::newest(79)['id']);
        $this->assertSame('dreaming-deep', Dungeons::newest(150)['id'], 'the last dungeon has no top level');
        $this->assertFalse(Modes::heroicOpen(Dungeons::get('dreaming-deep'), 88), 'the last dungeon opens Heroic ten levels in');
        $this->assertTrue(Modes::heroicOpen(Dungeons::get('dreaming-deep'), 89));
        $this->assertSame(10, Dungeons::clamp(Dungeons::get('ember-hollow'), 30), 'an old dungeon stays at its top level');
        $this->assertArrayNotHasKey('ashen-grove', Dungeons::unlocked(17));
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

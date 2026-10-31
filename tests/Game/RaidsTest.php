<?php

namespace App\Tests\Game;

use App\Game\Art;
use App\Game\Combatants;
use App\Game\Raids;
use App\Game\Reference;
use App\Game\Rules;
use App\Game\Simulator;
use PHPUnit\Framework\TestCase;

class RaidsTest extends TestCase
{
    public function testTheRaidLoadsWithArtAndFills(): void
    {
        $raid = Raids::get('sundered-keep');
        $this->assertNotNull($raid);
        $this->assertCount(4, $raid['fronts']);
        $known = [...Art::BUILTIN_MONSTERS, ...array_keys(Art::parts('monster'))];
        foreach ([...$raid['fronts'], $raid['final']] as $d) {
            foreach ([...array_values($d['enemies']), ...array_values($d['bosses'])] as $e) {
                $this->assertContains($e['art'], $known, $e['name']);
            }
        }
        // 40 sign-ups: eight full squads, each with a tank and a healer, spread over the fronts.
        $signups = [];
        for ($i = 1; $i <= 40; ++$i) {
            $signups[$i] = $i <= 8 ? 'tank' : ($i <= 16 ? 'healer' : 'dps');
        }
        $fill = Raids::autoFill($signups, 4);
        $this->assertCount(8, $fill['squads']);
        foreach ($fill['squads'] as $k => $sq) {
            $this->assertCount(5, $sq);
            $this->assertSame([], Raids::warnings(array_map(fn ($id) => $signups[$id], $sq)), "squad $k");
        }
        $this->assertSame([0, 1, 2, 3, 0, 1, 2, 3], $fill['fronts']);
        $this->assertSame(['no healer', 'only 2 of 5'], Raids::warnings(['tank', 'dps']));
        $this->assertTrue(Raids::won(8, 4));
        $this->assertFalse(Raids::won(8, 3));
        $this->assertFalse(Raids::won(1, 1), 'one squad alone cannot win');
        $this->assertSame(60, Raids::level($raid, [40, 60, 70]));
    }

    public function testTheKingNeedsEpicGear(): void
    {
        $raid = Raids::get('sundered-keep');
        $clears = function (string $q, array $d, int $lost) use ($raid): int {
            $party = [];
            foreach (['guardian', 'cleric', 'ranger', 'mage', 'rogue'] as $n => $cls) {
                $b = Reference::build($cls, 50, $q);
                $b['path'] = array_key_first(Rules::CLASSES[$cls]['paths']);
                $party[] = Combatants::make($b, $n + 1, $cls);
            }
            $c = 0;
            for ($k = 0; $k < 4; ++$k) {
                $c += (new Simulator())->run($party, 50, 300 + $k, $d, Raids::mods($raid, $lost))['report']['wiped'] ? 0 : 1;
            }

            return $c;
        };
        $this->assertSame(0, $clears('rare', $raid['final'], 0), 'rare gear does not beat the King');
        $this->assertSame(4, $clears('legendary', $raid['final'], 1));
        $this->assertSame(4, $clears('epic', $raid['fronts'][0], 0), 'epic squads take the fronts');
    }
}

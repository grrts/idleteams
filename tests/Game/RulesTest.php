<?php

namespace App\Tests\Game;

use App\Game\Combatants;
use App\Game\Reference;
use App\Game\Rules;
use App\Game\Simulator;
use App\Game\Stats;
use PHPUnit\Framework\TestCase;

class RulesTest extends TestCase
{
    public function testCurveGetsSteepAndNeverReachesOne(): void
    {
        foreach ([1, 20, 100] as $level) {
            $half = Stats::pointsFor(0.5, $level);
            $this->assertEqualsWithDelta(0.5, Stats::curve($half, $level), 1e-6);
            // Going from 50% to 75% costs far more than 0% to 50%.
            $this->assertGreaterThan(4 * $half, Stats::pointsFor(0.75, $level) - $half);
            $this->assertLessThan(1.0, Stats::curve(1e9, $level));
        }
    }

    public function testEveryClassHasPathsUltimateAndSuggestedPoints(): void
    {
        foreach (Rules::CLASSES as $id => $c) {
            $this->assertCount(2, $c['paths'], $id);
            $this->assertSame(20, array_sum($c['points']), $id.' pre-spent points');
            $this->assertNotEmpty(Combatants::defaultLoadout($id, 1, null), $id);
            $this->assertArrayHasKey($c['ultimate'][0], Rules::classSkills($id));
        }
    }

    public function testBattlesAreDeterministic(): void
    {
        $party = $this->party(10);
        $a = (new Simulator())->run($party, 10, 42);
        $b = (new Simulator())->run($party, 10, 42);
        $this->assertSame($a['report'], $b['report']);
    }

    public function testBalancedGroupClearsAndFiveDpsDoNot(): void
    {
        foreach ([1, 20] as $level) {
            $won = (new Simulator())->run($this->party($level), $level, 7)['report'];
            $this->assertFalse($won['wiped'], "balanced group at $level: ".$won['cause']);
        }
        $dps = $this->party(20, ['ranger', 'mage', 'rogue', 'ranger', 'mage']);
        $this->assertTrue((new Simulator())->run($dps, 20, 7)['report']['wiped']);
    }

    private function party(int $level, array $classes = Reference::COMP): array
    {
        $out = [];
        foreach ($classes as $n => $cls) {
            $b = Reference::build($cls, $level);
            $b['path'] = $level >= Rules::PATH_LEVEL ? array_key_first(Rules::CLASSES[$cls]['paths']) : null;
            $out[] = Combatants::make($b, $n + 1, $cls.$n);
        }

        return $out;
    }
}

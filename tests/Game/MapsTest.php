<?php

namespace App\Tests\Game;

use App\Game\Heritage;
use App\Game\Rules;
use App\Game\Stats;
use App\Game\Talents;
use App\Game\TreeMap;
use PHPUnit\Framework\TestCase;

class MapsTest extends TestCase
{
    public function testEveryAttributeDoesSomethingForEveryClass(): void
    {
        foreach (array_keys(Rules::CLASSES) as $cls) {
            $this->assertSame(array_keys(Rules::ATTRIBUTES), array_keys(Rules::TWISTS[$cls]), $cls);
            foreach (Rules::ATTRIBUTES as $a => $_) {
                $this->assertArrayHasKey($a, Rules::AFFIXES, 'gear can roll '.$a);
            }
        }
        // A guardian with Arcana gets block from it; a cleric with Might heals harder.
        $base = ['race' => 'human', 'origin' => 'anvil', 'level' => 20, 'items' => []];
        $g = Stats::derive($base + ['cls' => 'guardian', 'spent' => ['arcana' => 40]]);
        $this->assertGreaterThan(Stats::derive($base + ['cls' => 'guardian'])['block'], $g['block']);
        $c = Stats::derive($base + ['cls' => 'cleric', 'spent' => ['might' => 40]]);
        $this->assertGreaterThan(Stats::derive($base + ['cls' => 'cleric'])['spirit'], $c['spirit']);
    }

    public function testMapsAreBigAndEveryNodeCanBeReached(): void
    {
        $maps = [];
        foreach (array_keys(Talents::TREES) as $cls) {
            $maps[$cls] = [Talents::tree($cls), null];
        }
        foreach (array_keys(Heritage::TREES) as $race) {
            foreach (array_keys(Heritage::tree($race)['cultures']) as $culture) {
                $maps[$race.':'.$culture] = [Heritage::tree($race), $culture];
            }
        }
        foreach ($maps as $name => [$tree, $culture]) {
            $this->assertGreaterThan(1000, count($tree['nodes']), $name);
            $seen = ['root' => true];
            $queue = ['root'];
            while ($queue) {
                $id = array_shift($queue);
                foreach ($tree['nodes'][$id]['links'] as $l) {
                    $this->assertContains($id, $tree['nodes'][$l]['links'], "$name: links go both ways");
                    $c = $tree['nodes'][$l]['culture'];
                    if (!isset($seen[$l]) && ($c === null || $c === $culture)) {
                        $seen[$l] = true;
                        $queue[] = $l;
                    }
                }
            }
            $open = array_filter($tree['nodes'], fn ($n) => $n['culture'] === null || $n['culture'] === $culture);
            $this->assertCount(count($open), $seen, "$name: every node of the map can be reached");
        }
    }

    public function testAPathLearnsInOrderAndCultureNodesNeedTheCulture(): void
    {
        $tree = Talents::tree('mage');
        $path = TreeMap::path($tree, [], 'fire.0.30');
        $have = [];
        foreach ($path as $id) {
            $this->assertNull(TreeMap::check($tree, $have, $id, 99), $id);
            $have[$id] = 1;
        }
        $this->assertSame('keystone', $tree['nodes']['fire.0.30']['kind']);
        $h = Heritage::tree('elf');
        $this->assertNull(TreeMap::path($h, ['root' => 1], 'starspire0.2.3', 'silverwood'));
        $this->assertCount(3, TreeMap::path($h, ['root' => 1], 'starspire0.2.3', 'starspire'));
    }
}

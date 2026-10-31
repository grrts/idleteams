<?php

namespace App\Tests\Game;

use App\Game\Heritage;
use App\Game\LifeStory;
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

    public function testBackstoriesCoverEveryCultureBranchAndCountAsKin(): void
    {
        foreach (array_keys(Heritage::TREES) as $race) {
            $tree = Heritage::tree($race);
            $stories = Heritage::backstories($race);
            $this->assertCount(9, $stories, $race);
            $this->assertEqualsCanonicalizing(array_merge(...array_column($tree['cultures'], 3)), array_column($stories, 2), "$race: one backstory per culture branch");
            foreach ($stories as $id => [, $cid]) {
                $start = Heritage::backstoryStart($race, $id);
                $this->assertCount(Heritage::points(Heritage::rank(Heritage::BACKSTORY_RENOWN)), $start, "$race $id: the head start fills its points");
                $have = [];
                foreach (array_keys($start) as $node) {
                    $this->assertNull(TreeMap::check($tree, $have, $node, 99, $cid), "$race $id $node");
                    $have[$node] = 1;
                }
            }
        }
        $this->assertSame(1, Heritage::kin('dwarf', 'runedeep', [['dwarf', 'ironhold', 'smith']], 'delver'));
        $this->assertSame(2, Heritage::kin('dwarf', 'ironhold', [['dwarf', 'ironhold', 'shieldbearer']], 'smith'));
        $this->assertSame(3, Heritage::kin('dwarf', 'ironhold', [['dwarf', 'ironhold', 'smith']], 'smith'));

        $build = ['race' => 'dwarf', 'cls' => 'guardian', 'origin' => 'anvil', 'level' => 5, 'items' => [], 'backstory' => 'smith', 'culture' => 'ironhold'];
        $attrs = Stats::attributes($build);
        $this->assertContains('Backstory: Forge Apprentice', array_column($attrs['sources']['guard'] ?? [], 0));
        $this->assertEqualsWithDelta(Heritage::BACKSTORY_RENOWN_BONUS, Stats::derive($build)['renownBonus'], 0.05);
        $this->assertEqualsWithDelta(0.0, Stats::derive(['culture' => 'runedeep'] + $build)['renownBonus'], 0.05, 'the Renown bonus needs the culture');
    }

    public function testLifeStoriesDifferByRaceAndFeedHeritage(): void
    {
        $seen = [];
        foreach (LifeStory::QUESTIONS as $race => $q) {
            $this->assertCount(count(LifeStory::ids()), $q, $race);
            foreach ($q as $id => $x) {
                foreach (is_array($x) ? [$x[0], ...array_column($x[1], 1)] : [$x] as $text) {
                    $this->assertArrayNotHasKey($text, $seen, "$race $id is worded like ".($seen[$text] ?? ''));
                    $seen[$text] = $race;
                }
            }
        }
        $story = LifeStory::example('orc', 'raincaller', 2);
        $this->assertSame($story, LifeStory::clean('orc', $story));
        $this->assertSame('stormcaller', $story['answers']['home']);
        $bad = $story;
        $bad['answers']['home'] = 'ashland';
        $this->expectException(\InvalidArgumentException::class);
        LifeStory::clean('orc', $bad);
    }

    public function testALifeStoryLeansToItsThreeMostNamedAttributes(): void
    {
        $story = LifeStory::example('elf', 'treeborn');
        $lean = LifeStory::lean('elf', $story);
        $this->assertCount(3, $lean);
        $this->assertSame([2, 2, 2], array_values($lean));
        $build = ['race' => 'elf', 'cls' => 'mage', 'origin' => 'ember', 'level' => 1, 'items' => [], 'story' => $story];
        $src = Stats::attributes($build)['sources'];
        foreach (array_keys($lean) as $a) {
            $this->assertContains('Life story', array_column($src[$a], 0), $a);
        }
        $bio = LifeStory::biography('elf', 'Arwen', ['notes' => 'I still dream of the sea.'] + $story);
        $this->assertSame('In their own words', end($bio)[0]);
        $this->assertStringContainsString('Silverwood', $bio[0][1]);
        $this->assertStringContainsString('Silverwood', $bio[2][1]);
    }
}

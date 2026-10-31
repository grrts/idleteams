<?php

namespace App\Tests\Game;

use App\Game\Marks;
use App\Service\HeroActions;
use PHPUnit\Framework\TestCase;

class MarksTest extends TestCase
{
    private function rep(bool $wiped, array $rows): array
    {
        return ['wiped' => $wiped, 'heroes' => $rows];
    }

    public function testThereAreAboutThirtyAndTheyAreAllDescribed(): void
    {
        $this->assertGreaterThanOrEqual(30, count(Marks::ALL));
        $this->assertSame(Marks::ALL, HeroActions::MARKS);
        foreach (Marks::ALL as $id => [$name, $text]) {
            $this->assertNotSame('', $name, $id);
            $this->assertNotSame('', $text, $id);
        }
    }

    public function testBattleMarks(): void
    {
        $rows = [
            ['cls' => 'guardian', 'damage' => 900, 'deaths' => 0, 'healing' => 0, 'overheal' => 0, 'mechanics' => ['busterDodged' => 3]],
            ['cls' => 'cleric', 'damage' => 100, 'deaths' => 0, 'healing' => 500, 'overheal' => 700, 'mechanics' => []],
            ['cls' => 'mage', 'damage' => 800, 'deaths' => 0, 'healing' => 0, 'overheal' => 0, 'mechanics' => []],
        ];
        $hero = ['level' => 26, 'role' => 'tank', 'career' => ['battles' => 1, 'dungeons' => 1, 'bossKills' => 3, 'deaths' => 0, 'cleared' => ['a', 'b']]];
        $group = array_fill(0, 5, ['race' => 'dwarf', 'real' => true]);
        $tank = Marks::fromBattle($hero, 0, $this->rep(false, $rows), $group, 'b', ['a', 'b']);
        foreach (['firstBattle', 'firstClear', 'level10', 'level25', 'untouchable', 'notAScratch', 'tankTop', 'fullTable', 'oneBlood', 'cartographer'] as $m) {
            $this->assertContains($m, $tank, $m);
        }
        $this->assertNotContains('level40', $tank);
        $this->assertNotContains('manyRoads', $tank);

        $healer = Marks::fromBattle($hero, 1, $this->rep(false, $rows), $group, 'b', ['a', 'b', 'c']);
        $this->assertContains('overflowing', $healer);
        $this->assertNotContains('cartographer', $healer, 'one dungeon still uncleared');
        $this->assertNotContains('battleMedic', $healer);

        $rows[0]['deaths'] = 1;
        $rows[1]['deaths'] = 2;
        $mage = Marks::fromBattle($hero, 2, $this->rep(true, $rows), $group, 'b', ['a', 'b']);
        $this->assertContains('lastStanding', $mage);
        $this->assertNotContains('notAScratch', $mage);
    }
}

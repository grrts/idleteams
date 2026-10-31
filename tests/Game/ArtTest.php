<?php

namespace App\Tests\Game;

use App\Game\Art;
use App\Game\Crowd;
use App\Game\Dungeons;
use App\Game\Items;
use App\Game\Rules;
use PHPUnit\Framework\TestCase;
use Random\Engine\Mt19937;
use Random\Randomizer;

class ArtTest extends TestCase
{
    public function testTheCatalogueLoadsAndEveryPartIsValid(): void
    {
        $parts = Art::all()['parts'];
        foreach ($parts as $kind => $list) {
            foreach ($list as $id => $p) {
                $this->assertNull(Art::check($kind, $id, array_diff_key($p, ['pack' => 1])), "$kind $id");
            }
        }
        // the launch push: well past the built-in handful in every kind
        $this->assertGreaterThanOrEqual(60, count($parts['weapon']));
        $this->assertGreaterThanOrEqual(40, count($parts['hat']));
        $this->assertGreaterThanOrEqual(40, count($parts['hair']), 'the launch target');
        $this->assertGreaterThanOrEqual(60, count($parts['top']), 'the launch target');
        $this->assertGreaterThanOrEqual(10, count($parts['offhand']));
        foreach (array_keys(Rules::RACES) as $race) {
            $this->assertGreaterThanOrEqual(6, count(Art::creator()['features'][$race] ?? []), $race);
        }
        $this->assertCount(32, Rules::DYES);
    }

    public function testEveryDungeonEnemyAndBossHasArt(): void
    {
        $known = [...Art::BUILTIN_MONSTERS, ...array_keys(Art::parts('monster'))];
        $this->assertGreaterThanOrEqual(30, count(Art::parts('monster')));
        foreach (Dungeons::all() as $d) {
            foreach ([...array_values($d['enemies']), ...array_values($d['bosses'])] as $e) {
                $this->assertContains($e['art'], $known, $d['id'].': '.$e['name']);
            }
        }
        $this->assertStringContainsString('size', (string) Art::check('monster', 'blob', ['name' => 'Blob', 'layers' => [['dot', 0, 0, 'dye1']]]));
        $this->assertStringContainsString('built in', (string) Art::check('monster', 'golem', ['name' => 'Golem', 'size' => [20, 20], 'layers' => [['dot', 0, 0, 'dye1']]]));
    }

    public function testWornPartsBecomeItemBasesThatDrop(): void
    {
        $bases = Art::bases();
        $this->assertSame('Falchion', $bases['weapon']['falchion'] ?? null);
        $this->assertSame('Tricorn', $bases['head']['tricorn'] ?? null);
        $this->assertSame('Sword', $bases['weapon']['sword'], 'built-in bases stay first and unchanged');
        $this->assertArrayNotHasKey('curtains', $bases['head'], 'hair is chosen at creation, not worn');
        $item = Items::generate(new Randomizer(new Mt19937(1)), 10, 'rare', 'weapon', 'falchion');
        $this->assertStringContainsString('Falchion', Items::name($item));
        $seen = [];
        $r = new Randomizer(new Mt19937(7));
        for ($i = 0; $i < 400; ++$i) {
            $seen[Items::generate($r, 10, 'common', 'head')['base']] = true;
        }
        $this->assertGreaterThan(30, count($seen), 'drops use the new hats too');
    }

    public function testBrokenPartsAreRefusedWithAReason(): void
    {
        $this->assertStringContainsString('grip', Art::check('weapon', 'stick', ['name' => 'Stick', 'layers' => [['path', 'M0 0 L1 1 Z', 'wood']]]));
        $this->assertStringContainsString('colour', Art::check('hat', 'cap', ['name' => 'Cap', 'layers' => [['path', 'M0 0 L1 1 Z', 'purple']]]));
        $this->assertStringContainsString('built in', Art::check('weapon', 'sword', ['name' => 'Sword', 'grip' => 'sword', 'layers' => [['path', 'M0 0 Z', 'steel']]]));
        $this->assertStringContainsString('races', Art::check('feature', 'spots2', ['name' => 'Spots', 'races' => ['goblin'], 'layers' => [['dot', 0, 0, 'dark']]]));
        $this->assertStringContainsString('no layers', Art::check('hat', 'nothing', ['name' => 'Nothing']));
        $this->assertNull(Art::check('hat', 'cap', ['name' => 'Cap', 'layers' => [['path', 'M0 0 L1 1 Z', 'dye1:0.3'], ['ellipse', 0, 0, 1, 1, '#ffffff'], ['glow', 0, 0, 3, 'gem+0.2']]]));
        $this->assertTrue(Art::colourOk('steel+0.4'));
        $this->assertFalse(Art::colourOk('#fff'));
    }

    public function testACrowdOf250HasUnderOnePercentExactDuplicates(): void
    {
        $crowd = Crowd::make(250, 3);
        $this->assertCount(250, $crowd);
        $this->assertLessThan(3, Crowd::duplicates($crowd)['exact']);
        // the counter itself: two identical heroes are two duplicates
        $this->assertSame(['exact' => 2, 'shape' => 2], Crowd::duplicates([$crowd[0], $crowd[0], $crowd[1]]));
    }
}

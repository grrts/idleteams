<?php

namespace App\Tests\Game;

use App\Game\Combatants;
use App\Game\Dungeons;
use App\Game\Modes;
use App\Game\Reference;
use App\Game\Rules;
use App\Game\Simulator;
use PHPUnit\Framework\TestCase;

class ModesTest extends TestCase
{
    public function testTheWeekPicksTheAffixes(): void
    {
        $monday = 1793577600; // 2026-11-02 00:00 UTC, a Monday
        $this->assertSame(Modes::week($monday), Modes::week($monday + 604799), 'a week runs Monday to Sunday');
        $this->assertSame(Modes::week($monday) + 1, Modes::week($monday + 604800));
        $this->assertSame(Modes::week($monday) - 1, Modes::week($monday - 1));
        $seen = [];
        for ($w = 0; $w < 8; ++$w) {
            [$a, $b] = Modes::weekly($w);
            $this->assertContains($a, ['fortified', 'tyrannical']);
            $seen[$b] = true;
        }
        $this->assertCount(count(Modes::SECOND), $seen, 'every second affix comes round in eight weeks');
        $this->assertSame([], Modes::affixes('heroic', 0, 3));
        $this->assertCount(1, Modes::affixes('mythic', Modes::SECOND_AT - 1, 3));
        $this->assertCount(2, Modes::affixes('mythic', Modes::SECOND_AT, 3));
        foreach ([...Modes::SECOND, 'fortified', 'tyrannical'] as $id) {
            $this->assertArrayHasKey($id, Modes::AFFIXES);
        }
    }

    public function testHigherTiersAreTougherAndPayMore(): void
    {
        $this->assertSame(['pack' => [1.0, 1.0], 'boss' => [1.0, 1.0], 'affixes' => []], Modes::mods('normal', 0, []));
        $m1 = Modes::mods('mythic', 1, ['tyrannical']);
        $m5 = Modes::mods('mythic', 5, ['tyrannical']);
        $this->assertGreaterThan($m1['boss'][0], $m5['boss'][0]);
        $this->assertGreaterThan($m1['pack'][0], $m1['boss'][0], 'tyrannical toughens bosses only');
        $this->assertGreaterThan(Modes::reward('heroic', 0)['ilvl'], Modes::reward('mythic', 1)['ilvl']);
        $this->assertGreaterThan(Modes::reward('mythic', 1)['units'], Modes::reward('mythic', 6)['units']);
        $d = Dungeons::get('ember-hollow');
        $this->assertSame(10, Modes::level($d, 30, 'normal'));
        $this->assertSame(30, Modes::level($d, 30, 'heroic'));
        $this->assertTrue(Modes::heroicOpen($d, 10));
        $this->assertFalse(Modes::heroicOpen(Dungeons::get('wyvern-roost'), 49));
    }

    public function testMythicIsAGearCheckAndAffixesShowInTheFight(): void
    {
        $d = Dungeons::get('wyvern-roost');
        $clear = function (string $quality, string $mode, int $tier, array $affixes) use ($d): array {
            $out = ['clears' => 0, 'mechs' => []];
            for ($k = 0; $k < 4; ++$k) {
                $party = [];
                foreach (['guardian', 'cleric', 'ranger', 'mage', 'rogue'] as $n => $cls) {
                    $b = Reference::build($cls, 50, $quality);
                    $b['path'] = array_key_first(Rules::CLASSES[$cls]['paths']);
                    $party[] = Combatants::make($b, $n + 1, $cls);
                }
                $res = (new Simulator())->run($party, 50, 500 + $k, $d, Modes::mods($mode, $tier, $affixes));
                $out['clears'] += $res['report']['wiped'] ? 0 : 1;
                foreach ($res['timeline']['events'] as $e) {
                    if ($e[1] === 'mech') {
                        $out['mechs'][$e[6]['name']] = true;
                    }
                }
                $this->assertSame($affixes, $res['report']['affixes']);
            }

            return $out;
        };
        $this->assertSame(4, $clear('epic', 'heroic', 0, [])['clears'], 'epic gear clears heroic');
        $top = $clear('epic', 'mythic', 12, ['tyrannical', 'volcanic']);
        $this->assertSame(0, $top['clears'], 'tier 12 needs more than epic gear');
        $this->assertArrayHasKey('Volcanic', $top['mechs']);
        $this->assertArrayHasKey('Quaking', $clear('legendary', 'mythic', 4, ['fortified', 'quaking'])['mechs']);
    }
}

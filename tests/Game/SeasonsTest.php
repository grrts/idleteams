<?php

namespace App\Tests\Game;

use App\Game\Art;
use App\Game\Seasons;
use App\Service\Shop;
use PHPUnit\Framework\TestCase;

class SeasonsTest extends TestCase
{
    public function testSeasonsFollowEachOtherAndTheTrackCountsTiers(): void
    {
        $s = Seasons::get('s1');
        $this->assertSame($s, Seasons::current($s['startsAt']));
        $this->assertNull(Seasons::current($s['startsAt'] - 1));
        $this->assertSame(0, Seasons::tier($s, $s['track']['tierPoints'] - 1));
        $this->assertSame(count($s['track']['tiers']), Seasons::tier($s, PHP_INT_MAX >> 2));
        $this->assertCount(1, Seasons::rewards($s, 0, 2, false));
        $this->assertCount(3, Seasons::rewards($s, 0, 2, true));
        $this->assertSame(10 + 12 + 5 + 10, Seasons::points(['wiped' => false, 'bossesKilled' => 3], 'mythic', 5));
        $this->assertSame(4, Seasons::points(['wiped' => true, 'bossesKilled' => 1], 'mythic', 5));
        // each season starts the Monday the one before ends, so there is never a week without one
        $all = array_values(Seasons::all());
        for ($i = 1; $i < count($all); ++$i) {
            $this->assertSame($all[$i - 1]['endsAt'], $all[$i]['startsAt'], $all[$i]['id'].' starts when '.$all[$i - 1]['id'].' ends');
            $this->assertCount(20, $all[$i]['track']['tiers']);
        }
        $this->assertSame('frostbite', Seasons::current(Seasons::get('s2')['startsAt'])['affix']);
    }

    public function testEveryLookOnTheTrackAndInTheShopIsDrawableAndShopArtNeverDrops(): void
    {
        $bases = Art::bases();
        $looks = [];
        foreach (Seasons::all() as $s) {
            foreach ($s['track']['tiers'] as $t) {
                $looks = [...$looks, ...array_filter([$t['free'] ?? null, $t['premium'] ?? null])];
            }
        }
        foreach (Shop::offers() as $o) {
            $looks = [...$looks, ...$o['looks']];
        }
        foreach ($looks as $key) {
            [$slot, $base] = explode('|', $key);
            $this->assertArrayHasKey($base, $bases[$slot] ?? [], $key);
        }
        foreach (Art::parts('hat') as $id => $p) {
            if (!empty($p['shop'])) {
                $this->assertArrayNotHasKey($id, Art::dropBases()['head']);
            }
        }
    }
}

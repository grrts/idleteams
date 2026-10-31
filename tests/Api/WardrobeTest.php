<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Game\Items;
use App\Game\Rules;

/** Seed-based item colours, per-item dyes and the wardrobe. */
class WardrobeTest extends ApiTestCase
{
    public function testDropsLookDifferentAndCommonsWearYourColours(): void
    {
        $this->assertNull(Items::tint(['rarity' => 'common', 'seed' => 5]));
        $seen = [];
        foreach (range(1, 40) as $seed) {
            $seen[json_encode(Items::tint(['rarity' => 'epic', 'seed' => $seed]))] = true;
        }
        $this->assertCount(count(Rules::ITEM_PALETTES['epic']), $seen, 'every epic palette shows up');
        $this->assertSame(['#c0392b', '#f1c40f', '#e0b04a'], Items::tint(['rarity' => 'epic', 'seed' => 3, 'dye' => ['#c0392b', '#f1c40f', '#e0b04a']]));
    }

    public function testDyeAndWardrobe(): void
    {
        $this->as('dyer');
        $state = $this->api('GET', '/state');
        $this->assertNotEmpty($state['hero']['wardrobe'], 'the starter kit is in the wardrobe');
        $top = array_values(array_filter($state['inventory'], fn ($i) => $i['equipped'] === 'top'))[0];

        $dye = ['#c0392b', '#f1c40f', '#e0b04a'];
        $this->assertStringContainsString('materials', $this->api('POST', '/item/'.$top['id'].'/dye', ['dye' => $dye])['error']);
        $h = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Dyer']);
        $h->materials = 100;
        $this->em()->flush();
        $this->api('POST', '/item/'.$top['id'].'/dye', ['dye' => ['#123456', '#f1c40f', '#e0b04a']]);
        $this->assertSame(400, $this->httpStatus(), 'only colours from the dye table');
        $this->api('POST', '/item/'.$top['id'].'/dye', ['dye' => $dye]);

        $hero = $this->api('GET', '/state')['hero'];
        $this->assertSame(75, $hero['materials']);
        $this->assertSame($dye, $hero['look']['tint']['top']);
        $keys = array_column($hero['wardrobe']['top'], 'key');
        $this->assertCount(2, $keys, 'the plain and the dyed look are both kept');

        // Undo the dye, then show the dyed look from the wardrobe anyway.
        $this->api('POST', '/item/'.$top['id'].'/dye');
        $plain = $this->api('GET', '/state')['hero'];
        $this->assertArrayNotHasKey('top', (array) $plain['look']['tint']);
        $dyedKey = array_values(array_filter($keys, fn ($k) => str_contains($k, '#c0392b')))[0];
        $hero = $this->api('POST', '/outfit', ['slot' => 'top', 'look' => $dyedKey]);
        $this->assertSame($dye, $hero['look']['tint']['top']);
        $hero = $this->api('POST', '/outfit', ['slot' => 'head', 'look' => 'hidden']);
        $this->assertSame('none', $hero['look']['hat']);
        $this->api('POST', '/outfit', ['slot' => 'top', 'look' => 'hidden']);
        $this->assertSame(400, $this->httpStatus(), 'only head and back hide');
        $this->api('POST', '/outfit', ['slot' => 'shoes', 'look' => $dyedKey]);
        $this->assertSame(400, $this->httpStatus(), 'a look stays in its own slot');
    }
}

<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Game\LifeStory;

/** Alternate heroes: several per account, one played at a time, sharing the wardrobe and the Codex. */
class AltHeroTest extends ApiTestCase
{
    private function newHero(string $name): array
    {
        return $this->api('POST', '/hero', ['name' => $name, 'race' => 'elf', 'cls' => 'mage', 'origin' => 'oak', 'story' => LifeStory::example('elf', 'acolyte')]);
    }

    public function testASecondHeroSharesTheWardrobeAndCodexAndCatchesUp(): void
    {
        $this->as('alt');
        $first = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Alt']);
        $first->level = 40;
        $first->codex = ['someLegendary'];
        $first->wardrobe = ['chest:robe:1'];
        $this->em()->flush();

        $this->newHero('Altara');
        $this->assertSame(200, $this->httpStatus());
        $st = $this->api('GET', '/state');
        $this->assertSame('Altara', $st['hero']['name']);
        $this->assertCount(2, $st['heroes']);
        $this->assertSame(6, $st['maxHeroes']);
        $this->assertSame(2.0, (float) $st['catchUp']);

        $this->em()->clear();
        $second = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Altara']);
        $this->assertContains('someLegendary', $second->codex);
        $this->assertContains('chest:robe:1', $second->wardrobe);

        $this->api('POST', '/heroes/switch', ['hero' => $st['heroes'][0]['id']]);
        $this->assertSame(200, $this->httpStatus());
        $st = $this->api('GET', '/state');
        $this->assertSame('Alt', $st['hero']['name']);
        $this->assertSame(1.0, (float) $st['catchUp']);
    }

    public function testAnAccountHoldsSixHeroesAndSwitchesOnlyToItsOwn(): void
    {
        $this->as('other');
        $theirs = $this->api('GET', '/state')['heroes'][0]['id'];
        $this->as('many');
        foreach (['Bea', 'Cal', 'Dov', 'Eda', 'Fen'] as $n) {
            $this->newHero($n);
            $this->assertSame(200, $this->httpStatus(), $n);
        }
        $res = $this->newHero('Gus');
        $this->assertSame(400, $this->httpStatus());
        $this->assertStringContainsString('6 heroes', $res['error']);

        $this->api('POST', '/heroes/switch', ['hero' => $theirs]);
        $this->assertSame(400, $this->httpStatus());
    }
}

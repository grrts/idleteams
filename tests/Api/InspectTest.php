<?php

namespace App\Tests\Api;

use App\Entity\Hero;

/** Builds as conversation: inspect another hero, show items and heroes in chat. */
class InspectTest extends ApiTestCase
{
    public function testInspectShowsLockedChoicesAndCarvedPoints(): void
    {
        $this->as('shown');
        $h = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Shown']);
        $h->level = 22;
        $h->path = 'oakheart';
        $h->oathTaken = true;
        $h->spent = ['vitality' => 10];
        $h->carved = ['vitality' => 8];
        $this->em()->flush();
        $id = $h->id;

        $this->as('looker');
        $x = $this->api('GET', '/hero/'.$id);
        $this->assertSame('Oakheart', $x['classPath']);
        $this->assertTrue($x['oathTaken']);
        $this->assertSame(8, $x['carved']['vitality']);
        $this->assertNotEmpty($x['gear']);
        $this->assertArrayHasKey('maxHp', $x['stats']);
        $this->assertArrayNotHasKey('gold', $x, 'nothing private');
        $this->assertArrayNotHasKey('inventory', $x);
    }

    public function testCardsInChat(): void
    {
        $this->as('carder');
        $state = $this->api('GET', '/state');
        $weapon = array_values(array_filter($state['inventory'], fn ($i) => $i['equipped'] === 'weapon'))[0];
        $m = $this->api('POST', '/chat', ['channel' => 'tavern', 'item' => $weapon['id']]);
        $this->assertSame($weapon['base'], $m['card']['spec']['base']);
        $m = $this->api('POST', '/chat', ['channel' => 'tavern', 'hero' => true]);
        $this->assertSame('Carder', $m['card']['chip']['name']);

        $this->as('thief');
        $this->api('POST', '/chat', ['channel' => 'tavern', 'item' => $weapon['id']]);
        $this->assertSame(400, $this->httpStatus(), 'only your own items');
    }
}

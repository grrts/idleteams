<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Game\Rules;
use App\Service\Game;

/** Level 30: one skill becomes the hero's own, grows Mastery from every use and is named in the battle log. */
class SignatureTest extends ApiTestCase
{
    public function testChooseOnceThenItGrows(): void
    {
        $this->as('sig');
        $res = $this->api('POST', '/hero/act', ['action' => 'signature', 'skill' => 'shieldWall']);
        $this->assertStringContainsString('level 30', $res['error']);

        $h = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Sig']);
        $h->level = 30;
        $this->em()->flush();
        $hero = $this->api('GET', '/state')['hero'];
        $this->assertTrue($hero['signature']['open']);
        $skill = $hero['loadout'][0];

        $this->api('POST', '/hero/act', ['action' => 'signature', 'skill' => $skill, 'name' => 'x!']);
        $this->assertSame(400, $this->httpStatus(), 'names are letters');
        $hero = $this->api('POST', '/hero/act', ['action' => 'signature', 'skill' => $skill, 'name' => 'Unbroken Wall']);
        $this->assertSame('Unbroken Wall', $hero['signature']['name']);
        $this->assertSame(0, $hero['signature']['mastery']);
        $this->assertContains('signature', $hero['marks']);
        $this->api('POST', '/hero/act', ['action' => 'signature', 'skill' => $skill]);
        $this->assertStringContainsString('for good', $this->api('POST', '/hero/act', ['action' => 'signature', 'skill' => $skill])['error']);

        // In battle: the cast carries the hero's name and use grows Mastery.
        $this->em()->clear();
        $h = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Sig']);
        $c = static::getContainer()->get(Game::class)->combatant($h);
        $this->assertSame(['id' => $skill, 'name' => 'Unbroken Wall', 'mastery' => 0], $c['signature']);
        $this->assertSame(10, Rules::signatureMastery(Rules::signatureXpFor(10)));
        $this->assertSame(['swift' => 1, 'potent' => 2, 'echo' => 1], Rules::signatureTraits(45));
    }

    public function testTheSimulatorNamesAndCountsTheSignature(): void
    {
        $party = [];
        foreach (\App\Game\Reference::COMP as $n => $cls) {
            $b = \App\Game\Reference::build($cls, 30);
            $b['path'] = array_key_first(Rules::CLASSES[$cls]['paths']);
            $party[] = \App\Game\Combatants::make($b, $n + 1, ucfirst($cls));
        }
        $skill = $party[3]['loadout'][0];
        $party[3]['signature'] = ['id' => $skill, 'name' => 'Starfall', 'mastery' => 30];
        $run = (new \App\Game\Simulator())->run($party, 30, 3);
        $this->assertGreaterThan(0, $run['report']['heroes'][3]['sigXp']);
        $named = array_filter($run['timeline']['events'], fn ($e) => ($e[6]['name'] ?? '') === "Mage's Starfall");
        $this->assertNotEmpty($named, 'the log names it as the hero\'s own');
    }
}

<?php

namespace App\Tests\Api;

use App\Entity\Hero;
use App\Game\Legends;
use App\Game\Rules;
use App\Game\Stats;

/** Level 50: one of two Legend forms of the hero's Path, for good, with a title, a capstone and a stronger ultimate. */
class LegendTest extends ApiTestCase
{
    public function testEveryPathHasTwoForms(): void
    {
        foreach (Rules::CLASSES as $cls => $c) {
            foreach (array_keys($c['paths']) as $path) {
                $this->assertCount(2, Legends::forPath($path), $path);
                foreach (array_keys(Legends::forPath($path)) as $form) {
                    $e = Legends::effect($cls, $path, $form);
                    $this->assertArrayHasKey($c['ultimate'][0], $e['skill']);
                    $this->assertNotEmpty($e['stat']);
                }
            }
        }
    }

    public function testChooseOnceAndItCounts(): void
    {
        $this->as('leg');
        $this->assertStringContainsString('level 50', $this->api('POST', '/hero/act', ['action' => 'legend', 'form' => 'unbroken'])['error']);

        $h = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Leg']);
        $h->level = 50;
        $h->path = array_key_first(Rules::CLASSES[$h->cls]['paths']);
        $this->em()->flush();
        $hero = $this->api('GET', '/state')['hero'];
        $this->assertTrue($hero['legendForm']['open']);
        $this->assertCount(2, $hero['legendForm']['forms']);
        $form = $hero['legendForm']['forms'][1];
        $before = $hero['stats'];

        $this->api('POST', '/hero/act', ['action' => 'legend', 'form' => 'nope']);
        $this->assertSame(400, $this->httpStatus());
        $hero = $this->api('POST', '/hero/act', ['action' => 'legend', 'form' => $form['id']]);
        $this->assertFalse($hero['legendForm']['open']);
        $this->assertSame($form['title'], $hero['title']);
        $this->assertContains('legend', $hero['marks']);
        $this->assertNotEquals($before, $hero['stats'], 'the capstone changes the stats');
        $this->assertStringContainsString('for good', $this->api('POST', '/hero/act', ['action' => 'legend', 'form' => $form['id']])['error']);

        $tavern = $this->api('GET', '/chat?channel=tavern');
        $this->assertStringContainsString('has become a Legend', json_encode($tavern));
    }

    public function testTheUltimateGetsStronger(): void
    {
        $b = \App\Game\Reference::build('mage', 50);
        $b['path'] = 'arcanist';
        $plain = Stats::derive($b);
        $b['legend'] = 'starborn';
        $legend = Stats::derive($b);
        $this->assertEqualsWithDelta(0.45, $legend['skillMult']['meteor'] - ($plain['skillMult']['meteor'] ?? 0), 1e-9);
        $this->assertGreaterThan($plain['critMult'], $legend['critMult']);
    }
}

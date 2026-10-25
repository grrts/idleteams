<?php

namespace App\Tests\Api;

use App\Entity\Battle;
use App\Service\Game;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Component\Console\Tester\CommandTester;

/** A new player joins the demo group, plays a battle and rolls on the chest. */
class PlayTest extends WebTestCase
{
    private KernelBrowser $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $tool = new SchemaTool($em);
        $meta = $em->getMetadataFactory()->getAllMetadata();
        $tool->dropSchema($meta);
        $tool->createSchema($meta);
        $app = new Application(self::$kernel);
        (new CommandTester($app->find('app:demo:seed')))->execute([]);
    }

    private function api(string $method, string $path, array $body = []): array
    {
        $this->client->request($method, '/api'.$path, [], [], ['CONTENT_TYPE' => 'application/json'], $body ? json_encode($body) : null);

        return json_decode($this->client->getResponse()->getContent(), true) ?? [];
    }

    public function testNewPlayerJoinsTheDemoGroupAndPlaysABattle(): void
    {
        $this->assertTrue($this->api('POST', '/register', ['username' => 'tester', 'password' => 'secret123'])['ok']);
        $hero = $this->api('POST', '/hero', ['name' => 'Tess', 'race' => 'dwarf', 'cls' => 'warden', 'origin' => 'oak', 'look' => ['hair' => 'bob']]);
        $this->assertSame(1, $hero['level']);
        $this->assertArrayHasKey('error', $this->api('POST', '/hero', ['name' => 'Again', 'race' => 'elf', 'cls' => 'mage', 'origin' => 'oak']), 'one hero per account');

        $tavern = $this->api('GET', '/tavern');
        $lfm = array_values(array_filter($tavern['posts'], fn ($p) => $p['kind'] === 'lfm'))[0];
        $this->api('POST', '/party/apply', ['party' => $lfm['party']['id']]);
        $state = $this->api('GET', '/state');
        $this->assertCount(5, $state['party']['members'], 'demo leader accepts right away');
        $this->assertNotNull($state['battle'], 'a full group starts a battle');

        // Fast-forward: settle the battle as if its time had passed.
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $battle = $em->find(Battle::class, $state['battle']['id']);
        $game = static::getContainer()->get(Game::class);
        $game->progress($battle->party, $battle->endsAt + 1);
        $this->assertSame('chest', $battle->state);

        $after = $this->api('GET', '/state');
        $this->assertGreaterThan(0, $after['hero']['xp'] + ($after['hero']['level'] - 1));
        $this->assertGreaterThan(0, $after['hero']['gold']);
        $view = $this->api('GET', '/battle');
        foreach ($view['chests'][0]['chest'] as $entry) {
            $this->api('POST', '/battle/'.$battle->id.'/roll', ['idx' => $entry['idx'], 'choice' => 'need']);
        }
        $em->clear();
        $settled = $em->find(Battle::class, $battle->id);
        $this->assertSame('done', $settled->state, 'everyone has rolled, so the chest is handed out');
    }

    public function testAWipeStopsTheChainUntilSomeoneSendsTheGroupBackIn(): void
    {
        $this->api('POST', '/register', ['username' => 'tester', 'password' => 'secret123']);
        $this->api('POST', '/hero', ['name' => 'Tess', 'race' => 'dwarf', 'cls' => 'warden', 'origin' => 'oak']);
        $lfm = array_values(array_filter($this->api('GET', '/tavern')['posts'], fn ($p) => $p['kind'] === 'lfm'))[0];
        $this->api('POST', '/party/apply', ['party' => $lfm['party']['id']]);
        $state = $this->api('GET', '/state');

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $game = static::getContainer()->get(Game::class);
        $battle = $em->find(Battle::class, $state['battle']['id']);
        $party = $battle->party;
        $party->dungeonOffset = 40; // far beyond what level 1 heroes can survive
        $game->progress($party, $battle->endsAt + 1);
        $next = $em->getRepository(Battle::class)->findOneBy(['party' => $party, 'state' => 'running']);
        $this->assertNotNull($next, 'the first run chains into the next one');
        $game->progress($party, $next->endsAt + 1);

        $this->assertTrue($next->report['wiped']);
        $this->assertFalse($party->running, 'a wipe stops the chain');
        $this->assertNull($em->getRepository(Battle::class)->findOneBy(['party' => $party, 'state' => 'running']));

        $this->api('POST', '/party/resume');
        $em->clear();
        $this->assertNotNull($this->api('GET', '/state')['battle'], 'any member can send the group back in');
    }

    public function testPointsAndGear(): void
    {
        $this->api('POST', '/register', ['username' => 'tester2', 'password' => 'secret123']);
        $this->api('POST', '/hero', ['name' => 'Gearhead', 'race' => 'human', 'cls' => 'ranger', 'origin' => 'hawk']);
        $this->assertArrayHasKey('error', $this->api('POST', '/hero/act', ['action' => 'spend', 'points' => ['might' => 1]]), 'no points at level 1');
        $state = $this->api('GET', '/state');
        $bow = array_values(array_filter($state['inventory'], fn ($i) => $i['slot'] === 'weapon'))[0];
        $this->assertSame('weapon', $bow['equipped']);
        $this->api('POST', '/item/'.$bow['id'].'/unequip');
        $this->api('POST', '/item/'.$bow['id'].'/sell', ['price' => 5]);
        $market = $this->api('GET', '/market');
        $this->assertContains($bow['id'], array_column($market, 'id'));
    }

    public function testTalentsHeritageAndRenownFromKin(): void
    {
        $this->api('POST', '/register', ['username' => 'tester3', 'password' => 'secret123']);
        $this->api('POST', '/hero', ['name' => 'Durna', 'race' => 'dwarf', 'cls' => 'rogue', 'origin' => 'fox']);
        $this->assertArrayHasKey('error', $this->api('POST', '/hero/act', ['action' => 'talent', 'node' => 'root']), 'no talent points at level 1');

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $hero = $em->getRepository(\App\Entity\Hero::class)->findOneBy(['name' => 'Durna']);
        $hero->level = 9;
        $em->flush();
        $this->assertArrayHasKey('error', $this->api('POST', '/hero/act', ['action' => 'talent', 'node' => 'tempo1']), 'branches grow from the root');
        foreach (['root', 'tempo1', 'tempo1', 'tempo1', 'tempo2', 'tempo2', 'tempo3'] as $node) {
            $sheet = $this->api('POST', '/hero/act', ['action' => 'talent', 'node' => $node]);
            $this->assertArrayNotHasKey('error', $sheet, $node);
        }
        $rush = array_values(array_filter($sheet['skills'], fn ($s) => $s['id'] === 'adrenalineRush'))[0];
        $this->assertTrue($rush['unlocked'], 'the notable teaches Adrenaline Rush');
        $this->assertSame(1, $sheet['talentPoints']['free']);

        // Heritage: the root is free at rank 1, then a culture opens its branch.
        $this->assertArrayHasKey('error', $this->api('POST', '/hero/act', ['action' => 'culture', 'culture' => 'ironhold']));
        $this->api('POST', '/hero/act', ['action' => 'heritage', 'node' => 'root']);
        $this->assertArrayHasKey('error', $this->api('POST', '/hero/act', ['action' => 'heritage', 'node' => 'ironhold1']), 'follow the culture first');
        $sheet = $this->api('POST', '/hero/act', ['action' => 'culture', 'culture' => 'ironhold']);
        $this->assertSame('ironhold', $sheet['culture']);

        // Brannoc in the demo group is a dwarf: running with him pays Renown.
        $lfm = array_values(array_filter($this->api('GET', '/tavern')['posts'], fn ($p) => $p['kind'] === 'lfm'))[0];
        $this->api('POST', '/party/apply', ['party' => $lfm['party']['id']]);
        $state = $this->api('GET', '/state');
        $this->assertSame(1, $state['hero']['renown']['kin']);
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $battle = $em->find(Battle::class, $state['battle']['id']);
        static::getContainer()->get(Game::class)->progress($battle->party, $battle->endsAt + 1);
        $after = $this->api('GET', '/state')['hero'];
        $this->assertGreaterThan(0, $after['renown']['total']);
        $row = array_values(array_filter($battle->report['heroes'], fn ($r) => $r['name'] === 'Durna'))[0];
        $this->assertSame(1, $row['kin']);
    }
}

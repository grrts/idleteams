<?php

namespace App\Tests\Api;

use App\Entity\Battle;
use App\Game\LifeStory;
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
        $lore = $this->api('GET', '/lore');
        $this->assertSame('Valdren', $lore['entries']['world:valdren']['title'], 'the lore book is readable before logging in');
        $this->assertTrue($this->api('POST', '/register', ['username' => 'tester', 'password' => 'secret123'])['ok']);
        $hero = $this->api('POST', '/hero', ['name' => 'Tess', 'race' => 'dwarf', 'cls' => 'warden', 'origin' => 'oak', 'story' => LifeStory::example('dwarf', 'cook'), 'look' => ['hair' => 'bob']]);
        $this->assertSame(1, $hero['level']);
        $this->assertArrayHasKey('error', $this->api('POST', '/hero', ['name' => 'Again', 'race' => 'elf', 'cls' => 'mage', 'origin' => 'oak', 'story' => LifeStory::example('elf', 'acolyte')]), 'one hero per account');

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
        $this->api('POST', '/hero', ['name' => 'Tess', 'race' => 'dwarf', 'cls' => 'warden', 'origin' => 'oak', 'story' => LifeStory::example('dwarf', 'cook')]);
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
        $this->api('POST', '/hero', ['name' => 'Gearhead', 'race' => 'human', 'cls' => 'ranger', 'origin' => 'hawk', 'story' => LifeStory::example('human', 'scout')]);
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
        $this->assertArrayHasKey('error', $this->api('POST', '/hero', ['name' => 'Durna', 'race' => 'dwarf', 'cls' => 'rogue', 'origin' => 'fox']), 'a life story is required');
        $this->assertArrayHasKey('error', $this->api('POST', '/hero', ['name' => 'Durna', 'race' => 'dwarf', 'cls' => 'rogue', 'origin' => 'fox', 'story' => ['answers' => ['youth' => 'squire'] + LifeStory::example('dwarf', 'delver')['answers']]]), 'backstories belong to a race');
        $this->api('POST', '/hero', ['name' => 'Durna', 'race' => 'dwarf', 'cls' => 'rogue', 'origin' => 'fox', 'story' => LifeStory::example('dwarf', 'delver')]);
        $this->assertArrayHasKey('error', $this->api('POST', '/hero/act', ['action' => 'talent', 'node' => 'root']), 'no talent points at level 1');

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $hero = $em->getRepository(\App\Entity\Hero::class)->findOneBy(['name' => 'Durna']);
        $hero->level = 9;
        $em->flush();
        $this->assertArrayHasKey('error', $this->api('POST', '/hero/act', ['action' => 'talent', 'node' => 'tempo.3.2']), 'nodes grow from what you have');
        $this->assertArrayHasKey('error', $this->api('POST', '/hero/act', ['action' => 'talent', 'nodes' => ['root', ...array_map(fn ($d) => 'tempo.3.'.$d, range(1, 16))]]), 'level 9 has 16 points, not 17');
        $sheet = $this->api('POST', '/hero/act', ['action' => 'talent', 'nodes' => ['root', ...array_map(fn ($d) => 'tempo.3.'.$d, range(1, 15))]]);
        $this->assertArrayNotHasKey('error', $sheet);
        $rush = array_values(array_filter($sheet['skills'], fn ($s) => $s['id'] === 'adrenalineRush'))[0];
        $this->assertTrue($rush['unlocked'], 'halfway along the spine, the branch teaches Adrenaline Rush');
        $this->assertSame(0, $sheet['talentPoints']['free']);
        $tree = $this->api('GET', '/tree/talent/rogue');
        $this->assertGreaterThan(1500, count($tree['nodes']));

        // Heritage: the backstory chose the culture and the first steps along its branch, with Renown for rank 3.
        $this->assertSame('runedeep', $sheet['culture']);
        $this->assertSame('delver', $sheet['backstory']);
        $this->assertSame(3, $sheet['renown']['rank']);
        $this->assertSame(0, $sheet['renown']['free']);
        $this->assertEqualsCanonicalizing(['root', 'runedeep1.2.1', 'runedeep1.2.2', 'runedeep1.2.3', 'runedeep1.2.4'], array_keys((array) $sheet['heritage']));
        $this->assertArrayHasKey('error', $this->api('POST', '/hero/act', ['action' => 'heritage', 'node' => 'ironhold0.2.1']), 'only your own culture');
        $this->assertArrayHasKey('error', $this->api('POST', '/hero/act', ['action' => 'story', 'story' => LifeStory::example('dwarf', 'smith')]), 'a story is written once');
        $this->assertCount(7, $sheet['biography'], 'a prologue, five chapters and an epilogue');
        $this->assertStringContainsString('Durna', $sheet['biography'][0][1]);

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

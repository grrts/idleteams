<?php

namespace App\Tests\Api;

use App\Entity\Battle;
use App\Entity\Hero;
use App\Game\LifeStory;
use App\Game\Rules;
use App\Service\Game;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;
use Symfony\Component\Console\Tester\CommandTester;

/** Day one without hirelings: new heroes are marked, mentors are paid, scarce roles roll twice. */
class NewcomerTest extends WebTestCase
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
        (new CommandTester((new Application(self::$kernel))->find('app:demo:seed')))->execute([]);
    }

    private function api(string $method, string $path, array $body = []): array
    {
        $this->client->request($method, '/api'.$path, [], [], ['CONTENT_TYPE' => 'application/json'], $body ? json_encode($body) : null);

        return json_decode($this->client->getResponse()->getContent(), true) ?? [];
    }

    public function testNewHeroesMentorsAndScarceRoles(): void
    {
        $this->api('POST', '/register', ['username' => 'fresh', 'password' => 'secret123']);
        $hero = $this->api('POST', '/hero', ['name' => 'Fresh', 'race' => 'dwarf', 'cls' => 'warden', 'origin' => 'oak', 'story' => LifeStory::example('dwarf', 'cook')]);
        $this->assertTrue($hero['newcomer']);

        $tavern = $this->api('GET', '/tavern');
        $lfm = array_values(array_filter($tavern['posts'], fn ($p) => $p['kind'] === 'lfm'))[0];
        $this->assertFalse($lfm['author']['newcomer'], 'demo heroes are never new');
        $tier = $tavern['myTier'];
        $scarce = $tavern['scarcity'][$tier]['role'] ?? null;

        $em = static::getContainer()->get(EntityManagerInterface::class);
        // A veteran in the demo group earns the mentor bonus.
        $vet = $em->getRepository(Hero::class)->findOneBy(['name' => 'Brannoc']);
        $vet->level = 25;
        $em->flush();

        $this->api('POST', '/party/apply', ['party' => $lfm['party']['id']]);
        $state = $this->api('GET', '/state');
        $this->assertSame($scarce === 'tank' ? Rules::SCARCE_ROLLS : 0, $state['hero']['bonusRolls'], 'joining in the scarce role rolls twice');

        $em = static::getContainer()->get(EntityManagerInterface::class);
        $battle = $em->find(Battle::class, $state['battle']['id']);
        static::getContainer()->get(Game::class)->progress($battle->party, $battle->endsAt + 1);
        $rows = array_column($battle->report['heroes'], null, 'name');
        $this->assertTrue($rows['Brannoc']['mentor'] ?? false, 'the veteran mentored');
        $this->assertArrayNotHasKey('mentor', $rows['Fresh']);
        $this->assertSame(1, $em->getRepository(Hero::class)->findOneBy(['name' => 'Brannoc'])->career['mentored']);
    }

    public function testScarcityComesFromTheBoard(): void
    {
        $this->api('POST', '/register', ['username' => 'lead', 'password' => 'secret123']);
        $this->api('POST', '/hero', ['name' => 'Leadra', 'race' => 'elf', 'cls' => 'mage', 'origin' => 'oak', 'story' => LifeStory::example('elf', 'acolyte')]);
        $this->api('POST', '/party/create', ['name' => 'Seekers']);
        $this->api('POST', '/tavern', ['kind' => 'lfm', 'text' => 'need a healer', 'roles' => ['healer']]);
        $tavern = $this->api('GET', '/tavern');
        $this->assertSame('healer', $tavern['scarcity']['ember-hollow']['role']);
        $party = array_values(array_filter($tavern['posts'], fn ($p) => $p['kind'] === 'lfm' && $p['party']['name'] === 'Seekers'))[0]['party']['id'];

        $this->api('POST', '/logout');
        $this->api('POST', '/register', ['username' => 'medic', 'password' => 'secret123']);
        $this->api('POST', '/hero', ['name' => 'Medica', 'race' => 'human', 'cls' => 'cleric', 'origin' => 'oak', 'story' => LifeStory::example('human', 'scout')]);
        $this->api('POST', '/party/apply', ['party' => $party]);
        $req = $this->api('GET', '/state')['invites'][0]['id'];

        $this->api('POST', '/logout');
        $this->api('POST', '/login', ['username' => 'lead', 'password' => 'secret123']);
        $this->api('POST', '/request/'.$req.'/accept');

        $this->api('POST', '/logout');
        $this->api('POST', '/login', ['username' => 'medic', 'password' => 'secret123']);
        $this->assertSame(Rules::SCARCE_ROLLS, $this->api('GET', '/state')['hero']['bonusRolls'], 'joined as the scarce healer');
    }
}

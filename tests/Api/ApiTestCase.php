<?php

namespace App\Tests\Api;

use App\Game\LifeStory;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Bundle\FrameworkBundle\KernelBrowser;
use Symfony\Bundle\FrameworkBundle\Test\WebTestCase;

/** A fresh schema per test and a JSON helper; switch players with as(). */
abstract class ApiTestCase extends WebTestCase
{
    protected KernelBrowser $client;

    protected function setUp(): void
    {
        $this->client = static::createClient();
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $tool = new SchemaTool($em);
        $meta = $em->getMetadataFactory()->getAllMetadata();
        $tool->dropSchema($meta);
        $tool->createSchema($meta);
        // Rate limits are counted in a cache that outlives a test; every test starts with fresh counters.
        static::getContainer()->get('cache.rate_limiter')->clear();
    }

    protected function api(string $method, string $path, array $body = []): array
    {
        $this->client->request($method, '/api'.$path, [], [], ['CONTENT_TYPE' => 'application/json'], $body ? json_encode($body) : null);

        return json_decode($this->client->getResponse()->getContent(), true) ?? [];
    }

    protected function httpStatus(): int
    {
        return $this->client->getResponse()->getStatusCode();
    }

    /** Registers (first time) or logs in as $name, with a dwarf warden hero of the same name. */
    protected function as(string $name): void
    {
        $this->api('POST', '/logout');
        $this->client->getCookieJar()->clear();
        $res = $this->api('POST', '/login', ['username' => $name, 'password' => 'secret123']);
        if (!isset($res['ok'])) {
            $this->api('POST', '/register', ['username' => $name, 'password' => 'secret123']);
            $this->api('POST', '/hero', ['name' => ucfirst($name), 'race' => 'dwarf', 'cls' => 'warden', 'origin' => 'oak', 'story' => LifeStory::example('dwarf', 'cook')]);
        }
    }

    protected function em(): EntityManagerInterface
    {
        return static::getContainer()->get(EntityManagerInterface::class);
    }
}

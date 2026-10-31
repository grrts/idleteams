<?php

namespace App\Controller;

use Doctrine\DBAL\Connection;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/**
 * For an uptime monitor: 200 when the database answers and the cron tick ran in the last five minutes, 503 if not.
 * Says nothing about players.
 */
class HealthController
{
    public const TICK_KEY = 'health_last_tick';

    #[Route('/api/health', methods: ['GET'])]
    public function health(Connection $db, #[Autowire(service: 'cache.app')] CacheItemPoolInterface $cache): JsonResponse
    {
        $ok = true;
        try {
            $db->executeQuery('SELECT 1')->fetchOne();
            $database = 'ok';
        } catch (\Throwable) {
            $database = 'down';
            $ok = false;
        }
        $item = $cache->getItem(self::TICK_KEY);
        $tickAge = $item->isHit() ? time() - (int) $item->get() : null;
        if ($tickAge === null || $tickAge > 300) {
            $ok = false;
        }

        return new JsonResponse(['ok' => $ok, 'database' => $database, 'tickAgeSeconds' => $tickAge], $ok ? 200 : 503);
    }
}

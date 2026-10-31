<?php

namespace App\Tests\Api;

use App\Service\ErrorReporter;
use Psr\Log\NullLogger;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Component\Cache\Adapter\ArrayAdapter;
use Symfony\Component\Console\Tester\CommandTester;
use Symfony\Component\HttpClient\MockHttpClient;
use Symfony\Component\HttpClient\Response\MockResponse;

/** Health check, backups and error reports. */
class OpsTest extends ApiTestCase
{
    public function testHealthNeedsARecentTick(): void
    {
        static::getContainer()->get('cache.app')->clear();
        $this->api('GET', '/health');
        $this->assertSame(503, $this->httpStatus(), 'no tick yet');
        (new CommandTester((new Application(self::$kernel))->find('app:tick')))->execute([]);
        $res = $this->api('GET', '/health');
        $this->assertSame(200, $this->httpStatus());
        $this->assertSame('ok', $res['database']);
    }

    public function testBackupWritesACopyAndClearsOldOnes(): void
    {
        $dir = sys_get_temp_dir().'/it-backup-'.getmypid();
        @mkdir($dir);
        touch($dir.'/idleteams-old.sqlite.gz', time() - 30 * 86400);
        $tester = new CommandTester((new Application(self::$kernel))->find('app:backup'));
        $this->assertSame(0, $tester->execute(['--dir' => $dir, '--keep' => '14']));
        $this->assertStringContainsString('Removed 1 old backup', $tester->getDisplay());
        $files = glob($dir.'/idleteams-*');
        $this->assertCount(1, $files);
        $this->assertGreaterThan(100, filesize($files[0]));
        array_map('unlink', $files);
        rmdir($dir);
    }

    public function testTheSameErrorIsPostedOnceInAWhile(): void
    {
        $posts = [];
        $http = new MockHttpClient(function ($method, $url, $options) use (&$posts) {
            $posts[] = json_decode($options['body'], true)['text'];

            return new MockResponse('ok');
        });
        $r = new ErrorReporter(new NullLogger(), $http, new ArrayAdapter(), 'https://hooks.example/x', 'https://idleteams.test', '600');
        $boom = fn () => new \RuntimeException('boom');
        $this->assertTrue($r->report($e = $boom(), 'GET /api/state'));
        $this->assertFalse($r->report($e, 'GET /api/state'), 'same place, same error: quiet');
        $this->assertTrue($r->report(new \LogicException('other'), 'app:tick'), 'a different error is posted');
        $this->assertCount(2, $posts);
        $this->assertStringContainsString('RuntimeException: boom', $posts[0]);

        $off = new ErrorReporter(new NullLogger(), $http, new ArrayAdapter(), null, null);
        $this->assertFalse($off->report($boom(), 'x'), 'no webhook, only the log');
    }
}

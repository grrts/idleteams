<?php

namespace App\Tests;

use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;
use Symfony\Component\Console\Tester\CommandTester;

/** app:launch-check lists what is missing and fails until it is there; the test environment has no keys. */
class LaunchCheckTest extends KernelTestCase
{
    public function testItNamesWhatIsMissing(): void
    {
        $t = new CommandTester((new Application(static::bootKernel()))->find('app:launch-check'));
        $this->assertSame(1, $t->execute([]));
        $out = $t->getDisplay();
        foreach (['LEGAL_OPERATOR', 'FCM_SERVICE_ACCOUNT', 'desktop/steam.json', 'it_supporter_monthly', 'it_track_s1'] as $s) {
            $this->assertStringContainsString($s, $out);
        }
    }
}

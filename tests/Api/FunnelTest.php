<?php

namespace App\Tests\Api;

use App\Entity\User;
use App\Game\Funnel;

/** The first-day funnel: steps land on the account, and moderators see only totals. */
class FunnelTest extends ApiTestCase
{
    public function testStepsAreMarkedOnceAndCountedByCohort(): void
    {
        $this->as('newbie');
        $this->api('POST', '/prologue/done');
        $this->api('POST', '/party/create', ['name' => 'First Steps']);
        $this->em()->clear();
        $u = $this->em()->getRepository(User::class)->findOneBy(['username' => 'newbie']);
        foreach (['registered', 'hero', 'prologue', 'group'] as $step) {
            $this->assertArrayHasKey($step, $u->funnel, $step);
        }
        $first = $u->funnel['registered'];
        Funnel::mark($u, 'registered', $first + 999);
        $this->assertSame($first, $u->funnel['registered']);
        Funnel::seen($u, $u->createdAt + 90000);
        $this->assertArrayHasKey('returned', $u->funnel);

        $this->api('GET', '/admin/funnel');
        $this->assertSame(403, $this->httpStatus());
        $this->as('mod');
        $mod = $this->em()->getRepository(User::class)->findOneBy(['username' => 'mod']);
        $mod->admin = true;
        $this->em()->flush();
        $this->as('mod');
        $res = $this->api('GET', '/admin/funnel');
        $this->assertSame(200, $this->httpStatus(), json_encode($res));
        $this->assertSame(2, $res['cohorts'][0]['users']);
        $this->assertSame(1, $res['cohorts'][0]['steps']['prologue']['all']);
        $this->assertSame(2, $res['cohorts'][0]['steps']['hero']['day1']);
        $this->assertStringNotContainsString('newbie', json_encode($res));
    }
}

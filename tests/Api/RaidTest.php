<?php

namespace App\Tests\Api;

use App\Entity\Guild;
use App\Entity\Hero;
use App\Entity\Raid;

/** The raid planner: plan, sign up, fill squads, start; one raid per guild per week. */
class RaidTest extends ApiTestCase
{
    public function testPlanSignUpFillAndFight(): void
    {
        $names = ['lead', 'tanka', 'heala', 'dpsa', 'dpsb', 'tankb', 'healb', 'dpsc', 'dpsd', 'dpse'];
        foreach ($names as $n) {
            $this->as($n);
        }
        $this->as('lead');
        $lead = $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Lead']);
        $lead->gold = '500';
        $this->em()->flush();
        $this->api('POST', '/guild/create', ['name' => 'Keep Takers', 'tag' => 'KT']);
        $gid = $this->em()->getRepository(Guild::class)->findOneBy(['name' => 'Keep Takers'])->id;
        foreach (array_slice($names, 1) as $n) {
            $this->as($n);
            $this->api('POST', '/guild/'.$gid.'/join');
        }
        $this->as('dpsa');
        $res = $this->api('POST', '/raid/plan', ['raid' => 'sundered-keep']);
        $this->assertStringContainsString('officers', $res['error']);

        $this->as('lead');
        $this->api('POST', '/raid/plan', ['raid' => 'sundered-keep', 'startsAt' => time() + 3600]);
        $raid = $this->api('GET', '/guilds')['mine']['hall']['raid'];
        $this->assertSame('planning', $raid['state']);
        $res = $this->api('POST', '/raid/plan', ['raid' => 'sundered-keep']);
        $this->assertStringContainsString('this week', $res['error'], 'one raid a week');

        $res = $this->api('POST', '/raid/'.$raid['id'].'/signup');
        $this->assertStringContainsString('level 50', $res['error']);
        $this->em()->clear();
        foreach ($this->em()->getRepository(Hero::class)->findAll() as $h) {
            $h->level = 50;
        }
        $this->em()->flush();
        foreach ($names as $n) {
            $this->as($n);
            $this->api('POST', '/raid/'.$raid['id'].'/signup');
            $this->assertSame(200, $this->httpStatus());
        }
        $this->as('lead');
        $this->api('POST', '/raid/'.$raid['id'].'/fill');
        $raid = $this->api('GET', '/guilds')['mine']['hall']['raid'];
        $this->assertCount(10, $raid['signups']);
        $this->assertCount(2, $raid['squads']);
        $this->assertSame([0, 1], $raid['fronts']);
        $this->assertCount(10, array_merge(...$raid['squads']));

        $res = $this->api('POST', '/raid/'.$raid['id'].'/arrange', ['squads' => [[$raid['squads'][0][0], $raid['squads'][0][0]]], 'fronts' => [0]]);
        $this->assertStringContainsString('one squad', $res['error']);
        $this->api('POST', '/raid/'.$raid['id'].'/arrange', ['squads' => $raid['squads'], 'fronts' => [2, 3]]);
        $this->assertSame([2, 3], $this->api('GET', '/guilds')['mine']['hall']['raid']['fronts']);

        $this->api('POST', '/raid/'.$raid['id'].'/start');
        $this->assertSame(200, $this->httpStatus());
        $raid = $this->api('GET', '/guilds')['mine']['hall']['raid'];
        $this->assertSame('done', $raid['state']);
        $report = $raid['report'];
        $this->assertCount(4, $report['fronts']);
        $this->assertSame([], $report['fronts'][0]['squads'], 'no squad went to the first front');
        $this->assertCount(1, $report['fronts'][2]['squads']);
        $this->assertNull($report['final'], 'two fronts cannot open the throne');
        $this->assertFalse($report['won']);
        $this->assertCount(10, $report['rewards']);
        $this->assertGreaterThan(0, $report['rewards'][0]['gold']);
        $res = $this->api('POST', '/raid/'.$raid['id'].'/start');
        $this->assertStringContainsString('fought', $res['error']);
        $this->em()->clear();
        $this->assertSame(1, $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Lead'])->career['raids']);
        $this->assertSame(1, $this->em()->getRepository(Raid::class)->count([]));
    }
}

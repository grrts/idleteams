<?php

namespace App\Tests\Api;

use App\Entity\ChatMessage;
use App\Entity\Guild;
use App\Entity\Hero;
use App\Entity\Item;
use App\Entity\Party;
use App\Entity\User;

/** A player can take their data with them and delete their account for good. */
class AccountDataTest extends ApiTestCase
{
    public function testExportHoldsTheAccountAndNotThePassword(): void
    {
        $this->as('keeper');
        $this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'Hello, Valdren']);
        $this->client->request('GET', '/api/account/export');
        $this->assertSame(200, $this->httpStatus());
        $this->assertStringContainsString('attachment', $this->client->getResponse()->headers->get('Content-Disposition'));
        $data = json_decode($this->client->getResponse()->getContent(), true);
        $this->assertSame('keeper', $data['account']['username']);
        $this->assertArrayNotHasKey('password', $data['account']);
        $this->assertSame('Keeper', $data['heroes'][0]['name']);
        $this->assertNotEmpty($data['heroes'][0]['items']);
        $this->assertSame('Hello, Valdren', $data['heroes'][0]['chat'][0]['body']);
    }

    public function testDeletingAnAccountLeavesGroupAndGuildAndRemovesWhatItWrote(): void
    {
        $this->as('stayer');
        $this->as('leaver');
        $this->em()->getRepository(Hero::class)->findOneBy(['name' => 'Leaver'])->gold = '1000';
        $this->em()->flush();
        $this->api('POST', '/guild/create', ['name' => 'Short Lived', 'tag' => 'SL']);
        $this->api('POST', '/party/create', ['name' => 'Leavers']);
        $this->api('POST', '/chat', ['channel' => 'tavern', 'body' => 'Goodbye']);
        $gid = $this->em()->getRepository(Guild::class)->findOneBy(['tag' => 'SL'])->id;
        $pid = $this->em()->getRepository(Party::class)->findOneBy(['name' => 'Leavers'])->id;
        $this->as('stayer');
        $res = $this->api('POST', '/guild/'.$gid.'/join');
        $this->assertSame(200, $this->httpStatus(), json_encode($res));
        $em = $this->em();
        $stayer = $em->getRepository(Hero::class)->findOneBy(['name' => 'Stayer']);
        $party = $em->find(Party::class, $pid);
        $stayer->party = $party;
        $party->members->add($stayer);
        $em->flush();

        $this->as('leaver');
        $res = $this->api('POST', '/account/delete', ['password' => 'wrong-one']);
        $this->assertSame(400, $this->httpStatus());
        $res = $this->api('POST', '/account/delete', ['password' => 'secret123']);
        $this->assertSame(200, $this->httpStatus(), json_encode($res));

        $em = $this->em();
        $em->clear();
        $this->assertNull($em->getRepository(User::class)->findOneBy(['username' => 'leaver']));
        $this->assertNull($em->getRepository(Hero::class)->findOneBy(['name' => 'Leaver']));
        $this->assertSame([], $em->getRepository(ChatMessage::class)->findBy(['body' => 'Goodbye']));
        $stayer = $em->getRepository(Hero::class)->findOneBy(['name' => 'Stayer']);
        $this->assertSame('leader', $stayer->guildRank);
        $this->assertSame($stayer->id, $em->find(Party::class, $pid)->leader->id);
        $this->assertSame(0, $em->getRepository(Item::class)->count(['owner' => null, 'bank' => null]));

        $this->assertSame('', $this->api('GET', '/state')['user']['username'] ?? '');
        $res = $this->api('POST', '/login', ['username' => 'leaver', 'password' => 'secret123']);
        $this->assertArrayNotHasKey('ok', $res);
    }

    public function testTheTermsAndPrivacyPolicyAreServed(): void
    {
        foreach (['/terms' => 'Terms of use', '/privacy' => 'Privacy policy'] as $path => $title) {
            $this->client->request('GET', $path);
            $this->assertSame(200, $this->httpStatus());
            $this->assertStringContainsString($title, $this->client->getResponse()->getContent());
        }
    }
}

<?php

namespace App\Service;

use App\Entity\ChatMessage;
use App\Entity\ChatReport;
use App\Entity\Hero;
use App\Entity\Item;
use App\Entity\Notice;
use App\Entity\PartyRequest;
use App\Entity\PushSubscription;
use App\Entity\Raid;
use App\Entity\TavernPost;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/**
 * The player's own data: a full export (GDPR article 20) and deleting the account for good (article 17).
 *
 * Deleting leaves groups and guilds the way leaving does (the lead passes on, a guild's bank goes to the last member),
 * takes the heroes off raid sign-ups and removes everything the account wrote: chat lines, tavern posts, requests,
 * reports, notices and push subscriptions. Battle reports of groups the heroes ran with keep their names, as the other
 * players' history; the privacy policy says so.
 */
class AccountClosure
{
    public function __construct(private EntityManagerInterface $em, private Social $social)
    {
    }

    /** Everything stored about the account, as plain data. */
    public function export(User $u): array
    {
        $heroes = (new Roster($this->em))->heroes($u);
        $q = fn (string $class, array $by) => array_map(fn ($e) => $this->plain($e), $this->em->getRepository($class)->findBy($by, ['id' => 'ASC']));

        return [
            'exportedAt' => gmdate('c'),
            'account' => array_diff_key($this->plain($u), array_flip(['password', 'tokenHash', 'tokenKind', 'tokenExpiresAt'])),
            'heroes' => array_map(fn (Hero $h) => $this->plain($h) + [
                'items' => $q(Item::class, ['owner' => $h]),
                'chat' => $q(ChatMessage::class, ['author' => $h]),
                'tavernPosts' => $q(TavernPost::class, ['author' => $h]),
                'requests' => $q(PartyRequest::class, ['hero' => $h]),
            ], $heroes),
            'reportsMade' => $q(ChatReport::class, ['reporter' => $u]),
            'purchases' => $q(\App\Entity\Purchase::class, ['user' => $u]),
            'notices' => $q(Notice::class, ['user' => $u]),
            'pushSubscriptions' => array_map(fn (PushSubscription $s) => ['endpoint' => parse_url($s->endpoint, PHP_URL_HOST), 'createdAt' => $s->createdAt], $this->em->getRepository(PushSubscription::class)->findBy(['user' => $u])),
        ];
    }

    public function delete(User $u): void
    {
        $heroes = (new Roster($this->em))->heroes($u);
        foreach ($heroes as $h) {
            if ($h->party) {
                $this->social->leave($h);
            }
            if ($h->guild) {
                $g = $h->guild;
                foreach ($this->em->getRepository(Raid::class)->findBy(['guild' => $g, 'state' => 'planning']) as $r) {
                    $s = $r->signups;
                    unset($s[(string) $h->id]);
                    $r->signups = $s;
                    $r->squads = array_map(fn ($sq) => array_values(array_diff($sq, [$h->id])), $r->squads);
                }
                $this->social->leaveGuild($h);
            }
        }
        $this->em->flush();
        foreach ($heroes as $h) {
            $this->gone(ChatReport::class, 'message', $this->em->getRepository(ChatMessage::class)->findBy(['author' => $h]));
            foreach ([[ChatMessage::class, 'author'], [TavernPost::class, 'author'], [PartyRequest::class, 'hero'], [Item::class, 'owner']] as [$class, $field]) {
                $this->gone($class, $field, [$h]);
            }
            foreach ($this->em->getRepository(\App\Entity\Party::class)->findBy(['leader' => $h]) as $p) {
                $p->leader = null;
            }
            $this->em->remove($h);
        }
        foreach ([[ChatReport::class, 'reporter'], [ChatReport::class, 'target'], [Notice::class, 'user'], [PushSubscription::class, 'user']] as [$class, $field]) {
            $this->gone($class, $field, [$u]);
        }
        // Purchases stay for the tax records, without the account.
        $this->em->createQueryBuilder()->update(\App\Entity\Purchase::class, 'p')->set('p.user', 'NULL')->where('p.user = :u')->setParameter('u', $u)->getQuery()->execute();
        $this->em->remove($u);
        $this->em->flush();
    }

    /** Removes every $class row whose $field is one of $values. */
    private function gone(string $class, string $field, array $values): void
    {
        if (!$values) {
            return;
        }
        $this->em->createQueryBuilder()->delete($class, 'x')->where("x.$field IN (:v)")->setParameter('v', $values)->getQuery()->execute();
    }

    /** An entity's own columns; other entities become their ids. */
    private function plain(object $e): array
    {
        $out = [];
        foreach (get_object_vars($e) as $k => $v) {
            if ($v instanceof \Doctrine\Common\Collections\Collection) {
                continue;
            }
            $out[$k] = is_object($v) ? ($v->id ?? null) : $v;
        }

        return $out;
    }
}

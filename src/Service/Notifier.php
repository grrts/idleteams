<?php

namespace App\Service;

use App\Entity\Hero;
use App\Entity\Notice;
use App\Entity\PushSubscription;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Tells players what happened while they were away. The game calls notify(); deliver() runs after each request and
 * each cron tick, and pushes once per player who has unsent notices and is not in the game right now.
 */
class Notifier
{
    /** A player seen this recently is looking at the game, so no push. */
    public const ONLINE_SECONDS = 90;

    public function __construct(private EntityManagerInterface $em, private WebPush $push)
    {
    }

    public function notify(Hero $h, string $kind, string $title, string $body, string $url = '#/battle'): void
    {
        if ($h->user->demo) {
            return;
        }
        $n = new Notice();
        $n->user = $h->user;
        $n->kind = $kind;
        $n->title = mb_substr($title, 0, 80);
        $n->body = mb_substr($body, 0, 200);
        $n->url = $url;
        $n->createdAt = time();
        $this->em->persist($n);
    }

    /** @return int pushes sent */
    public function deliver(?int $now = null): int
    {
        $now ??= time();
        $pending = $this->em->getRepository(Notice::class)->findBy(['pushedAt' => 0], ['id' => 'ASC'], 500);
        if (!$pending) {
            return 0;
        }
        $byUser = [];
        foreach ($pending as $n) {
            $n->pushedAt = $now;
            $byUser[$n->user->id] = $n->user;
        }
        $sent = 0;
        foreach ($byUser as $u) {
            if ($u->lastSeenAt > $now - self::ONLINE_SECONDS || !$this->push->enabled()) {
                continue;
            }
            foreach ($this->em->getRepository(PushSubscription::class)->findBy(['user' => $u]) as $s) {
                $status = $this->push->send($s->endpoint);
                if ($status === 404 || $status === 410) {
                    $this->em->remove($s);
                } elseif ($status >= 200 && $status < 300) {
                    $s->failures = 0;
                    ++$sent;
                } elseif (++$s->failures >= 20) {
                    $this->em->remove($s);
                }
            }
        }
        $this->em->flush();

        return $sent;
    }

    /** Old notices are of no use to anyone. The cron tick clears them. */
    public function prune(?int $now = null): int
    {
        return $this->em->createQuery('DELETE FROM App\Entity\Notice n WHERE n.createdAt < :old')
            ->setParameter('old', ($now ?? time()) - 7 * 86400)->execute();
    }

    /** What a device should show now: pushed, not shown yet, from the last day. Marks them shown. @return Notice[] */
    public function toShow(User $u, ?int $now = null): array
    {
        $now ??= time();
        $list = $this->em->getRepository(Notice::class)->createQueryBuilder('n')
            ->where('n.user = :u AND n.pushedAt > 0 AND n.shownAt = 0 AND n.createdAt > :since')
            ->setParameter('u', $u)->setParameter('since', $now - 86400)->orderBy('n.id', 'DESC')->setMaxResults(10)
            ->getQuery()->getResult();
        foreach ($list as $n) {
            $n->shownAt = $now;
        }

        return $list;
    }

    public function subscribe(User $u, string $endpoint): void
    {
        if (!preg_match('~^https://[^\s]{10,490}$~', $endpoint)) {
            throw new GameError('That push address is not valid.');
        }
        $s = $this->em->getRepository(PushSubscription::class)->findOneBy(['endpoint' => $endpoint]) ?? new PushSubscription();
        $s->user = $u;
        $s->endpoint = $endpoint;
        $s->createdAt = time();
        $s->failures = 0;
        $this->em->persist($s);
    }

    public function unsubscribe(User $u, string $endpoint): void
    {
        $s = $this->em->getRepository(PushSubscription::class)->findOneBy(['endpoint' => $endpoint, 'user' => $u]);
        if ($s) {
            $this->em->remove($s);
        }
    }
}

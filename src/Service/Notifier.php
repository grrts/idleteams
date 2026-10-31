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

    public function __construct(private EntityManagerInterface $em, private WebPush $push, private Fcm $fcm)
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
        $byUser = $notices = [];
        foreach ($pending as $n) {
            $n->pushedAt = $now;
            $byUser[$n->user->id] = $n->user;
            $notices[$n->user->id][] = $n;
        }
        $sent = 0;
        foreach ($byUser as $u) {
            if ($u->lastSeenAt > $now - self::ONLINE_SECONDS) {
                continue;
            }
            foreach ($this->em->getRepository(PushSubscription::class)->findBy(['user' => $u]) as $s) {
                if ($s->platform === 'web' ? !$this->push->enabled() : !$this->fcm->enabled()) {
                    continue;
                }
                // a browser gets a bare ping and asks what to show (public/sw.js); the apps get the newest notice itself
                $status = $s->platform === 'web' ? $this->push->send($s->endpoint) : $this->native($s, $notices[$u->id]);
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

    /** @param Notice[] $list oldest first */
    private function native(PushSubscription $s, array $list): int
    {
        $n = end($list);
        $more = count($list) - 1;

        return $this->fcm->send($s->endpoint, $n->title, $n->body.($more > 0 ? sprintf(' (and %d more)', $more) : ''), $n->url, count($list));
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

    /** The iOS or Android app's Firebase device token. */
    public function device(User $u, string $token, string $platform): void
    {
        if (!in_array($platform, ['ios', 'android'], true) || !preg_match('/^[A-Za-z0-9_:\-.]{20,490}$/', $token)) {
            throw new GameError('That device token is not valid.');
        }
        $s = $this->em->getRepository(PushSubscription::class)->findOneBy(['endpoint' => $token]) ?? new PushSubscription();
        $s->user = $u;
        $s->endpoint = $token;
        $s->platform = $platform;
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

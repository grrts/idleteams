<?php

namespace App\Service;

use App\Entity\ChatMessage;
use App\Entity\ChatReport;
use App\Entity\Hero;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Keeps open chat safe without a moderator online all the time: players report and block, enough separate reports
 * mute an author until a moderator looks, and moderators clear, mute or remove from the open reports.
 */
class Moderation
{
    /** Distinct reporters within AUTO_WINDOW that mute an author automatically, for AUTO_MUTE seconds. */
    public const AUTO_REPORTERS = 3;
    public const AUTO_WINDOW = 86400;
    public const AUTO_MUTE = 3600;
    public const REPORTS_PER_DAY = 20;
    public const REASONS = ['abuse' => 'Abuse or harassment', 'spam' => 'Spam or selling gold', 'cheat' => 'Cheating', 'other' => 'Something else'];

    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function report(User $reporter, ChatMessage $m, string $reason, ?int $now = null): ChatReport
    {
        $now ??= time();
        $author = $m->author ?? throw new GameError('The game wrote that line, there is no one to report.');
        if ($author->user === $reporter) {
            throw new GameError('You cannot report yourself.');
        }
        $reason = isset(self::REASONS[$reason]) ? $reason : 'other';
        $repo = $this->em->getRepository(ChatReport::class);
        if ($old = $repo->findOneBy(['message' => $m, 'reporter' => $reporter])) {
            return $old;
        }
        $today = (int) $repo->createQueryBuilder('r')->select('COUNT(r.id)')->where('r.reporter = :u AND r.createdAt > :t')
            ->setParameter('u', $reporter)->setParameter('t', $now - 86400)->getQuery()->getSingleScalarResult();
        if ($today >= self::REPORTS_PER_DAY) {
            throw new GameError('You have sent a lot of reports today. Block the player instead, and a moderator will look at what you sent.');
        }
        $r = new ChatReport();
        $r->message = $m;
        $r->reporter = $reporter;
        $r->target = $author->user;
        $r->body = $m->body;
        $r->reason = $reason;
        $r->createdAt = $now;
        $this->em->persist($r);
        $this->em->flush();

        $reporters = (int) $repo->createQueryBuilder('r')->select('COUNT(DISTINCT IDENTITY(r.reporter))')
            ->where('r.target = :u AND r.createdAt > :t AND r.resolvedAt = 0')
            ->setParameter('u', $author->user)->setParameter('t', $now - self::AUTO_WINDOW)->getQuery()->getSingleScalarResult();
        if ($reporters >= self::AUTO_REPORTERS && !$author->user->isMuted($now)) {
            $author->user->mutedUntil = $now + self::AUTO_MUTE;
        }

        return $r;
    }

    public function block(User $u, Hero $other): void
    {
        if ($other->user === $u) {
            throw new GameError('You cannot block yourself.');
        }
        $u->blocked = array_values(array_unique([...$u->blockedIds(), $other->id]));
    }

    public function unblock(User $u, int $heroId): void
    {
        $u->blocked = array_values(array_diff($u->blockedIds(), [$heroId]));
    }

    public function openCount(): int
    {
        return $this->em->getRepository(ChatReport::class)->count(['resolvedAt' => 0]);
    }

    /** @return ChatReport[] open reports, oldest first */
    public function open(int $limit = 100): array
    {
        return $this->em->getRepository(ChatReport::class)->findBy(['resolvedAt' => 0], ['id' => 'ASC'], $limit);
    }

    /**
     * Settles every open report on the same line. dismiss: nothing wrong. remove: delete the line. mute: delete it and
     * mute the author for $hours.
     */
    public function resolve(ChatReport $r, string $outcome, int $hours = 24, ?int $now = null): void
    {
        $now ??= time();
        if (!in_array($outcome, ['dismiss', 'remove', 'mute'], true)) {
            throw new GameError('Choose dismiss, remove or mute.');
        }
        $m = $r->message;
        $all = $this->em->getRepository(ChatReport::class)->findBy(['message' => $m, 'resolvedAt' => 0]);
        foreach ($all as $x) {
            $x->resolvedAt = $now;
            $x->outcome = $outcome;
        }
        if ($outcome === 'dismiss') {
            // An automatic mute that only these reports caused is lifted.
            if ($r->target->mutedUntil > $now && $r->target->mutedUntil <= $now + self::AUTO_MUTE) {
                $r->target->mutedUntil = 0;
            }

            return;
        }
        if ($outcome === 'mute') {
            $this->mute($r->target, $hours, $now);
        }
        $m->body = '[removed by a moderator]';
        $m->card = null;
    }

    public function mute(User $u, int $hours, ?int $now = null): void
    {
        $u->mutedUntil = $hours > 0 ? ($now ?? time()) + min($hours, 24 * 365) * 3600 : 0;
    }
}

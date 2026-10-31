<?php

namespace App\Controller;

use App\Entity\Battle;
use App\Entity\Hero;
use App\Entity\PartyRequest;
use App\Service\Bots;
use App\Service\Game;
use App\Service\Live;
use App\Service\Moderation;
use App\Service\Present;
use App\Service\Roster;
use App\Service\Social;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Mercure\Authorization;
use Symfony\Component\Routing\Attribute\Route;

/** The menus poll this every few seconds. Opening the game is also what moves the group's clock forward. */
class StateController extends ApiController
{
    #[Route('/api/state', methods: ['GET'])]
    public function state(Request $request, Game $game, Present $present, Bots $bots, Social $social, Moderation $moderation, Live $live, Authorization $auth, LoggerInterface $logger): JsonResponse
    {
        $user = $this->me();
        $user->lastSeenAt = time();
        \App\Game\Funnel::seen($user);
        $roster = new Roster($this->em);
        $hero = $roster->active($user);
        $roster->share($user);
        if (!$hero) {
            $this->em->flush();

            return $this->json(['serverTime' => time(), 'user' => ['username' => $user->username], 'hero' => null]);
        }
        if ($hero->party) {
            $this->em->wrapInTransaction(function () use ($game, $hero) {
                $game->progress($hero->party);
            });
            foreach ($hero->party->members as $m) {
                $bots->think($m);
            }
        }
        $this->em->flush();

        $invites = array_map(fn (PartyRequest $r) => $present->request($r), $this->em->getRepository(PartyRequest::class)->findBy(['hero' => $hero]));
        $battle = $hero->party ? $this->em->getRepository(Battle::class)->findOneBy(['party' => $hero->party, 'state' => 'running']) : null;
        $chests = $hero->party ? $this->em->getRepository(Battle::class)->findBy(['party' => $hero->party, 'state' => 'chest']) : [];
        $pendingRolls = 0;
        foreach ($chests as $b) {
            foreach ($b->chest as $c) {
                if (in_array($hero->id, array_column($b->roster, 'id'), true) && !isset($c['rolls'][(string) $hero->id])) {
                    ++$pendingRolls;
                }
            }
        }

        return $this->json([
            'serverTime' => time(),
            'user' => ['username' => $user->username, 'email' => $user->email, 'emailVerified' => $user->emailVerified, 'admin' => $user->admin, 'mutedUntil' => $user->isMuted() ? $user->mutedUntil : 0, 'blocked' => $present->blocked($user), 'reports' => $user->admin ? $moderation->openCount() : 0, 'steamLinked' => $user->steamId !== null],
            'hero' => $present->hero($hero),
            'heroes' => array_map(fn (Hero $x) => $present->heroCard($x) + ['active' => $x === $hero], $roster->heroes($user)), 'maxHeroes' => Roster::MAX, 'catchUp' => \App\Game\Rules::catchUp($hero->level, $roster->best($user)),
            'inventory' => $present->inventory($hero),
            'party' => $present->party($hero->party, $hero),
            'invites' => $invites,
            'battle' => $battle ? ['id' => $battle->id, 'startedAt' => $battle->startedAt, 'endsAt' => $battle->endsAt, 'dungeon' => $battle->dungeon, 'dungeonLevel' => $battle->dungeonLevel] : null,
            'pendingRolls' => $pendingRolls,
            'channels' => $channels = $social->channels($hero),
            'live' => $this->live($request, $live, $auth, $logger, $live->topicsFor($user, $hero, $channels)),
        ]);
    }

    /** Where to listen for live pings, with a cookie that lets this player hear exactly these topics. */
    private function live(Request $request, Live $live, Authorization $auth, LoggerInterface $logger, array $topics): ?array
    {
        if (!$live->enabled()) {
            return null;
        }
        if (\App\Service\ApiTokens::fromHeader($request->headers->get('Authorization'))) {
            $url = $live->subscribeUrlWithToken($topics);

            return $url ? ['url' => $url] : null;
        }
        try {
            $auth->setCookie($request, $topics);
        } catch (\Throwable $e) {
            // For example a hub on another domain than the game: the cookie cannot reach it, so the menus keep polling.
            $logger->warning('Live updates are off for this request: '.$e->getMessage());

            return null;
        }

        return ['url' => $live->subscribeUrl($topics)];
    }

    #[Route('/api/battle', methods: ['GET'])]
    public function battle(Request $r, Present $present): JsonResponse
    {
        $hero = $this->hero();
        $out = ['serverTime' => time(), 'current' => null, 'chests' => [], 'recent' => []];
        if (!$hero->party) {
            return $this->json($out);
        }
        $repo = $this->em->getRepository(Battle::class);
        $current = $repo->findOneBy(['party' => $hero->party, 'state' => 'running']);
        if ($current) {
            $out['current'] = $present->battle($current, $hero, (int) $r->query->get('have') !== $current->id);
        }
        foreach ($repo->findBy(['party' => $hero->party, 'state' => 'chest'], ['id' => 'DESC']) as $b) {
            $out['chests'][] = $present->battle($b, $hero, false);
        }
        foreach ($repo->findBy(['party' => $hero->party, 'state' => 'done'], ['id' => 'DESC'], 8) as $b) {
            $out['recent'][] = $present->battle($b, $hero, false);
        }

        return $this->json($out);
    }

    #[Route('/api/battle/{id}/roll', methods: ['POST'])]
    public function roll(int $id, Request $r, Game $game, Present $present): JsonResponse
    {
        $hero = $this->hero();
        $b = $this->find(Battle::class, $id);
        $in = $this->body($r);
        $game->roll($b, $hero, (int) ($in['idx'] ?? -1), (string) ($in['choice'] ?? ''));
        $this->em->flush();

        return $this->json($present->battle($b, $hero, false));
    }
}

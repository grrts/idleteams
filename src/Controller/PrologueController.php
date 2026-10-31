<?php

namespace App\Controller;

use App\Game\Prologue;
use App\Service\Game;
use App\Service\Present;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/** The first fight: shaped like a running battle so the arena plays it as one, but never stored and never rewarded. */
class PrologueController extends ApiController
{
    #[Route('/api/prologue', methods: ['GET'])]
    public function show(Game $game): JsonResponse
    {
        $h = $this->hero();
        $run = Prologue::run($game->combatant($h), $game->look($h));
        $now = time();

        return $this->json(['current' => [
            'id' => 'prologue', 'state' => 'running', 'prologue' => true, 'dungeon' => Prologue::DUNGEON, 'dungeonLevel' => 2,
            'startedAt' => $now, 'endsAt' => $now + Prologue::SECONDS, 'chestClosesAt' => null, 'roster' => $run['roster'],
            'report' => null, 'timeline' => $run['timeline'], 'chest' => [], 'plan' => Prologue::dungeon()['plan'],
        ]]);
    }

    #[Route('/api/prologue/done', methods: ['POST'])]
    public function done(Present $present): JsonResponse
    {
        $h = $this->hero();
        $h->prologueDone = true;
        \App\Game\Funnel::mark($h->user, 'prologue');
        $this->em->flush();

        return $this->json($present->hero($h));
    }
}

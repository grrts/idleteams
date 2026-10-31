<?php

namespace App\Controller;

use App\Entity\WorldRaid;
use App\Service\WorldRaids;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

/** The season's world raid (src/Service/WorldRaids.php): what it is, who is signed up, and the last one's result. */
class WorldController extends ApiController
{
    #[Route('/api/world', methods: ['GET'])]
    public function show(WorldRaids $world): JsonResponse
    {
        $r = $world->current();
        $this->em->flush();
        if (!$r) {
            return $this->json(['raid' => null]);
        }
        $w = WorldRaids::def($r);
        $p = $this->hero()->party;
        $last = $r->state === 'done' ? $r : $this->em->createQuery('SELECT r FROM App\Entity\WorldRaid r WHERE r.state = :s ORDER BY r.startsAt DESC')->setParameter('s', 'done')->setMaxResults(1)->getOneOrNullResult();

        return $this->json(['raid' => [
            'name' => $w['name'], 'summary' => $w['summary'], 'level' => $w['level'], 'max' => $w['squads'], 'startsAt' => $r->startsAt, 'state' => $r->state,
            'squads' => count($r->squads), 'heroes' => array_sum(array_map('count', $r->squads)), 'mine' => $p && isset($r->squads[(string) $p->id]),
            'leader' => $p && $p->leader === $this->hero(), 'reward' => $w['reward'],
            'last' => $last instanceof WorldRaid ? $last->report : null,
        ]]);
    }

    #[Route('/api/world/{action}', methods: ['POST'], requirements: ['action' => 'signup|leave'])]
    public function act(string $action, WorldRaids $world): JsonResponse
    {
        $action === 'signup' ? $world->signup($this->hero()) : $world->leave($this->hero());
        $this->em->flush();

        return $this->show($world);
    }
}

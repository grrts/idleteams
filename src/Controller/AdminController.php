<?php

namespace App\Controller;

use App\Entity\ChatReport;
use App\Entity\User;
use App\Service\GameError;
use App\Service\Moderation;
use App\Service\Present;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;

/** The moderator's queue. Grant the role with: php bin/console app:admin <username>. */
#[IsGranted('ROLE_ADMIN')]
class AdminController extends ApiController
{
    #[Route('/api/admin/reports', methods: ['GET'])]
    public function reports(Moderation $mod, Present $present): JsonResponse
    {
        return $this->json(array_map(fn (ChatReport $r) => $present->report($r), $mod->open()));
    }

    #[Route('/api/admin/reports/{id}', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function resolve(int $id, Request $r, Moderation $mod): JsonResponse
    {
        $in = $this->body($r);
        $mod->resolve($this->find(ChatReport::class, $id), (string) ($in['outcome'] ?? ''), (int) ($in['hours'] ?? 24));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/admin/mute', methods: ['POST'])]
    public function mute(Request $r, Moderation $mod): JsonResponse
    {
        $in = $this->body($r);
        $u = $this->em->getRepository(User::class)->findOneBy(['username' => strtolower(trim((string) ($in['username'] ?? '')))])
            ?? throw new GameError('No such account.');
        $mod->mute($u, (int) ($in['hours'] ?? 24));
        $this->em->flush();

        return $this->json(['ok' => true, 'mutedUntil' => $u->mutedUntil]);
    }
}

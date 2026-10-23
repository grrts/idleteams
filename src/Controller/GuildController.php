<?php

namespace App\Controller;

use App\Entity\Guild;
use App\Service\Present;
use App\Service\Social;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class GuildController extends ApiController
{
    #[Route('/api/guilds', methods: ['GET'])]
    public function list(Present $present): JsonResponse
    {
        $h = $this->hero();
        $all = $this->em->getRepository(Guild::class)->findBy([], ['xp' => 'DESC'], 50);

        return $this->json([
            'mine' => $h->guild ? $present->guild($h->guild, true) : null,
            'all' => array_map(fn (Guild $g) => $present->guild($g), $all),
        ]);
    }

    #[Route('/api/guild/create', methods: ['POST'])]
    public function create(Request $r, Social $social): JsonResponse
    {
        $social->createGuild($this->hero(), $this->body($r));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/guild/{id}/join', methods: ['POST'])]
    public function join(int $id, Social $social): JsonResponse
    {
        $social->joinGuild($this->hero(), $this->find(Guild::class, $id));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/guild/leave', methods: ['POST'])]
    public function leave(Social $social): JsonResponse
    {
        $social->leaveGuild($this->hero());
        $this->em->flush();

        return $this->json(['ok' => true]);
    }
}

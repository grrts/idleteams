<?php

namespace App\Controller;

use App\Entity\Guild;
use App\Entity\Hero;
use App\Entity\Item;
use App\Service\GuildActions;
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
            'mine' => $h->guild ? $present->guild($h->guild, true, $h) : null,
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

    #[Route('/api/guild/bank/{action}', methods: ['POST'], requirements: ['action' => 'deposit|withdraw|goldIn|goldOut'])]
    public function bank(string $action, Request $r, GuildActions $guild): JsonResponse
    {
        $h = $this->hero();
        $in = $this->body($r);
        match ($action) {
            'deposit' => $guild->deposit($h, $this->find(Item::class, (int) ($in['id'] ?? 0))),
            'withdraw' => $guild->withdraw($h, $this->find(Item::class, (int) ($in['id'] ?? 0))),
            'goldIn' => $guild->depositGold($h, (int) ($in['gold'] ?? 0)),
            'goldOut' => $guild->withdrawGold($h, (int) ($in['gold'] ?? 0)),
        };
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/guild/notice', methods: ['POST'])]
    public function notice(Request $r, GuildActions $guild): JsonResponse
    {
        $guild->notice($this->hero(), (string) ($this->body($r)['notice'] ?? ''));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/guild/rank', methods: ['POST'])]
    public function rank(Request $r, GuildActions $guild): JsonResponse
    {
        $in = $this->body($r);
        $guild->rank($this->hero(), $this->find(Hero::class, (int) ($in['hero'] ?? 0)), (string) ($in['rank'] ?? ''));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }
}

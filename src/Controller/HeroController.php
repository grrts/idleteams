<?php

namespace App\Controller;

use App\Entity\Hero;
use App\Service\HeroActions;
use App\Service\Present;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class HeroController extends ApiController
{
    #[Route('/api/hero', methods: ['POST'])]
    public function create(Request $r, HeroActions $actions, Present $present): JsonResponse
    {
        $h = $actions->create($this->me(), $this->body($r));
        $this->em->flush();

        return $this->json($present->hero($h));
    }

    #[Route('/api/hero/{id}', methods: ['GET'], requirements: ['id' => '\d+'])]
    public function show(int $id, Present $present): JsonResponse
    {
        $h = $this->find(Hero::class, $id);

        return $this->json($present->heroCard($h) + ['gear' => array_map(fn ($i) => $present->item($i), array_values(array_filter(
            $this->em->getRepository(\App\Entity\Item::class)->findBy(['owner' => $h]), fn ($i) => $i->equipped !== null,
        )))]);
    }

    /** One endpoint per growth action keeps the menus simple: {action, ...}. */
    #[Route('/api/hero/act', methods: ['POST'])]
    public function act(Request $r, HeroActions $actions, Present $present): JsonResponse
    {
        $h = $this->hero();
        $in = $this->body($r);
        match ($in['action'] ?? '') {
            'spend' => $actions->spend($h, array_map('intval', (array) ($in['points'] ?? []))),
            'autoSpend' => $actions->autoSpend($h),
            'path' => $actions->choosePath($h, (string) ($in['path'] ?? '')),
            'keystone' => $actions->chooseKeystone($h, (int) ($in['level'] ?? 0), (string) ($in['keystone'] ?? '')),
            'rankUp' => $actions->rankUp($h, (string) ($in['skill'] ?? '')),
            'resetRanks' => $actions->resetRanks($h),
            'loadout' => $actions->setLoadout($h, (array) ($in['skills'] ?? [])),
            'lootPolicy' => $actions->setLootPolicy($h, (string) ($in['policy'] ?? '')),
            'talent' => $actions->learnTalent($h, array_map('strval', (array) ($in['nodes'] ?? [$in['node'] ?? '']))),
            'resetTalents' => $actions->resetTalents($h),
            'culture' => $actions->chooseCulture($h, (string) ($in['culture'] ?? '')),
            'story' => $actions->writeStory($h, $in['story'] ?? null),
            'heritage' => $actions->learnHeritage($h, array_map('strval', (array) ($in['nodes'] ?? [$in['node'] ?? '']))),
            default => throw new \App\Service\GameError('Unknown action.'),
        };
        $this->em->flush();

        return $this->json($present->hero($h));
    }
}

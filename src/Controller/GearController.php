<?php

namespace App\Controller;

use App\Entity\Item;
use App\Service\GameError;
use App\Service\GearActions;
use App\Service\Present;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class GearController extends ApiController
{
    /** The wardrobe: show a kept look in a slot instead of the worn item. */
    #[Route('/api/outfit', methods: ['POST'])]
    public function outfit(Request $r, GearActions $gear, Present $present): JsonResponse
    {
        $h = $this->hero();
        $in = $this->body($r);
        $gear->outfit($h, (string) ($in['slot'] ?? ''), isset($in['look']) ? (string) $in['look'] : null);
        $this->em->flush();

        return $this->json($present->hero($h));
    }

    #[Route('/api/item/{id}/{action}', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function act(int $id, string $action, Request $r, GearActions $gear, Present $present): JsonResponse
    {
        $h = $this->hero();
        $i = $gear->own($h, $id);
        $in = $this->body($r);
        $result = null;
        match ($action) {
            'equip' => $gear->equip($h, $i, $in['slot'] ?? null),
            'unequip' => $gear->unequip($i),
            'dye' => $gear->dye($h, $i, isset($in['dye']) && is_array($in['dye']) ? $in['dye'] : null),
            'temper' => $gear->temper($h, $i),
            'socket' => $gear->socket($h, $i, $gear->own($h, (int) ($in['glyph'] ?? 0)), (int) ($in['socket'] ?? -1)),
            'unsocket' => $gear->unsocket($h, $i, (int) ($in['socket'] ?? -1)),
            'imprint' => $gear->imprint($h, $i, (string) ($in['power'] ?? '')),
            'reforge' => $gear->reforge($h, $i, (int) ($in['affix'] ?? -1), (string) ($in['attr'] ?? '')),
            'salvage' => $result = $gear->salvage($h, $i),
            'give' => $gear->give($h, $i, $this->heroByName((string) ($in['to'] ?? ''))),
            'sell' => $gear->sell($i, (int) ($in['price'] ?? 0)),
            'unlist' => $gear->unlist($i),
            default => throw new GameError('Unknown action.'),
        };
        $this->em->flush();

        return $this->json(['ok' => true, 'result' => $result]);
    }

    #[Route('/api/craft', methods: ['POST'])]
    public function craft(Request $r, GearActions $gear, Present $present): JsonResponse
    {
        $h = $this->hero();
        $in = $this->body($r);
        $item = $gear->craft($h, (string) ($in['slot'] ?? ''), isset($in['base']) && $in['base'] !== '' ? (string) $in['base'] : null);
        $this->em->flush();

        return $this->json($present->item($item, $h));
    }

    #[Route('/api/craft/cost', methods: ['GET'])]
    public function craftCost(): JsonResponse
    {
        return $this->json(GearActions::craftCost($this->hero()->level));
    }

    #[Route('/api/market', methods: ['GET'])]
    public function market(Request $r, Present $present): JsonResponse
    {
        $h = $this->hero();
        $q = $this->em->getRepository(Item::class)->createQueryBuilder('i')
            ->where('i.price IS NOT NULL')->orderBy('i.id', 'DESC')->setMaxResults(80);
        if ($slot = $r->query->get('slot')) {
            $q->andWhere('i.slot = :s')->setParameter('s', $slot);
        }
        if ($rarity = $r->query->get('rarity')) {
            $q->andWhere('i.rarity = :r')->setParameter('r', $rarity);
        }

        return $this->json(array_map(fn (Item $i) => $present->item($i, $h), $q->getQuery()->getResult()));
    }

    #[Route('/api/market/{id}/buy', methods: ['POST'])]
    public function buy(int $id, GearActions $gear, Present $present): JsonResponse
    {
        $h = $this->hero();
        $i = $gear->buy($h, $id);
        $this->em->flush();

        return $this->json($present->item($i, $h));
    }
}

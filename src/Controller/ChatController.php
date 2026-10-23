<?php

namespace App\Controller;

use App\Entity\ChatMessage;
use App\Service\Present;
use App\Service\Social;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class ChatController extends ApiController
{
    #[Route('/api/chat', methods: ['GET'])]
    public function read(Request $r, Social $social, Present $present): JsonResponse
    {
        $msgs = $social->read($this->hero(), (string) $r->query->get('channel', 'tavern'), (int) $r->query->get('after', 0));

        return $this->json(array_map(fn (ChatMessage $m) => $present->chat($m), $msgs));
    }

    #[Route('/api/chat', methods: ['POST'])]
    public function say(Request $r, Social $social, Present $present): JsonResponse
    {
        $in = $this->body($r);
        $card = isset($in['item']) ? ['type' => 'item', 'item' => (int) $in['item']] : null;
        $m = $social->say($this->hero(), (string) ($in['channel'] ?? 'tavern'), (string) ($in['body'] ?? ''), $card);
        $this->em->flush();

        return $this->json($present->chat($m));
    }
}

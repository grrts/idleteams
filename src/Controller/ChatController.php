<?php

namespace App\Controller;

use App\Entity\ChatMessage;
use App\Service\GameError;
use App\Service\Moderation;
use App\Service\Present;
use App\Service\Social;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactory;
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
    public function say(Request $r, Social $social, Present $present, #[Autowire(service: 'limiter.chat')] RateLimiterFactory $chatLimiter): JsonResponse
    {
        $hero = $this->hero();
        if (!$chatLimiter->create('hero-'.$hero->id)->consume()->isAccepted()) {
            throw new GameError('Slow down a little: you can send a few lines every few seconds.');
        }
        $in = $this->body($r);
        $card = isset($in['item']) ? ['type' => 'item', 'item' => (int) $in['item']] : null;
        $m = $social->say($hero, (string) ($in['channel'] ?? 'tavern'), (string) ($in['body'] ?? ''), $card);
        $this->em->flush();

        return $this->json($present->chat($m));
    }

    #[Route('/api/chat/{id}/report', methods: ['POST'], requirements: ['id' => '\d+'])]
    public function report(int $id, Request $r, Social $social, Moderation $mod): JsonResponse
    {
        $hero = $this->hero();
        $m = $this->find(ChatMessage::class, $id);
        if (!isset($social->channels($hero)[$m->channel])) {
            throw new GameError('Not found.');
        }
        $mod->report($this->me(), $m, (string) ($this->body($r)['reason'] ?? 'other'));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/block', methods: ['POST'])]
    public function block(Request $r, Moderation $mod, Present $present): JsonResponse
    {
        $in = $this->body($r);
        $other = isset($in['hero']) ? $this->find(\App\Entity\Hero::class, $in['hero']) : $this->heroByName((string) ($in['name'] ?? ''));
        $mod->block($this->me(), $other);
        $this->em->flush();

        return $this->json(['blocked' => $present->blocked($this->me())]);
    }

    #[Route('/api/block/{id}', methods: ['DELETE'], requirements: ['id' => '\d+'])]
    public function unblock(int $id, Moderation $mod, Present $present): JsonResponse
    {
        $mod->unblock($this->me(), $id);
        $this->em->flush();

        return $this->json(['blocked' => $present->blocked($this->me())]);
    }
}

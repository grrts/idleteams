<?php

namespace App\Controller;

use App\Entity\Notice;
use App\Service\Notifier;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class PushController extends ApiController
{
    #[Route('/api/push/subscribe', methods: ['POST'])]
    public function subscribe(Request $r, Notifier $notifier): JsonResponse
    {
        $notifier->subscribe($this->me(), (string) ($this->body($r)['endpoint'] ?? ''));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/push/unsubscribe', methods: ['POST'])]
    public function unsubscribe(Request $r, Notifier $notifier): JsonResponse
    {
        $notifier->unsubscribe($this->me(), (string) ($this->body($r)['endpoint'] ?? ''));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    /** Called by the service worker when a push arrives. */
    #[Route('/api/notices/push', methods: ['GET'])]
    public function toShow(Notifier $notifier): JsonResponse
    {
        $list = $notifier->toShow($this->me());
        $this->em->flush();

        return $this->json(array_map(fn (Notice $n) => ['id' => $n->id, 'kind' => $n->kind, 'title' => $n->title, 'body' => $n->body, 'url' => $n->url, 'at' => $n->createdAt], $list));
    }
}

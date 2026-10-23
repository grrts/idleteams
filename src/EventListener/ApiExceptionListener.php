<?php

namespace App\EventListener;

use App\Service\GameError;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

/** API errors come back as {"error": "..."} so the menus can show them. */
#[AsEventListener]
final class ApiExceptionListener
{
    public function __invoke(ExceptionEvent $event): void
    {
        if (!str_starts_with($event->getRequest()->getPathInfo(), '/api/')) {
            return;
        }
        $e = $event->getThrowable();
        if ($e instanceof GameError) {
            $event->setResponse(new JsonResponse(['error' => $e->getMessage()], 400));
        } elseif ($e instanceof HttpExceptionInterface) {
            $event->setResponse(new JsonResponse(['error' => $e->getMessage() ?: 'Request failed'], $e->getStatusCode()));
        }
    }
}

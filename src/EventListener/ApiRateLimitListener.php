<?php

namespace App\EventListener;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\RateLimiter\RateLimiterFactory;

/** Stops a single address from hammering the API. Normal play (a refresh every few seconds) stays far below it. */
#[AsEventListener(event: KernelEvents::REQUEST, priority: 20)]
final class ApiRateLimitListener
{
    public function __construct(#[Autowire(service: 'limiter.api')] private RateLimiterFactory $apiLimiter)
    {
    }

    public function __invoke(RequestEvent $event): void
    {
        $r = $event->getRequest();
        if (!$event->isMainRequest() || !str_starts_with($r->getPathInfo(), '/api/')) {
            return;
        }
        $limit = $this->apiLimiter->create('ip-'.$r->getClientIp())->consume();
        if (!$limit->isAccepted()) {
            $res = new JsonResponse(['error' => 'Too many requests. Wait a moment and try again.'], 429);
            $res->headers->set('Retry-After', (string) max(1, $limit->getRetryAfter()->getTimestamp() - time()));
            $event->setResponse($res);
        }
    }
}

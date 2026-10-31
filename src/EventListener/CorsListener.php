<?php

namespace App\EventListener;

use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\ResponseEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Lets the native apps call the API from their own origin (the iOS and Android apps run from capacitor://localhost and
 * https://localhost, the Steam build from app://idleteams). They log in with a bearer token, never a cookie, so no
 * credentials are allowed across origins. CORS_ORIGINS lists the origins, separated by commas.
 */
final class CorsListener
{
    private array $origins;

    public function __construct(#[Autowire('%env(CORS_ORIGINS)%')] string $origins)
    {
        $this->origins = array_values(array_filter(array_map('trim', explode(',', $origins))));
    }

    #[AsEventListener(event: KernelEvents::REQUEST, priority: 250)]
    public function preflight(RequestEvent $event): void
    {
        $r = $event->getRequest();
        if ($event->isMainRequest() && $r->getMethod() === 'OPTIONS' && $this->allowed($r)) {
            $event->setResponse($this->headers($r, new Response('', 204)));
        }
    }

    #[AsEventListener(event: KernelEvents::RESPONSE)]
    public function response(ResponseEvent $event): void
    {
        if ($event->isMainRequest() && $this->allowed($event->getRequest())) {
            $this->headers($event->getRequest(), $event->getResponse());
        }
    }

    private function allowed(Request $r): bool
    {
        return str_starts_with($r->getPathInfo(), '/api/') && in_array($r->headers->get('Origin'), $this->origins, true);
    }

    private function headers(Request $r, Response $res): Response
    {
        $res->headers->set('Access-Control-Allow-Origin', (string) $r->headers->get('Origin'));
        $res->headers->set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        $res->headers->set('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
        $res->headers->set('Access-Control-Max-Age', '600');
        $res->setVary(array_unique([...$res->getVary(), 'Origin']));

        return $res;
    }
}

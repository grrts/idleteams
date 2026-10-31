<?php

namespace App\Security;

use App\Service\ApiTokens;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestMatcherInterface;

/** Picks the stateless "app" firewall (security.yaml) for API requests that carry an app token. */
final class BearerRequestMatcher implements RequestMatcherInterface
{
    public function matches(Request $request): bool
    {
        return str_starts_with($request->getPathInfo(), '/api/') && ApiTokens::fromHeader($request->headers->get('Authorization')) !== null;
    }
}

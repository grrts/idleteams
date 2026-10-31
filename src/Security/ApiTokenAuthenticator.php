<?php

namespace App\Security;

use App\Service\ApiTokens;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAuthenticationException;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;

/**
 * Logs in a request from the native apps by its "Authorization: Bearer it_..." token (src/Service/ApiTokens.php).
 * Such requests go through the stateless "app" firewall (security.yaml): no session cookie is made or read.
 */
final class ApiTokenAuthenticator extends AbstractAuthenticator
{
    public function __construct(private ApiTokens $tokens)
    {
    }

    public function supports(Request $request): ?bool
    {
        return ApiTokens::fromHeader($request->headers->get('Authorization')) !== null;
    }

    public function authenticate(Request $request): SelfValidatingPassport
    {
        $t = $this->tokens->find((string) ApiTokens::fromHeader($request->headers->get('Authorization')))
            ?? throw new CustomUserMessageAuthenticationException('Your login has ended. Log in again.');

        return new SelfValidatingPassport(new UserBadge($t->user->getUserIdentifier(), fn () => $t->user));
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        return null;
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): ?Response
    {
        return new JsonResponse(['error' => $exception->getMessageKey() === 'Your login has ended. Log in again.' ? 'Your login has ended. Log in again.' : 'Log in first.'], 401);
    }
}

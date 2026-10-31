<?php

namespace App\Controller;

use App\Entity\User;
use App\Service\ApiTokens;
use App\Service\GameError;
use App\Service\Steam;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\RateLimiter\RateLimiterFactory;
use Symfony\Component\Routing\Attribute\Route;

/**
 * Logging in from the native apps: a token instead of a session cookie (src/Service/ApiTokens.php), with a password
 * or, in the Steam build, with the Steam account linked to the game account.
 */
class TokenController extends ApiController
{
    #[Route('/api/token', methods: ['POST'])]
    public function password(Request $r, ApiTokens $tokens, UserPasswordHasherInterface $hasher, #[Autowire(service: 'limiter.login')] RateLimiterFactory $limiter): JsonResponse
    {
        $in = $this->body($r);
        $username = strtolower(trim((string) ($in['username'] ?? '')));
        // only wrong passwords count against the limit
        $limit = $limiter->create($r->getClientIp().'-'.$username);
        if (!$limit->consume(0)->isAccepted()) {
            throw new GameError('Too many tries. Wait a few minutes and try again.');
        }
        $u = $this->em->getRepository(User::class)->findOneBy(['username' => $username]);
        if (!$u || !$hasher->isPasswordValid($u, (string) ($in['password'] ?? ''))) {
            $limit->consume();

            return $this->json(['error' => 'Wrong username or password.'], 401);
        }

        return $this->json(['token' => $tokens->issue($u, (string) ($in['platform'] ?? '')), 'username' => $u->username]);
    }

    /** The Steam build: a Steam session ticket logs in the game account linked to that Steam account. */
    #[Route('/api/token/steam', methods: ['POST'])]
    public function steam(Request $r, ApiTokens $tokens, Steam $steam): JsonResponse
    {
        $id = $steam->authenticate((string) ($this->body($r)['ticket'] ?? ''));
        $u = $this->em->getRepository(User::class)->findOneBy(['steamId' => $id]);
        if (!$u) {
            // the app then offers to log in with a password (or make an account) and links Steam to it
            return $this->json(['error' => 'No game account is linked to this Steam account yet.', 'link' => true], 404);
        }

        return $this->json(['token' => $tokens->issue($u, 'steam'), 'username' => $u->username]);
    }

    /** Logs this app out: the token stops working. */
    #[Route('/api/token/revoke', methods: ['POST'])]
    public function revoke(Request $r, ApiTokens $tokens): JsonResponse
    {
        if ($t = ApiTokens::fromHeader($r->headers->get('Authorization'))) {
            $tokens->revoke($t);
        }

        return $this->json(['ok' => true]);
    }

    /** Links the Steam account the ticket belongs to with the logged-in game account. */
    #[Route('/api/account/steam', methods: ['POST'])]
    public function link(Request $r, Steam $steam): JsonResponse
    {
        $u = $this->me();
        $id = $steam->authenticate((string) ($this->body($r)['ticket'] ?? ''));
        $other = $this->em->getRepository(User::class)->findOneBy(['steamId' => $id]);
        if ($other && $other !== $u) {
            throw new GameError('That Steam account is linked to another game account.');
        }
        $u->steamId = $id;
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/account/steam/unlink', methods: ['POST'])]
    public function unlink(): JsonResponse
    {
        $this->me()->steamId = null;
        $this->em->flush();

        return $this->json(['ok' => true]);
    }
}

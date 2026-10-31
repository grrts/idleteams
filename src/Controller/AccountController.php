<?php

namespace App\Controller;

use App\Service\Accounts;
use App\Service\GameError;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\RateLimiter\RateLimiterFactory;
use Symfony\Component\Routing\Attribute\Route;

class AccountController extends ApiController
{
    public function __construct(\Doctrine\ORM\EntityManagerInterface $em, #[Autowire(service: 'limiter.mail')] private RateLimiterFactory $mailLimiter)
    {
        parent::__construct($em);
    }

    private function limitMail(Request $r): void
    {
        if (!$this->mailLimiter->create('ip-'.$r->getClientIp())->consume()->isAccepted()) {
            throw new GameError('Too many mails asked for from this address. Try again in an hour.');
        }
    }

    #[Route('/api/account/email', methods: ['POST'])]
    public function email(Request $r, Accounts $accounts): JsonResponse
    {
        $this->limitMail($r);
        $accounts->setEmail($this->me(), (string) ($this->body($r)['email'] ?? ''));
        $this->em->flush();

        return $this->json(['ok' => true, 'email' => $this->me()->email, 'emailVerified' => $this->me()->emailVerified]);
    }

    #[Route('/api/account/verify', methods: ['POST'])]
    public function verify(Request $r, Accounts $accounts): JsonResponse
    {
        $accounts->verify($this->me(), (string) ($this->body($r)['token'] ?? ''));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/password/forgot', methods: ['POST'])]
    public function forgot(Request $r, Accounts $accounts): JsonResponse
    {
        $this->limitMail($r);
        $accounts->forgot((string) ($this->body($r)['email'] ?? ''));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/password/reset', methods: ['POST'])]
    public function reset(Request $r, Accounts $accounts, Security $security): JsonResponse
    {
        $in = $this->body($r);
        $u = $accounts->reset((string) ($in['username'] ?? ''), (string) ($in['token'] ?? ''), (string) ($in['password'] ?? ''));
        $this->em->flush();
        $security->login($u, 'json_login', 'main');

        return $this->json(['ok' => true, 'username' => $u->username]);
    }
}

<?php

namespace App\Controller;

use App\Entity\User;
use App\Game\Heritage;
use App\Game\Talents;
use App\Service\GameError;
use App\Service\Present;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;
use Symfony\Component\Routing\Attribute\Route;

class AuthController extends ApiController
{
    #[Route('/api/config', methods: ['GET'])]
    public function config(Present $present): JsonResponse
    {
        return $this->json($present->config());
    }

    /** One talent or Heritage map. They are big and never change between releases, so clients cache them. */
    #[Route('/api/tree/{kind}/{key}', methods: ['GET'], requirements: ['kind' => 'talent|heritage', 'key' => '[a-z]+'])]
    public function tree(string $kind, string $key): JsonResponse
    {
        $ok = $kind === 'talent' ? isset(Talents::TREES[$key]) : isset(Heritage::TREES[$key]);
        if (!$ok) {
            throw new GameError('Unknown map.');
        }
        $res = $this->json($kind === 'talent' ? Talents::tree($key) : Heritage::tree($key));
        $res->setPublic();
        $res->setMaxAge(86400);

        return $res;
    }

    #[Route('/api/register', methods: ['POST'])]
    public function register(Request $r, UserPasswordHasherInterface $hasher, Security $security): JsonResponse
    {
        $in = $this->body($r);
        $username = strtolower(trim((string) ($in['username'] ?? '')));
        $password = (string) ($in['password'] ?? '');
        if (!preg_match('/^[a-z0-9_.-]{3,40}$/', $username)) {
            throw new GameError('Usernames are 3 to 40 letters, digits, dots, dashes or underscores.');
        }
        if (strlen($password) < 8) {
            throw new GameError('Use a password of at least 8 characters.');
        }
        if ($this->em->getRepository(User::class)->findOneBy(['username' => $username])) {
            throw new GameError('That username is taken.');
        }
        $u = new User();
        $u->username = $username;
        $u->password = $hasher->hashPassword($u, $password);
        $u->createdAt = $u->lastSeenAt = time();
        $this->em->persist($u);
        $this->em->flush();
        $security->login($u, 'json_login', 'main');

        return $this->json(['ok' => true, 'username' => $u->username]);
    }

    /** The json_login authenticator handles the POST; this runs after a successful login. */
    #[Route('/api/login', name: 'api_login', methods: ['POST'])]
    public function login(): JsonResponse
    {
        return $this->json(['ok' => true, 'username' => $this->me()->username]);
    }
}

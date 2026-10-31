<?php

namespace App\Service;

use App\Entity\ApiToken;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Logins for the native apps (src/Entity/ApiToken.php). The app gets the token once, keeps it in the device's
 * secure storage and sends it as "Authorization: Bearer <token>"; the server keeps only its sha256.
 */
class ApiTokens
{
    public const PLATFORMS = ['ios', 'android', 'steam', 'web'];

    /** An account has at most this many; the oldest goes when another is made. */
    public const MAX = 10;

    public function __construct(private EntityManagerInterface $em)
    {
    }

    public function issue(User $u, string $platform): string
    {
        in_array($platform, self::PLATFORMS, true) || throw new GameError('Unknown platform.');
        $old = $this->em->getRepository(ApiToken::class)->findBy(['user' => $u], ['lastUsedAt' => 'DESC']);
        foreach (array_slice($old, self::MAX - 1) as $t) {
            $this->em->remove($t);
        }
        $token = 'it_'.bin2hex(random_bytes(32));
        $t = new ApiToken();
        $t->user = $u;
        $t->hash = hash('sha256', $token);
        $t->platform = $platform;
        $t->createdAt = $t->lastUsedAt = time();
        $this->em->persist($t);
        $this->em->flush();

        return $token;
    }

    public function find(string $token): ?ApiToken
    {
        $t = $this->em->getRepository(ApiToken::class)->findOneBy(['hash' => hash('sha256', $token)]);
        if ($t && $t->lastUsedAt < time() - 300) {
            $t->lastUsedAt = time();
            $this->em->flush();
        }

        return $t;
    }

    public function revoke(string $token): void
    {
        $this->em->createQuery('DELETE FROM App\Entity\ApiToken t WHERE t.hash = :h')->setParameter('h', hash('sha256', $token))->execute();
    }

    /** Every app login of the account ends (a new password, a deleted account). */
    public function revokeAll(User $u): void
    {
        $this->em->createQuery('DELETE FROM App\Entity\ApiToken t WHERE t.user = :u')->setParameter('u', $u)->execute();
    }

    public static function fromHeader(?string $header): ?string
    {
        return $header && preg_match('/^Bearer\s+(it_[0-9a-f]{64})$/', trim($header), $m) ? $m[1] : null;
    }
}

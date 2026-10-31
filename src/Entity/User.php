<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;

#[ORM\Entity]
#[ORM\Table(name: 'app_user')]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\Column(length: 40, unique: true)]
    public string $username = '';

    #[ORM\Column]
    public string $password = '';

    /** Demo accounts are played by the server (app:demo:seed) so one person can test a full group. */
    #[ORM\Column]
    public bool $demo = false;

    #[ORM\Column]
    public int $createdAt = 0;

    #[ORM\Column]
    public int $lastSeenAt = 0;

    /** The hero this account is playing (src/Service/Roster.php); null means its first. */
    #[ORM\Column(nullable: true)]
    public ?int $activeHero = null;

    /** Optional until the player adds one; needed for password reset. Stored lower case. */
    #[ORM\Column(length: 180, unique: true, nullable: true)]
    public ?string $email = null;

    #[ORM\Column(options: ['default' => false])]
    public bool $emailVerified = false;

    /** One pending email action at a time: 'verify' or 'reset', the sha256 of its token and when it expires. */
    #[ORM\Column(length: 8, nullable: true)]
    public ?string $tokenKind = null;

    #[ORM\Column(length: 64, nullable: true)]
    public ?string $tokenHash = null;

    #[ORM\Column(options: ['default' => 0])]
    public int $tokenExpiresAt = 0;

    /** Moderators can read reports, mute players and remove messages (app:admin grants it). */
    #[ORM\Column(options: ['default' => false])]
    public bool $admin = false;

    /** Chat is read-only for this account until this time. */
    #[ORM\Column(options: ['default' => 0])]
    public int $mutedUntil = 0;

    /** The id the stores know this account by (RevenueCat app user id): random, so it says nothing about the player. */
    #[ORM\Column(length: 36, unique: true, nullable: true)]
    public ?string $billingId = null;

    /** The linked Steam account (SteamID64), for logging in from the Steam build and for Steam purchases. */
    #[ORM\Column(length: 20, unique: true, nullable: true)]
    public ?string $steamId = null;

    /** A supporter until this time (the shop's supporter pass): a star by their name, never any power. */
    #[ORM\Column(options: ['default' => 0])]
    public int $supporterUntil = 0;

    /** Season track points by season id (src/Game/Seasons.php). */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $seasonPoints = null;

    /** Season ids whose premium track this account bought. */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $seasonPremium = null;

    /** When this account first reached each step of the first days (src/Game/Funnel.php). */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $funnel = null;

    /** Hero ids whose chat lines and invites this player never sees. */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $blocked = null;

    public function getUserIdentifier(): string
    {
        return $this->username;
    }

    public function getRoles(): array
    {
        return $this->admin ? ['ROLE_USER', 'ROLE_ADMIN'] : ['ROLE_USER'];
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function isSupporter(?int $now = null): bool
    {
        return $this->supporterUntil > ($now ?? time());
    }

    public function isMuted(?int $now = null): bool
    {
        return $this->mutedUntil > ($now ?? time());
    }

    /** @return int[] */
    public function blockedIds(): array
    {
        return array_map('intval', $this->blocked ?? []);
    }

    public function eraseCredentials(): void
    {
    }
}

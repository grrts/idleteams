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

    public function getUserIdentifier(): string
    {
        return $this->username;
    }

    public function getRoles(): array
    {
        return ['ROLE_USER'];
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function eraseCredentials(): void
    {
    }
}

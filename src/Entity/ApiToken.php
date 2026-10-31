<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * A login for the native apps (iOS, Android, Steam), which cannot rely on the browser's session cookie. Only the
 * sha256 of the token is stored; the app keeps the token itself and sends it as "Authorization: Bearer ...".
 */
#[ORM\Entity]
class ApiToken
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public User $user;

    #[ORM\Column(length: 64, unique: true)]
    public string $hash = '';

    /** ios, android, steam or web. */
    #[ORM\Column(length: 12)]
    public string $platform = '';

    #[ORM\Column]
    public int $createdAt = 0;

    #[ORM\Column]
    public int $lastUsedAt = 0;
}

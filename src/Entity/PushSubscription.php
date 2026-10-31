<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/** One browser or phone that asked for notifications (Web Push). */
#[ORM\Entity]
class PushSubscription
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public User $user;

    #[ORM\Column(length: 500, unique: true)]
    public string $endpoint = '';

    #[ORM\Column]
    public int $createdAt = 0;

    /** Failed sends in a row; the subscription is dropped when the push service says it is gone. */
    #[ORM\Column(options: ['default' => 0])]
    public int $failures = 0;
}

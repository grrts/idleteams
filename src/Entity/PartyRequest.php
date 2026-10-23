<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/** An invite from a group to a hero, or an application from a hero to a group. Waits until the other side opens the game. */
#[ORM\Entity]
class PartyRequest
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Party::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public Party $party;

    #[ORM\ManyToOne(targetEntity: Hero::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public Hero $hero;

    /** invite (group asks hero) or application (hero asks group). */
    #[ORM\Column(length: 12)]
    public string $kind = 'invite';

    #[ORM\Column(length: 200)]
    public string $message = '';

    #[ORM\Column]
    public int $createdAt = 0;
}

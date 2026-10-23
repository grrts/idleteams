<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/** A tavern board listing: a group looking for members (lfm) or a hero looking for a group (lfg). */
#[ORM\Entity]
class TavernPost
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Hero::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public Hero $author;

    #[ORM\ManyToOne(targetEntity: Party::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    public ?Party $party = null;

    #[ORM\Column(length: 8)]
    public string $kind = 'lfg';

    #[ORM\Column(length: 200)]
    public string $text = '';

    /** Roles wanted (lfm) or offered (lfg). */
    #[ORM\Column(type: 'json')]
    public array $roles = [];

    #[ORM\Column]
    public int $createdAt = 0;
}

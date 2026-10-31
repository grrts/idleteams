<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

/** A group of five real players who picked each other. */
#[ORM\Entity]
class Party
{
    public const SIZE = 5;

    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\Column(length: 40)]
    public string $name = '';

    #[ORM\ManyToOne(targetEntity: Hero::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    public ?Hero $leader = null;

    /** Dungeon level relative to the group's median level: -3 (easy) to +5 (push). */
    #[ORM\Column]
    public int $dungeonOffset = 0;

    /** The dungeon the leader picked, or null for the newest one the group has reached. */
    #[ORM\Column(length: 40, nullable: true)]
    public ?string $dungeon = null;

    /** Battles chain automatically while this is true. */
    #[ORM\Column]
    public bool $running = true;

    /** Battles the group has finished together; feeds the bond level. */
    #[ORM\Column]
    public int $battlesTogether = 0;

    #[ORM\Column]
    public int $createdAt = 0;

    /** @var Collection<int, Hero> */
    #[ORM\OneToMany(targetEntity: Hero::class, mappedBy: 'party')]
    public Collection $members;

    public function __construct()
    {
        $this->members = new ArrayCollection();
    }
}

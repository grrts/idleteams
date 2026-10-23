<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class Guild
{
    public const MAX_MEMBERS = 100;

    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\Column(length: 32, unique: true)]
    public string $name = '';

    #[ORM\Column(length: 4)]
    public string $tag = '';

    #[ORM\Column(length: 160)]
    public string $motto = '';

    /** Guild XP from members' clears; guild levels unlock cosmetic perks, never combat stats. */
    #[ORM\Column]
    public int $xp = 0;

    #[ORM\Column]
    public int $createdAt = 0;

    /** @var Collection<int, Hero> */
    #[ORM\OneToMany(targetEntity: Hero::class, mappedBy: 'guild')]
    public Collection $members;

    public function __construct()
    {
        $this->members = new ArrayCollection();
    }
}

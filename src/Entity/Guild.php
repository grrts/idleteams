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

    /** Pinned by the leader or an officer (the notice board, guild level 2). */
    #[ORM\Column(length: 400, options: ['default' => ''])]
    public string $notice = '';

    /** Gold in the bank. */
    #[ORM\Column(type: 'bigint', options: ['default' => 0])]
    public string $bankGold = '0';

    /** The latest bank moves, newest first: [time, hero name, hero id, what, item name or gold]. */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $bankLog = null;

    /** The week the goals belong to (src/Game/Modes.php week), the goals, and who helped: hero id => points. */
    #[ORM\Column(options: ['default' => 0])]
    public int $week = 0;

    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $goals = null;

    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $helpers = null;

    /** Records for the trophy wall: bestMythic [tier, dungeon, names], heroic clears, bosses, goals finished. */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $trophies = null;

    /** @var Collection<int, Hero> */
    #[ORM\OneToMany(targetEntity: Hero::class, mappedBy: 'guild')]
    public Collection $members;

    public function __construct()
    {
        $this->members = new ArrayCollection();
    }
}

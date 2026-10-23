<?php

namespace App\Entity;

use App\Game\Rules;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class Hero
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\OneToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public User $user;

    #[ORM\Column(length: 24, unique: true)]
    public string $name = '';

    // Permanent choices
    #[ORM\Column(length: 16)]
    public string $race = 'human';

    #[ORM\Column(length: 16)]
    public string $cls = 'guardian';

    #[ORM\Column(length: 16)]
    public string $origin = 'anvil';

    #[ORM\Column(length: 16, nullable: true)]
    public ?string $path = null;

    /** True once Oath Day (level 20) has locked the Path and the points spent so far. */
    #[ORM\Column]
    public bool $oathTaken = false;

    /** Appearance read by the pixel renderer: skin, hair, hairColor, eyes, eyeColor, mouth, beard, acc, build, height, dye1, dye2, metal. */
    #[ORM\Column(type: 'json')]
    public array $look = [];

    #[ORM\Column]
    public int $level = 1;

    #[ORM\Column(type: 'bigint')]
    public string $xp = '0';

    /** Attribute points the player spent: attr => points. Race, class and Origin points are derived. */
    #[ORM\Column(type: 'json')]
    public array $spent = [];

    /** Points carved in at Oath Day; they can't be refunded. */
    #[ORM\Column(type: 'json')]
    public array $carved = [];

    #[ORM\Column(type: 'json')]
    public array $skillRanks = [];

    /** Up to four active skill ids; the ultimate is always slotted once unlocked. */
    #[ORM\Column(type: 'json')]
    public array $loadout = [];

    /** Keystone level => keystone id. */
    #[ORM\Column(type: 'json')]
    public array $keystones = [];

    /** Legendary powers found, kept forever. */
    #[ORM\Column(type: 'json')]
    public array $codex = [];

    #[ORM\Column(type: 'json')]
    public array $marks = [];

    /** Career counters: battles, dungeons (full clears), bossKills, deaths, legendaries. */
    #[ORM\Column(type: 'json')]
    public array $career = [];

    #[ORM\Column(type: 'bigint')]
    public string $gold = '0';

    #[ORM\Column]
    public int $materials = 0;

    #[ORM\Column]
    public int $essence = 0;

    /** How the server rolls for you when you don't: upgrades (need on upgrades, greed the rest), greed, pass. */
    #[ORM\Column(length: 12)]
    public string $lootPolicy = 'upgrades';

    #[ORM\ManyToOne(targetEntity: Party::class, inversedBy: 'members')]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    public ?Party $party = null;

    #[ORM\ManyToOne(targetEntity: Guild::class, inversedBy: 'members')]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    public ?Guild $guild = null;

    #[ORM\Column(length: 12)]
    public string $guildRank = 'member';

    #[ORM\Column]
    public int $createdAt = 0;

    public function role(): string
    {
        return Rules::role($this->cls);
    }

    public function totalPoints(): int
    {
        return ($this->level - 1) * Rules::POINTS_PER_LEVEL;
    }

    public function unspentPoints(): int
    {
        return $this->totalPoints() - array_sum($this->spent);
    }

    public function skillPoints(): int
    {
        $spent = 0;
        foreach ($this->skillRanks as $r) {
            $spent += max(0, $r - 1);
        }

        return ($this->level - 1) - $spent;
    }
}

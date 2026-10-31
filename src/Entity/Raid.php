<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * A guild raid night (src/Game/Raids.php): planned by an officer, signed up for by members, put into squads and
 * fronts on the planner, then fought all at once.
 */
#[ORM\Entity]
#[ORM\Index(columns: ['guild_id', 'state'])]
class Raid
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Guild::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public Guild $guild;

    /** Which raid (content/<pack>/raids/<id>.json). */
    #[ORM\Column(length: 40)]
    public string $raid = '';

    /** planning or done. */
    #[ORM\Column(length: 10)]
    public string $state = 'planning';

    /** When the officers mean to start; shown to members, the start itself is by hand. */
    #[ORM\Column]
    public int $startsAt = 0;

    /** hero id => role they signed up as. */
    #[ORM\Column(type: 'json')]
    public array $signups = [];

    /** Up to eight squads of up to five hero ids, and the front each squad takes. */
    #[ORM\Column(type: 'json')]
    public array $squads = [];

    #[ORM\Column(type: 'json')]
    public array $fronts = [];

    /** The outcome: fronts, the final fight and rewards. */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $report = null;

    #[ORM\Column]
    public int $week = 0;

    #[ORM\Column]
    public int $createdAt = 0;
}

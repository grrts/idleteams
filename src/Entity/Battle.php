<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * One long battle: several dungeon clears in a row, simulated on the server when it starts and played back
 * on every member's screen in step with the clock. Results land when it ends; the group chest opens then.
 */
#[ORM\Entity]
#[ORM\Index(columns: ['state', 'ends_at'])]
class Battle
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Party::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public Party $party;

    /** running, chest (results applied, rolls open) or done. */
    #[ORM\Column(length: 8)]
    public string $state = 'running';

    #[ORM\Column]
    public int $seed = 0;

    #[ORM\Column]
    public int $dungeonLevel = 1;

    #[ORM\Column]
    public int $startedAt = 0;

    #[ORM\Column]
    public int $endsAt = 0;

    #[ORM\Column]
    public int $chestClosesAt = 0;

    /** Who fought, as they looked and were geared at the start. */
    #[ORM\Column(type: 'json')]
    public array $roster = [];

    /** Compact timeline for playback; cleared once the battle is done to save space. */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $timeline = null;

    #[ORM\Column(type: 'json')]
    public array $report = [];

    /** Items in the group chest with everyone's rolls: [{spec, rolls: {heroId: need|greed|pass}, winner}] */
    #[ORM\Column(type: 'json')]
    public array $chest = [];
}

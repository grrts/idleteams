<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * One week's world raid of a season (src/Service/WorldRaids.php): groups sign up as squads until it starts, then the
 * cron tick fights it for all of them at once.
 */
#[ORM\Entity]
#[ORM\UniqueConstraint(columns: ['season', 'week'])]
class WorldRaid
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\Column(length: 20)]
    public string $season = '';

    #[ORM\Column]
    public int $week = 0;

    #[ORM\Column]
    public int $startsAt = 0;

    /** open or done. */
    #[ORM\Column(length: 10)]
    public string $state = 'open';

    /** Party id => the hero ids that signed up with it. */
    #[ORM\Column(type: 'json')]
    public array $squads = [];

    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $report = null;
}

<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * Something that happened while the player was away: a wipe, loot to roll on, a level, an invite. Pushes carry no
 * data; the service worker fetches the notices it should show from /api/notices/push.
 */
#[ORM\Entity]
#[ORM\Index(columns: ['pushed_at', 'id'])]
class Notice
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public User $user;

    /** wipe, loot, level, invite, apply. Notifications of one kind replace each other on the device. */
    #[ORM\Column(length: 16)]
    public string $kind = '';

    #[ORM\Column(length: 80)]
    public string $title = '';

    #[ORM\Column(length: 200)]
    public string $body = '';

    /** Where tapping it leads, a hash route such as #/battle. */
    #[ORM\Column(length: 80)]
    public string $url = '#/battle';

    #[ORM\Column]
    public int $createdAt = 0;

    /** 0 until the push went out (or was skipped because the player was in the game). */
    #[ORM\Column(options: ['default' => 0])]
    public int $pushedAt = 0;

    /** When a device showed it. */
    #[ORM\Column(options: ['default' => 0])]
    public int $shownAt = 0;
}

<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/** A player flagged a chat line. Moderators see open reports; enough reports in a day mute the author until reviewed. */
#[ORM\Entity]
#[ORM\Index(columns: ['resolved_at', 'id'])]
#[ORM\UniqueConstraint(columns: ['message_id', 'reporter_id'])]
class ChatReport
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\ManyToOne(targetEntity: ChatMessage::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public ChatMessage $message;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public User $reporter;

    /** The account that wrote the line, kept so a report survives the hero being renamed or deleted. */
    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    public User $target;

    /** The line as it was when reported. */
    #[ORM\Column(length: 500)]
    public string $body = '';

    #[ORM\Column(length: 200)]
    public string $reason = '';

    #[ORM\Column]
    public int $createdAt = 0;

    /** 0 while open. */
    #[ORM\Column]
    public int $resolvedAt = 0;

    #[ORM\Column(length: 16, nullable: true)]
    public ?string $outcome = null;
}

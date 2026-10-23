<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Index(columns: ['channel', 'id'])]
class ChatMessage
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    /** tavern, guild:{id} or party:{id}. */
    #[ORM\Column(length: 24)]
    public string $channel = 'tavern';

    /** Null for messages the game posts itself (drops, Oath Day, wipes). */
    #[ORM\ManyToOne(targetEntity: Hero::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    public ?Hero $author = null;

    #[ORM\Column(length: 500)]
    public string $body = '';

    /** Optional shareable card: {type: item|report|hero, ...}. */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $card = null;

    #[ORM\Column]
    public int $createdAt = 0;
}

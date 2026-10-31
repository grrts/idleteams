<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/** Items are never bound: any hero can own, wear, give or sell any item. Glyphs are items with slot "glyph". */
#[ORM\Entity]
#[ORM\Index(columns: ['price'])]
class Item
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Hero::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    public ?Hero $owner = null;

    #[ORM\Column(length: 12)]
    public string $slot = 'weapon';

    #[ORM\Column(length: 16)]
    public string $base = 'sword';

    #[ORM\Column(length: 12)]
    public string $rarity = 'common';

    #[ORM\Column]
    public int $ilvl = 1;

    /** [[attribute, value], ...] */
    #[ORM\Column(type: 'json')]
    public array $affixes = [];

    #[ORM\Column]
    public int $sockets = 0;

    /** Socketed glyphs: [[theme, value] or null, ...], one entry per socket. */
    #[ORM\Column(type: 'json')]
    public array $glyphs = [];

    /** A legendary item's own power; it is also copied into the finder's Codex. */
    #[ORM\Column(length: 20, nullable: true)]
    public ?string $power = null;

    /** A Codex power imprinted on this item. */
    #[ORM\Column(length: 20, nullable: true)]
    public ?string $imprint = null;

    #[ORM\Column]
    public int $temper = 0;

    #[ORM\Column]
    public int $seed = 0;

    /** Colours the owner dyed it: [cloth, trim, metal]. */
    #[ORM\Column(type: 'json', nullable: true)]
    public ?array $dye = null;

    /** Slot the item is worn in (ring1/ring2 for rings), or null in the bag. */
    #[ORM\Column(length: 12, nullable: true)]
    public ?string $equipped = null;

    /** Market price in gold while listed. */
    #[ORM\Column(type: 'bigint', nullable: true)]
    public ?string $price = null;

    #[ORM\Column]
    public int $createdAt = 0;
}

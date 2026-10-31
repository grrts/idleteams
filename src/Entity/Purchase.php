<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * One purchase in the shop (src/Service/Shop.php), from any store: the App Store and Google Play through RevenueCat,
 * or Steam. A pending row records the player's consent before the store's purchase sheet opens; the store's own
 * transaction pays it. Purchases outlive a deleted account (without the account) because tax law asks for the records.
 */
#[ORM\Entity]
class Purchase
{
    #[ORM\Id, ORM\GeneratedValue, ORM\Column]
    public ?int $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    public ?User $user = null;

    /** The offer id (content/<pack>/shop/*.json), and for the season track the season it is for. */
    #[ORM\Column(length: 40)]
    public string $offer = '';

    #[ORM\Column(length: 20, nullable: true)]
    public ?string $season = null;

    /** Price in cents, and the currency. */
    #[ORM\Column]
    public int $amount = 0;

    #[ORM\Column(length: 3)]
    public string $currency = 'eur';

    /** pending, paid or refunded. */
    #[ORM\Column(length: 10)]
    public string $state = 'pending';

    /** app_store, play_store, steam (or another RevenueCat store name), once known. */
    #[ORM\Column(length: 20, nullable: true)]
    public ?string $store = null;

    /** The store's product id (content/<pack>/shop/*.json "product"). */
    #[ORM\Column(length: 80, options: ['default' => ''])]
    public string $product = '';

    /** The store's transaction or order id, prefixed with the store: one row per real purchase. */
    #[ORM\Column(length: 255, unique: true, nullable: true)]
    public ?string $transactionId = null;

    /** Made in a store's test mode (RevenueCat sandbox); kept apart from real money. */
    #[ORM\Column(options: ['default' => false])]
    public bool $sandbox = false;

    /** The player asked for delivery at once and accepted that the right of withdrawal ends with it. */
    #[ORM\Column(options: ['default' => 0])]
    public int $waivedWithdrawalAt = 0;

    #[ORM\Column]
    public int $createdAt = 0;

    #[ORM\Column(options: ['default' => 0])]
    public int $paidAt = 0;
}

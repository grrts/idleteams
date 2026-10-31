<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * One purchase in the shop (src/Service/Shop.php). It is made when checkout starts and paid by the payment provider's
 * webhook. Purchases outlive a deleted account (without the account) because tax law asks for the records.
 */
#[ORM\Entity]
#[ORM\Index(columns: ['payment_intent'])]
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

    #[ORM\Column(length: 255, unique: true, nullable: true)]
    public ?string $checkoutSession = null;

    #[ORM\Column(name: 'payment_intent', length: 255, nullable: true)]
    public ?string $paymentIntent = null;

    /** The player asked for delivery at once and accepted that the right of withdrawal ends with it. */
    #[ORM\Column(options: ['default' => 0])]
    public int $waivedWithdrawalAt = 0;

    #[ORM\Column]
    public int $createdAt = 0;

    #[ORM\Column(options: ['default' => 0])]
    public int $paidAt = 0;
}

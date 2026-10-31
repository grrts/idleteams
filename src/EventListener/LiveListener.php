<?php

namespace App\EventListener;

use App\Entity\Battle;
use App\Entity\ChatMessage;
use App\Entity\Hero;
use App\Entity\Item;
use App\Entity\Notice;
use App\Entity\Party;
use App\Entity\PartyRequest;
use App\Service\Live;
use Doctrine\Bundle\DoctrineBundle\Attribute\AsDoctrineListener;
use Doctrine\ORM\Event\OnFlushEventArgs;
use Doctrine\ORM\Events;
use Symfony\Component\Console\ConsoleEvents;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\KernelEvents;

/**
 * Watches what the game writes and turns it into live pings: one place instead of a call in every action. Pings go
 * out after the response (or at the end of a console command), once per topic.
 */
#[AsDoctrineListener(event: Events::onFlush)]
#[AsEventListener(event: KernelEvents::TERMINATE, method: 'send')]
#[AsEventListener(event: ConsoleEvents::TERMINATE, method: 'send')]
final class LiveListener
{
    public function __construct(private Live $live)
    {
    }

    public function onFlush(OnFlushEventArgs $args): void
    {
        $uow = $args->getObjectManager()->getUnitOfWork();
        foreach ([$uow->getScheduledEntityInsertions(), $uow->getScheduledEntityUpdates(), $uow->getScheduledEntityDeletions()] as $n => $list) {
            foreach ($list as $e) {
                match (true) {
                    $e instanceof ChatMessage => $this->live->chat($e->channel),
                    $e instanceof Battle => $this->live->party($e->party->id),
                    $e instanceof Party => $this->live->party($e->id),
                    $e instanceof PartyRequest => $this->request($e),
                    $e instanceof Notice => $this->live->user($e->user->id),
                    $e instanceof Hero && $n === 1 => $this->hero($e, $uow->getEntityChangeSet($e)),
                    $e instanceof Item && $n === 1 && isset($uow->getEntityChangeSet($e)['owner']) => $this->live->user($e->owner?->user->id),
                    default => null,
                };
            }
        }
    }

    private function request(PartyRequest $r): void
    {
        $this->live->party($r->party->id);
        $this->live->user($r->hero->user->id);
    }

    /** A hero joining or leaving a group or guild changes what its old and new members see. */
    private function hero(Hero $h, array $changes): void
    {
        if (isset($changes['party'])) {
            [$old, $new] = $changes['party'];
            $this->live->party($old?->id);
            $this->live->party($new?->id);
            $this->live->user($h->user->id);
        }
        if (isset($changes['guild'])) {
            $this->live->user($h->user->id);
        }
    }

    public function send(): void
    {
        $this->live->flush();
    }
}

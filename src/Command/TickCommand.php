<?php

namespace App\Command;

use App\Entity\Battle;
use App\Entity\Party;
use App\Service\Bots;
use App\Service\Game;
use App\Service\Notifier;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * Run from cron every minute: * * * * * php /path/to/bin/console app:tick
 * Settles finished battles and closed chests, chains the next battle for groups within the offline cap,
 * and lets demo heroes act. The game also moves forward whenever a player opens it, so a missed tick only
 * delays chat lines and chest results, never rewards.
 */
#[AsCommand('app:tick', 'Advance every group: settle battles and chests, start the next battle')]
final class TickCommand extends Command
{
    public function __construct(private EntityManagerInterface $em, private Game $game, private Bots $bots, private Notifier $notifier)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $now = time();
        $ids = $this->em->createQueryBuilder()->select('DISTINCT IDENTITY(b.party)')->from(Battle::class, 'b')
            ->where("b.state = 'chest' OR (b.state = 'running' AND b.endsAt <= :now)")->setParameter('now', $now)
            ->getQuery()->getSingleColumnResult();
        $running = $this->em->createQueryBuilder()->select('p.id')->from(Party::class, 'p')->where('p.running = true')
            ->getQuery()->getSingleColumnResult();
        $done = 0;
        foreach (array_unique([...$ids, ...$running]) as $id) {
            $party = $this->em->find(Party::class, $id);
            if (!$party) {
                continue;
            }
            $this->em->wrapInTransaction(fn () => $this->game->progress($party, $now));
            ++$done;
        }
        foreach ($this->bots->demoHeroes() as $h) {
            $this->bots->think($h);
        }
        $this->bots->chatter();
        $this->em->flush();
        $pushed = $this->notifier->deliver($now);
        $this->notifier->prune($now);
        $output->writeln(sprintf('Advanced %d group(s), sent %d push(es).', $done, $pushed));

        return Command::SUCCESS;
    }
}

<?php

namespace App\Command;

use App\Game\Funnel;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/** The first-day funnel by sign-up day: php bin/console app:funnel --days=14 */
#[AsCommand('app:funnel', 'How far new players got, by the day they signed up')]
final class FunnelCommand extends Command
{
    public function __construct(private EntityManagerInterface $em)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('days', null, InputOption::VALUE_REQUIRED, 'Sign-up days to show', '14');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $rows = Funnel::cohorts($this->em->createQuery('SELECT u.createdAt, u.funnel FROM App\Entity\User u WHERE u.demo = false AND u.createdAt >= :since')
            ->setParameter('since', time() - 86400 * (int) $input->getOption('days'))->toIterable());
        if (!$rows) {
            $io->note('Nobody signed up in that time.');

            return Command::SUCCESS;
        }
        $io->table(['Day', 'Players', ...array_values(Funnel::STEPS)], array_map(fn ($c) => [
            $c['day'], $c['users'], ...array_map(fn ($s) => sprintf('%d%%', round(100 * $s['all'] / $c['users'])), array_values($c['steps'])),
        ], $rows));

        return Command::SUCCESS;
    }
}

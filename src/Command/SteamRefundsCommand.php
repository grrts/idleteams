<?php

namespace App\Command;

use App\Service\Steam;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Takes back what Steam refunded or charged back. Steam has no refund webhook, so run this from cron, say hourly:
 * php bin/console app:steam-refunds. It remembers how far it read in var/steam-refunds.json.
 */
#[AsCommand('app:steam-refunds', 'Take back Steam purchases that were refunded or charged back')]
final class SteamRefundsCommand extends Command
{
    public function __construct(private Steam $steam, private EntityManagerInterface $em, #[Autowire('%kernel.project_dir%/var/steam-refunds.json')] private string $state)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('since', null, InputOption::VALUE_REQUIRED, 'Read from this time (anything strtotime takes) instead of where it stopped last time');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        if (!$this->steam->configured()) {
            $output->writeln('Steam is not set up (STEAM_WEB_API_KEY, STEAM_APP_ID); nothing to do.');

            return Command::SUCCESS;
        }
        $since = $input->getOption('since') !== null ? (int) strtotime((string) $input->getOption('since'))
            : (int) (json_decode((string) @file_get_contents($this->state), true)['next'] ?? time() - 7 * 86400);
        $r = $this->steam->refunds($since);
        $this->em->flush();
        file_put_contents($this->state, json_encode(['next' => $r['next']]));
        $output->writeln(sprintf('Took back %d refunded purchase(s); next run reads from %s.', $r['refunded'], gmdate('Y-m-d H:i', $r['next'])));

        return Command::SUCCESS;
    }
}

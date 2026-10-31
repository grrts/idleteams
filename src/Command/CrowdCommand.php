<?php

namespace App\Command;

use App\Game\Art;
use App\Game\Crowd;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/** Phase 4 gate: a random 250-hero crowd has under 1% exact look duplicates. */
#[AsCommand(name: 'app:crowd', description: 'Count look duplicates in random crowds of heroes')]
class CrowdCommand extends Command
{
    protected function configure(): void
    {
        $this->addOption('size', null, InputOption::VALUE_REQUIRED, 'Heroes per crowd', 250)
            ->addOption('crowds', null, InputOption::VALUE_REQUIRED, 'Crowds to average over', 40)
            ->addOption('max', null, InputOption::VALUE_REQUIRED, 'Largest share of exact duplicates that passes', 0.01);
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $size = (int) $input->getOption('size');
        $n = (int) $input->getOption('crowds');
        $exact = $shape = 0.0;
        $worst = 0;
        for ($i = 1; $i <= $n; ++$i) {
            $d = Crowd::duplicates(Crowd::make($size, $i));
            $exact += $d['exact'] / $size / $n;
            $shape += $d['shape'] / $size / $n;
            $worst = max($worst, $d['exact']);
        }
        $parts = array_map('count', Art::all()['parts']);
        $io->text(sprintf('Art: %s.', implode(', ', array_map(fn ($k, $v) => "$v $k", array_keys($parts), $parts))));
        $io->text(sprintf('%d crowds of %d heroes: %.2f%% look exactly like someone else (worst crowd: %d heroes); %.1f%% share a silhouette, colours aside.', $n, $size, 100 * $exact, $worst, 100 * $shape));
        $max = (float) $input->getOption('max');
        if ($exact > $max) {
            $io->error(sprintf('%.2f%% exact duplicates, over the %.2f%% limit.', 100 * $exact, 100 * $max));

            return Command::FAILURE;
        }
        $io->success(sprintf('Under %.0f%% exact duplicates.', 100 * $max));

        return Command::SUCCESS;
    }
}

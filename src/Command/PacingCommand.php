<?php

namespace App\Command;

use App\Game\Combatants;
use App\Game\Dungeons;
use App\Game\Reference;
use App\Game\Rules;
use App\Game\Simulator;
use App\Game\Stats;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * The promise of the first week, checked: a reference group of five plays on the production clock (3-hour runs, a
 * 12-hour offline cap, a wipe stops the chain until someone checks in) and levels with the real XP rules, dungeons,
 * bands and simulator. Gear follows the reference build for each level, which assumes players keep up.
 */
#[AsCommand('app:pacing', 'Simulate how fast a group levels on the production clock')]
final class PacingCommand extends Command
{
    protected function configure(): void
    {
        $this->addOption('days', null, InputOption::VALUE_REQUIRED, 'Days to simulate', '10')
            ->addOption('checkins', null, InputOption::VALUE_REQUIRED, 'Hours of the day someone in the group looks in', '8,12,18,22')
            ->addOption('battle', null, InputOption::VALUE_REQUIRED, 'Seconds per run', '10800')
            ->addOption('cap', null, InputOption::VALUE_REQUIRED, 'Offline cap in seconds', '43200')
            ->addOption('target', null, InputOption::VALUE_REQUIRED, 'Days to level 50 that pass, as from-to', '6-8')
            ->addOption('seed', null, InputOption::VALUE_REQUIRED, 'Random seed for the runs', '1');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $battle = (int) $input->getOption('battle');
        $cap = (int) $input->getOption('cap');
        $checkins = array_map('intval', explode(',', (string) $input->getOption('checkins')));
        $end = 86400 * (int) $input->getOption('days');
        $seed = (int) $input->getOption('seed');

        $level = 1;
        $xp = 0;
        $together = 0;
        $t = 8 * 3600; // the group forms at 8 in the morning
        $lastSeen = $t;
        $running = true;
        $reached = [];
        $daily = [];
        $wipes = 0;
        $runs = 0;
        $seen = fn (int $at) => max(array_filter(array_map(fn ($h) => 86400 * intdiv($at, 86400) + 3600 * $h, $checkins), fn ($x) => $x <= $at) ?: [86400 * (intdiv($at, 86400) - 1) + 3600 * max($checkins)]);
        // $lastSeen follows the latest check-in before now; the offline cap counts from there.
        while ($t < $end) {
            $lastSeen = max($lastSeen, $seen($t));
            if (!$running) {
                // Someone checks in, fixes what they need and sends the group back in.
                $next = $this->nextCheckin($t, $checkins);
                $t = $next;
                $lastSeen = $next;
                $running = true;
                continue;
            }
            if ($t >= $lastSeen + $cap) {
                $t = $this->nextCheckin($t, $checkins);
                continue;
            }
            $d = Dungeons::newest($level);
            $dl = Dungeons::clamp($d, $level);
            $party = [];
            foreach (Reference::COMP as $n => $cls) {
                $b = Reference::build($cls, min($level, $dl + 5));
                $b['path'] = $b['level'] >= Rules::PATH_LEVEL ? array_key_first(Rules::CLASSES[$cls]['paths']) : null;
                $party[] = Combatants::make($b, $n + 1, $cls.$n);
            }
            $rep = (new Simulator())->run($party, $dl, $seed * 1_000_003 + $runs, $d)['report'];
            ++$runs;
            $stats = Stats::derive(Reference::build('cleric', $level));
            $xp += Rules::battleXp($dl, Dungeons::units($d, $rep), 'elf', $together, $stats['xpBonus']);
            ++$together;
            while ($xp >= Rules::xpForLevel($level)) {
                $xp -= Rules::xpForLevel($level);
                ++$level;
                foreach ([10, 20, 30, 40, 50] as $m) {
                    if ($level === $m && !isset($reached[$m])) {
                        $reached[$m] = $t + $battle;
                    }
                }
            }
            $t += $battle;
            $day = intdiv($t, 86400) + 1;
            $daily[$day] = ['day' => $day, 'level' => $level, 'runs' => ($daily[$day]['runs'] ?? 0) + 1, 'wipes' => ($daily[$day]['wipes'] ?? 0) + ($rep['wiped'] ? 1 : 0), 'dungeon' => $d['name']];
            if ($rep['wiped']) {
                ++$wipes;
                $running = false;
            }
        }

        $io->table(['Day', 'Level at end', 'Runs', 'Wipes', 'Dungeon'], array_map(fn ($r) => array_values($r), array_values($daily)));
        $io->writeln(sprintf('%d runs, %d wipes. Milestones: %s', $runs, $wipes, implode(', ', array_map(fn ($m, $at) => sprintf('level %d on day %.1f', $m, $at / 86400), array_keys($reached), $reached)) ?: 'none'));
        [$from, $to] = array_map('floatval', explode('-', (string) $input->getOption('target')));
        $day50 = isset($reached[50]) ? $reached[50] / 86400 : null;
        if ($day50 === null || $day50 < $from || $day50 > $to) {
            $io->error(sprintf('Level 50 %s, outside the %s day target.', $day50 === null ? 'was not reached' : sprintf('came on day %.1f', $day50), $input->getOption('target')));

            return Command::FAILURE;
        }
        $io->success(sprintf('Level 50 on day %.1f, inside the %s day target.', $day50, $input->getOption('target')));

        return Command::SUCCESS;
    }

    private function nextCheckin(int $t, array $hours): int
    {
        $base = 86400 * intdiv($t, 86400);
        foreach ([0, 1] as $add) {
            foreach ($hours as $h) {
                $at = $base + 86400 * $add + 3600 * $h;
                if ($at > $t) {
                    return $at;
                }
            }
        }

        return $t + 86400;
    }
}

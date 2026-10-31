<?php

namespace App\Command;

use App\Game\Combatants;
use App\Game\Reference;
use App\Game\Simulator;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/** Runs many simulated battles per party mix to check the role design holds at several levels. */
#[AsCommand(name: 'app:balance', description: 'Simulate battles for several party mixes and report clear rates')]
class BalanceCommand extends Command
{
    protected function configure(): void
    {
        $this->addOption('runs', null, InputOption::VALUE_REQUIRED, 'Battles per mix and level', 40)
            ->addOption('levels', null, InputOption::VALUE_REQUIRED, 'Comma-separated levels', '1,10,20,35,50,80');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $mixes = [
            'balanced (G, C, R, M, Ro)' => ['guardian', 'cleric', 'ranger', 'mage', 'rogue'],
            'warden + druid' => ['warden', 'druid', 'ranger', 'mage', 'rogue'],
            'no tank (C + 4 dps)' => ['cleric', 'ranger', 'mage', 'rogue', 'ranger'],
            'no healer (G + 4 dps)' => ['guardian', 'ranger', 'mage', 'rogue', 'mage'],
            'five dps' => ['ranger', 'mage', 'rogue', 'ranger', 'mage'],
        ];
        $runs = (int) $input->getOption('runs');
        $rows = [];
        foreach (explode(',', $input->getOption('levels')) as $level) {
            $level = (int) $level;
            foreach ($mixes as $label => $classes) {
                $clears = 0;
                $full = 0;
                $causes = [];
                $len = 0;
                for ($k = 0; $k < $runs; ++$k) {
                    $party = [];
                    foreach ($classes as $n => $cls) {
                        $b = Reference::build($cls, $level);
                        $b['path'] = $level >= 10 ? array_key_first(\App\Game\Rules::CLASSES[$cls]['paths']) : null;
                        $party[] = Combatants::make($b, $n + 1, ucfirst($cls).$n);
                    }
                    $res = (new Simulator())->run($party, $level, 1000 + $k);
                    $clears += $res['report']['bossesKilled'];
                    $full += $res['report']['wiped'] ? 0 : 1;
                    $len += $res['report']['length'];
                    if ($res['report']['cause']) {
                        $key = preg_replace('/[A-Z][a-z]+\d.*?(died|pulled|ran)/', 'X $1', $res['report']['cause']);
                        $key = preg_replace('/at [\d:]+/', 'at N', $key);
                        $causes[$key] = ($causes[$key] ?? 0) + 1;
                    }
                }
                arsort($causes);
                $rows[] = [$level, $label, round(100 * $full / $runs).'%', round($clears / $runs, 1), round($len / $runs), substr((string) array_key_first($causes), 0, 90)];
            }
        }
        $io->table(['Level', 'Mix', 'Full clear', 'Avg bosses', 'Sim s', 'Top wipe cause'], $rows);

        return Command::SUCCESS;
    }
}

<?php

namespace App\Command;

use App\Entity\Battle;
use App\Entity\Hero;
use App\Entity\Party;
use App\Entity\User;
use App\Game\Heritage;
use App\Game\LifeStory;
use App\Game\Rules;
use App\Service\Game;
use App\Service\HeroActions;
use App\Service\Notifier;
use App\Service\Social;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * The Phase 2 gate in one command: fills a scratch database with groups of five players who keep coming back, then
 * runs the cron tick on a simulated clock (one battle length per step) and reports how long each tick took.
 * Run it against a copy, never the live database: php bin/console app:load-test --groups=200 --steps=20
 */
#[AsCommand('app:load-test', 'Simulate many groups and time the cron tick (scratch databases only)')]
final class LoadTestCommand extends Command
{
    private const COMPS = [
        ['guardian', 'cleric', 'ranger', 'mage', 'rogue'], ['warden', 'druid', 'rogue', 'ranger', 'mage'],
        ['guardian', 'druid', 'mage', 'mage', 'ranger'], ['warden', 'cleric', 'rogue', 'rogue', 'ranger'],
    ];

    public function __construct(private EntityManagerInterface $em, private HeroActions $heroes, private Social $social, private Game $game, private Notifier $notifier)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('groups', null, InputOption::VALUE_REQUIRED, 'Groups of five to create', '200')
            ->addOption('steps', null, InputOption::VALUE_REQUIRED, 'Ticks to run, one battle length apart', '10')
            ->addOption('slow', null, InputOption::VALUE_REQUIRED, 'A tick slower than this many seconds fails the test', '30');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $groups = (int) $input->getOption('groups');
        $existing = $this->em->getRepository(User::class)->count([]);
        $made = $this->em->createQuery("SELECT COUNT(u) FROM App\\Entity\\User u WHERE u.username LIKE 'load-%'")->getSingleScalarResult();
        if ($existing > $made) {
            $io->error('This database has real accounts. Run the load test on a scratch copy (DATABASE_URL=... php bin/console app:load-test).');

            return Command::FAILURE;
        }

        $now = time();
        $t0 = microtime(true);
        $have = (int) $this->em->createQuery('SELECT COUNT(p) FROM App\\Entity\\Party p')->getSingleScalarResult();
        for ($g = $have; $g < $groups; ++$g) {
            $team = [];
            foreach (self::COMPS[$g % count(self::COMPS)] as $k => $cls) {
                $u = new User();
                $u->username = sprintf('load-%d-%d', $g, $k);
                $u->password = '!';
                $u->createdAt = $u->lastSeenAt = $now;
                $this->em->persist($u);
                $race = array_keys(Rules::RACES)[($g + $k) % count(Rules::RACES)];
                $team[] = $this->heroes->create($u, ['name' => 'Lt '.self::alpha($g * 5 + $k), 'race' => $race, 'cls' => $cls,
                    'origin' => array_keys(Rules::ORIGINS)[($g * 3 + $k) % count(Rules::ORIGINS)],
                    'story' => LifeStory::example($race, array_keys(Heritage::backstories($race))[($g + $k) % 3])]);
            }
            $this->em->flush();
            $party = $this->social->createParty($team[0], 'Load '.$g);
            foreach (array_slice($team, 1) as $h) {
                $this->social->accept($h, $this->social->invite($team[0], $h, ''));
            }
            $this->em->flush();
            if ($g % 20 === 19) {
                $this->em->clear();
                $io->writeln(sprintf('  %d groups made', $g + 1));
            }
        }
        $io->writeln(sprintf('Made %d groups of five in %.1fs.', $groups, microtime(true) - $t0));

        $times = [];
        $step = $this->game->battleSeconds();
        $ids = $this->em->createQuery('SELECT p.id FROM App\\Entity\\Party p')->getSingleColumnResult();
        for ($s = 0; $s < (int) $input->getOption('steps'); ++$s) {
            $clock = $now + $s * $step + 1;
            // Players drop in now and then, so every group stays inside the offline cap.
            $this->em->createQuery('UPDATE App\\Entity\\User u SET u.lastSeenAt = :t')->setParameter('t', $clock - 30)->execute();
            $t = microtime(true);
            foreach ($ids as $id) {
                $party = $this->em->find(Party::class, $id);
                $this->em->wrapInTransaction(fn () => $this->game->progress($party, $clock));
                $this->em->clear();
            }
            $this->em->flush();
            $this->notifier->deliver($clock);
            $this->em->clear();
            $times[] = microtime(true) - $t;
            $io->writeln(sprintf('  tick %d: %.2fs, %.0f MB', $s + 1, end($times), memory_get_peak_usage(true) / 1048576));
        }
        $battles = $this->em->getRepository(Battle::class)->count([]);
        $heroes = $this->em->getRepository(Hero::class)->count([]);
        $max = $times ? max($times) : 0;
        $io->table(['Groups', 'Heroes', 'Battles', 'Ticks', 'Slowest tick', 'Average tick', 'Per group'], [[
            count($ids), $heroes, $battles, count($times), sprintf('%.2fs', $max), sprintf('%.2fs', $times ? array_sum($times) / count($times) : 0),
            sprintf('%.0f ms', $times && $ids ? 1000 * $max / count($ids) : 0),
        ]]);
        if ($max > (float) $input->getOption('slow')) {
            $io->error(sprintf('The slowest tick took %.1fs, over the %ss limit.', $max, $input->getOption('slow')));

            return Command::FAILURE;
        }
        $io->success('No slow tick.');

        return Command::SUCCESS;
    }

    private static function alpha(int $n): string
    {
        $s = '';
        do {
            $s = chr(97 + $n % 26).$s;
            $n = intdiv($n, 26);
        } while ($n > 0);

        return ucfirst(str_pad($s, 3, 'a', STR_PAD_LEFT));
    }
}

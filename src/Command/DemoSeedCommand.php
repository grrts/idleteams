<?php

namespace App\Command;

use App\Entity\Hero;
use App\Entity\User;
use App\Game\Heritage;
use App\Game\Items;
use App\Game\LifeStory;
use App\Service\Bots;
use App\Service\Game;
use App\Service\HeroActions;
use App\Service\Social;
use Doctrine\ORM\EntityManagerInterface;
use Random\Engine\Mt19937;
use Random\Randomizer;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;

/**
 * Fills an empty world so one person can try everything: a demo group with one open seat on the tavern board,
 * demo heroes looking for a group (invite them and they accept), a guild to join and a few market listings.
 * Demo heroes are played by the server (see Bots). Safe to run once on a fresh database.
 */
#[AsCommand('app:demo:seed', 'Create demo heroes, a demo group, a guild and market listings')]
final class DemoSeedCommand extends Command
{
    private const HEROES = [
        // name, race, class, origin, in the demo group
        ['Brannoc', 'dwarf', 'guardian', 'anvil', true],
        ['Sela', 'elf', 'cleric', 'lantern', true],
        ['Kira', 'felkin', 'rogue', 'fox', true],
        ['Ozric', 'draka', 'mage', 'ember', true],
        ['Thorn', 'orc', 'warden', 'wolf', false],
        ['Fen', 'elf', 'druid', 'tide', false],
        ['Ash', 'human', 'ranger', 'hawk', false],
        ['Mira', 'human', 'cleric', 'crown', false],
        ['Grub', 'orc', 'guardian', 'bell', false],
    ];

    private const SKINS = [
        'human' => ['#f6d7c3', '#eac0a2', '#d9a37f', '#bd8461', '#9a6646'], 'elf' => ['#f8e2d2', '#efd0b6', '#c9c3d8', '#a7b6c9'],
        'dwarf' => ['#f3cfb6', '#e2b394', '#cc9474'], 'orc' => ['#9fb07a', '#7f9a5e', '#61804a'],
        'felkin' => ['#e9c9a0', '#c99b6a', '#d8d2c8'], 'draka' => ['#c98d5e', '#7c8e6a', '#5f8a8a', '#6d6a8f'],
    ];

    public function __construct(private EntityManagerInterface $em, private HeroActions $heroes, private Social $social, private Game $game, private Bots $bots)
    {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        if ($this->em->getRepository(User::class)->findOneBy(['username' => 'demo-brannoc'])) {
            $io->warning('Demo data is already there.');

            return Command::SUCCESS;
        }
        $r = new Randomizer(new Mt19937(7));
        $pick = fn (array $a) => $a[$r->getInt(0, count($a) - 1)];
        $made = [];
        foreach (self::HEROES as $n => [$name, $race, $cls, $origin]) {
            $u = new User();
            $u->username = 'demo-'.strtolower($name);
            $u->password = '!'; // not a valid hash: demo accounts can't log in
            $u->demo = true;
            $u->createdAt = time();
            $this->em->persist($u);
            $look = [
                'skin' => $pick(self::SKINS[$race]), 'hair' => $pick(['crop', 'spiky', 'long', 'ponytail', 'bob', 'buns', 'mohawk', 'bald']),
                'hairColor' => $pick(['#2a2220', '#8a5a2b', '#d9a441', '#c9502e', '#e9e6e0', '#4f6d9c', '#b05aa8']),
                'eyes' => $pick(['round', 'sharp', 'sleepy', 'sparkle']), 'eyeColor' => $pick(['#5a3a26', '#3f9a4a', '#2f7ae0', '#e0a02a']),
                'mouth' => $pick(['smile', 'grin', 'flat', 'cat']), 'beard' => $race === 'dwarf' ? 'braided' : 'none',
                'acc' => $pick(['none', 'none', 'glasses', 'eyepatch']), 'build' => $pick([0.92, 1, 1.1]), 'height' => $pick([0.95, 1, 1.05]),
                'dye1' => $pick(['#c0392b', '#2f6fd0', '#3aa655', '#5b3fa8', '#e67e22']), 'dye2' => $pick(['#ece4d4', '#3d3a44', '#f1c40f']),
                'metal' => $pick(['#b8c2cc', '#e0b04a', '#c58a5a']),
            ];
            $made[$name] = $this->heroes->create($u, ['name' => $name, 'race' => $race, 'cls' => $cls, 'origin' => $origin, 'look' => $look,
                'story' => LifeStory::example($race, array_keys(Heritage::backstories($race))[$n * 4 % 9], $n)]);
        }
        $this->em->flush();

        $leader = $made['Brannoc'];
        $leader->gold = '500';
        $guild = $this->social->createGuild($leader, ['name' => 'Lantern Keepers', 'tag' => 'LANT', 'motto' => 'Nobody adventures alone.']);
        $this->em->flush();
        foreach ($made as $h) {
            if ($h !== $leader) {
                $this->social->joinGuild($h, $guild);
            }
        }
        $party = $this->social->createParty($leader, 'The Ember Watch');
        foreach (self::HEROES as [$name, , , , $inGroup]) {
            if ($inGroup && $made[$name] !== $leader) {
                $this->social->invite($leader, $made[$name], '');
            }
        }
        $this->em->flush();
        $this->social->postTavern($leader, 'lfm', 'One seat open for the Ember Golem. Any role, all welcome!', ['tank', 'healer', 'dps']);
        foreach (['Thorn' => 'Warden tank, steady and patient.', 'Fen' => 'Druid healer looking for a cozy group.', 'Ash' => 'Ranger, I bring my own arrows.'] as $name => $text) {
            $this->social->postTavern($made[$name], 'lfg', $text, []);
        }

        // A few things on the market, priced in starting gold.
        $sellers = array_values($made);
        foreach (range(1, 8) as $n) {
            $spec = Items::generate($r, $r->getInt(2, 8), $n % 4 === 0 ? 'epic' : 'rare');
            $item = Items::fromSpec($spec);
            $item->owner = $sellers[$n % count($sellers)];
            $item->price = (string) ($spec['rarity'] === 'epic' ? 60 + 10 * $n : 15 + 3 * $n);
            $this->em->persist($item);
        }
        foreach ($made as $h) {
            $h->gold = (string) max((int) $h->gold, 40);
            $this->bots->think($h);
        }
        $this->game->post('guild:'.$guild->id, 'Welcome to the Lantern Keepers! Group up at the tavern, the golem awaits.', null, $leader);
        $this->game->post('tavern', 'The Ember Watch has one open seat. Apply from the tavern board!', null, $leader);
        $this->em->flush();

        $io->success(sprintf('Created %d demo heroes, the guild "%s" and the group "%s" with one open seat.', count($made), $guild->name, $party->name));

        return Command::SUCCESS;
    }
}

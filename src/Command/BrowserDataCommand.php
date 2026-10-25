<?php

namespace App\Command;

use App\Game\Heritage;
use App\Game\Rules;
use App\Game\Simulator;
use App\Game\Stats;
use App\Game\Talents;
use App\Service\HeroActions;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/** Writes browser-build/data.js: the game data the in-page port of the server reads, straight from the PHP rules. */
#[AsCommand(name: 'app:browser-data', description: 'Dump the game rules to browser-build/data.js')]
class BrowserDataCommand extends Command
{
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $data = [
            'ATTRIBUTES' => Rules::ATTRIBUTES, 'RACES' => Rules::RACES, 'ORIGINS' => Rules::ORIGINS, 'CLASSES' => Rules::CLASSES,
            'KEYSTONES' => Rules::KEYSTONES, 'SLOTS' => Rules::SLOTS, 'BASES' => Rules::BASES, 'AFFIXES' => Rules::AFFIXES,
            'RARITIES' => Rules::RARITIES, 'GLYPHS' => Rules::GLYPHS, 'POWERS' => Rules::LEGENDARY_POWERS,
            'C' => [
                'POINTS_PER_LEVEL' => Rules::POINTS_PER_LEVEL, 'SOFT_CAP_SHARE' => Rules::SOFT_CAP_SHARE, 'OATH_LEVEL' => Rules::OATH_LEVEL,
                'PATH_LEVEL' => Rules::PATH_LEVEL, 'KEYSTONE_LEVELS' => Rules::KEYSTONE_LEVELS, 'ULTIMATE_LEVEL' => Rules::ULTIMATE_LEVEL,
                'REFORGE_LEVEL' => Rules::REFORGE_LEVEL, 'LOADOUT_SIZE' => Rules::LOADOUT_SIZE, 'ORIGIN_POINTS' => Rules::ORIGIN_POINTS,
            ],
            'CAPS' => Stats::CAPS, 'DUNGEON' => Simulator::DUNGEON, 'DUNGEON_NAME' => Simulator::DUNGEON_NAME, 'BOSSES' => Simulator::BOSSES,
            'MARKS' => HeroActions::MARKS, 'MAX_RANK' => HeroActions::MAX_RANK,
            'TALENT_SKILLS' => Talents::SKILLS, 'TALENT_TREES' => Talents::trees(), 'TALENT_NEED' => Talents::NEED,
            'HERITAGE_TREES' => Heritage::trees(),
            'HERITAGE' => ['RENOWN_ALONE' => Heritage::RENOWN_ALONE, 'RENOWN_PER_KIN' => Heritage::RENOWN_PER_KIN, 'CULTURE_SWAP_GOLD' => Heritage::CULTURE_SWAP_GOLD],
        ];
        $file = dirname(__DIR__, 2).'/browser-build/data.js';
        file_put_contents($file, 'window.IT_DATA = '.json_encode($data, JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR).";\n");
        $output->writeln('Wrote '.$file);

        return Command::SUCCESS;
    }
}

<?php

namespace App\Command;

use App\Game\Heritage;
use App\Game\LifeStory;
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
            'TWISTS' => Rules::TWISTS, 'TALENT_SKILLS' => Talents::SKILLS, 'TALENT_TREES' => Talents::trees(), 'HERITAGE_TREES' => Heritage::trees(),
            'TALENT' => ['POINTS_PER_LEVEL' => Talents::POINTS_PER_LEVEL, 'SHAPE' => Talents::SHAPE, 'SKILL_AT' => Talents::SKILL_AT, 'VERSION' => Talents::VERSION, 'BRANCHES' => array_map(fn ($t) => array_keys($t['branches']), Talents::TREES)],
            'HERITAGE' => ['RENOWN_ALONE' => Heritage::RENOWN_ALONE, 'RENOWN_PER_KIN' => Heritage::RENOWN_PER_KIN, 'CULTURE_SWAP_GOLD' => Heritage::CULTURE_SWAP_GOLD, 'KIN_CAP' => Heritage::KIN_CAP, 'SHAPE' => Heritage::SHAPE,
                'BACKSTORIES' => Heritage::BACKSTORIES, 'BACKSTORY_INFO' => Heritage::backstoryInfo(),
                'BACKSTORY_BASE' => array_map(fn ($list) => array_map(fn ($b) => (object) Heritage::backstoryEffect($b[0], $b[1], null), $list), array_map(fn ($race) => array_map(fn ($id) => [$race, $id], array_combine(array_keys(Heritage::backstories($race)), array_keys(Heritage::backstories($race)))), array_combine(array_keys(Heritage::TREES), array_keys(Heritage::TREES)))), 'BACKSTORY_RENOWN' => Heritage::BACKSTORY_RENOWN,
                'BACKSTORY_NODES' => Heritage::BACKSTORY_NODES, 'BACKSTORY_RENOWN_BONUS' => Heritage::BACKSTORY_RENOWN_BONUS],
            'LIFE_STORY' => ['CHAPTERS' => LifeStory::CHAPTERS, 'QUESTIONS' => LifeStory::QUESTIONS, 'NOTES_MAX' => LifeStory::NOTES_MAX, 'LEAN_ATTRS' => LifeStory::LEAN_ATTRS, 'LEAN_POINTS' => LifeStory::LEAN_POINTS],
        ];
        $file = dirname(__DIR__, 2).'/browser-build/data.js';
        file_put_contents($file, 'window.IT_DATA = '.json_encode($data, JSON_PRESERVE_ZERO_FRACTION | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR).";\n");
        $output->writeln('Wrote '.$file);

        return Command::SUCCESS;
    }
}

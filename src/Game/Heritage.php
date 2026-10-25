<?php

namespace App\Game;

/**
 * Race maps. Each race has a root, three shared trunk branches and three cultures of three branches each: twelve
 * branches of about 100 nodes, over 1,200 nodes a race. A hero follows one culture at a time, and only that
 * culture's branches can be learned. Points come from Renown, which grows by running dungeons with groupmates of
 * the same race: each one adds Renown to every run, twice as much when they share your culture. Without kin in the
 * group a run still pays a trickle. Every Heritage rank gives two points.
 *
 * What a node does comes from the handwritten core in TREES, grown the same way as the class maps (see Talents).
 * Effects use the same words as Talents (attr, stat, type, skill, cost, kin, renown).
 */
final class Heritage
{
    /** Renown per reward unit of a run (a full clear is 15 units): a trickle alone, more for each kinsman. */
    public const RENOWN_ALONE = 2;
    public const RENOWN_PER_KIN = 10;

    /** Gold per level to follow another culture. Points in the old culture come back. */
    public const CULTURE_SWAP_GOLD = 40;

    /** The kinship bonus in battle never goes past this, however many kin are in the group. */
    public const KIN_CAP = 0.30;

    /**
     * Backstories: every hero picks one at creation. A backstory belongs to one culture and one of its three branches
     * (the third is the culture's Kinship branch). race => culture => [[id, name, blurb] x 3], in branch order.
     */
    public const BACKSTORIES = [
        'human' => [
            'crownlands' => [
                ['squire', 'Squire of the Crown', 'Raised in a castle yard, polishing armor for knights who never came home.'],
                ['courtier', 'Fallen Courtier', 'Once a voice at court, now a name the heralds no longer call.'],
                ['bannerchild', 'Child of the Banner', 'Born in a war camp and brought up by the whole company.'],
            ],
            'freeport' => [
                ['dockhand', 'Dockhand', 'Grew up hauling crates and haggling for every copper on the wharf.'],
                ['deckhand', 'Ship\'s Boy', 'Ran away to sea at nine and learned to fight on a rolling deck.'],
                ['crewborn', 'Crew-born', 'One of the old smuggling families, where the crew is blood.'],
            ],
            'highmarch' => [
                ['shepherd', 'Mountain Shepherd', 'Kept flocks alive through winters that killed whole villages.'],
                ['scout', 'Pass Scout', 'Walked the high trails ahead of the wardens, watching for raiders.'],
                ['wardenkin', 'Warden\'s Kin', 'Every generation of your family has held the same watchtower.'],
            ],
        ],
        'elf' => [
            'silverwood' => [
                ['treeborn', 'Treeborn', 'Born in a house woven into a living silver oak.'],
                ['bowyer', 'Bowyer\'s Apprentice', 'Spent a century learning to shape one perfect bow.'],
                ['grovekeeper', 'Grovekeeper', 'Raised among the sentinels who guard the oldest groves together.'],
            ],
            'starspire' => [
                ['acolyte', 'Tower Acolyte', 'Copied star charts by candlelight in the white towers.'],
                ['stargazer', 'Exiled Stargazer', 'Read an omen the high mages did not want read aloud.'],
                ['circle', 'Child of the Circle', 'Fostered by a whole circle of mages, each teaching one spell.'],
            ],
            'duskvale' => [
                ['mourner', 'Dusk Mourner', 'Sang the twilight hymns for those the glades could not save.'],
                ['herbalist', 'Wandering Herbalist', 'Walked the borders trading cures for stories.'],
                ['lanternbearer', 'Lantern-bearer', 'Led the night processions that keep the glade-folk together.'],
            ],
        ],
        'dwarf' => [
            'ironhold' => [
                ['smith', 'Forge Apprentice', 'Grew up at the anvil, with burn scars to prove it.'],
                ['shieldbearer', 'Shield-bearer', 'Held the line in the deep tunnels before your beard came in.'],
                ['clanheir', 'Clan Heir', 'Heir of an old Ironhold clan with a hall full of cousins.'],
            ],
            'brewhall' => [
                ['cook', 'Hall Cook', 'Fed a hundred miners a day and never let a pot burn.'],
                ['brewer', 'Brewer\'s Child', 'Knows every barrel in Brewhall by its smell.'],
                ['skald', 'Tavern Skald', 'Told the old sagas until the whole hall sang along.'],
            ],
            'runedeep' => [
                ['runecarver', 'Runecarver', 'Carved warding runes into the deepest gates.'],
                ['delver', 'Deep Delver', 'Mapped tunnels no dwarf had walked in a thousand years.'],
                ['runekin', 'Rune-sworn', 'Bound by an oath-rune to a brotherhood of priests.'],
            ],
        ],
        'orc' => [
            'bloodfang' => [
                ['pitfighter', 'Pit Fighter', 'Fought in the blood pits for meat and glory.'],
                ['outrider', 'Steppe Outrider', 'Rode ahead of the horde on the red steppe.'],
                ['warband', 'Warband-born', 'Born on the march, raised by the whole warband.'],
            ],
            'stormcaller' => [
                ['spiritchild', 'Spirit-touched', 'Heard the ancestors whisper before you could speak.'],
                ['raincaller', 'Rain-caller', 'Danced the rain dance that broke a seven-year drought.'],
                ['totemkeeper', 'Totem-keeper', 'Kept the clan totem and the names carved on it.'],
            ],
            'ashland' => [
                ['scavenger', 'Ash Scavenger', 'Survived the burned wastes on what others left behind.'],
                ['survivor', 'Last Survivor', 'Walked out of the ash storm alone and lived.'],
                ['caravan', 'Caravan Guard', 'Guarded the ash caravans, where every hand counts.'],
            ],
        ],
        'felkin' => [
            'sandstride' => [
                ['dunerunner', 'Dune Runner', 'Carried messages across the dunes faster than any camel.'],
                ['oasiskeeper', 'Oasis Keeper', 'Kept the hidden springs where the caravans drink.'],
                ['nomad', 'Caravan Child', 'Born under a tent that never stayed in one place.'],
            ],
            'moonclaw' => [
                ['rooftop', 'Rooftop Thief', 'Learned the high roofs by stealing the moon\'s silver.'],
                ['nighthunter', 'Night Hunter', 'Hunted beasts by moonlight for the night market.'],
                ['clawsworn', 'Clawsworn', 'Sworn to a pride of hunters that shares every kill.'],
            ],
            'hearthpaw' => [
                ['hearthtender', 'Hearth Tender', 'Kept the village fire burning through every storm.'],
                ['healerpaw', 'Healer\'s Ward', 'Raised by the village healer, fetching herbs and bandages.'],
                ['villageborn', 'Village Heart', 'Everyone in the village knows your name and your mischief.'],
            ],
        ],
        'draka' => [
            'ashwing' => [
                ['skyrider', 'Sky Rider', 'Rode the updrafts above the volcano before you could walk.'],
                ['diver', 'Cliff Diver', 'Dove from the peaks for the thrill of the fall.'],
                ['flight', 'Flight-born', 'Hatched into a flight that flies, hunts and roosts as one.'],
            ],
            'cinderscale' => [
                ['forgeguard', 'Forge Guard', 'Stood watch at the great forge where the lava runs.'],
                ['bellows', 'Bellows Keeper', 'Worked the bellows until your roar shook the forge.'],
                ['forgekin', 'Forge-kin', 'One of the families who have tended the forge since it was lit.'],
            ],
            'emberkin' => [
                ['kindler', 'Kindler', 'Lit the first fires of every season.'],
                ['mender', 'Ember Mender', 'Healed burns with warmth instead of water.'],
                ['flamespeaker', 'Flame-speaker', 'Spoke for your clan at the great fire councils.'],
            ],
        ],
    ];

    /** Renown a new hero starts with, from their backstory: enough for Heritage rank 3 (five points). */
    public const BACKSTORY_RENOWN = 120;

    /** Spine nodes of the backstory's branch a new hero starts with, after the root. */
    public const BACKSTORY_NODES = 4;

    /** Extra Renown while following the backstory's culture. */
    public const BACKSTORY_RENOWN_BONUS = 0.10;

    /** race => [root [name, effect], trunk [[name, ranks, effect] x 2], cultures [id => [name, theme, colour, [5 nodes]]]] */
    public const TREES = [
        'human' => [
            'root' => ['Human Heritage', ['kin' => 0.01, 'attr' => ['command' => 2]]],
            'trunk' => [['Ambition', 3, ['stat' => ['xp' => 0.02]]], ['Many Hands', 3, ['attr' => ['might' => 1, 'vitality' => 1]]]],
            'cultures' => [
                'crownlands' => ['Crownlands', 'Knights and banners of the old kingdom', '#4a7fd0', [
                    ['Drilled', 3, ['attr' => ['command' => 2]]], ['Oathkeeper', 1, ['stat' => ['taken' => 0.03]]],
                    ['Courtly Grace', 3, ['attr' => ['presence' => 1, 'vitality' => 1]]], ['Shield Brothers', 1, ['kin' => 0.01]],
                    ['Banner of the Crown', 1, ['kin' => 0.02, 'stat' => ['hp' => 0.05]]]]],
                'freeport' => ['Freeport', 'Merchants, sailors and smugglers', '#e0b04a', [
                    ['Haggler', 3, ['attr' => ['fortune' => 3]]], ['Trade Winds', 1, ['stat' => ['fortune' => 0.10]]],
                    ['Sea Legs', 3, ['attr' => ['agility' => 2]]], ['Smuggler', 1, ['stat' => ['dodge' => 0.02]]],
                    ['Merchant Prince', 1, ['stat' => ['fortune' => 0.15, 'xp' => 0.05]]]]],
                'highmarch' => ['Highmarch', 'Frontier wardens of the mountain passes', '#5f9a4a', [
                    ['Frontier Born', 3, ['attr' => ['vitality' => 2]]], ['Frontier Grit', 1, ['stat' => ['regen' => 0.15]]],
                    ['Pathfinder', 3, ['stat' => ['dmg' => 0.01]]], ['Ambush', 1, ['stat' => ['crit' => 0.02]]],
                    ['Warden of the March', 1, ['stat' => ['dmg' => 0.05, 'hp' => 0.03]]]]],
            ],
        ],
        'elf' => [
            'root' => ['Elven Heritage', ['kin' => 0.01, 'attr' => ['precision' => 2]]],
            'trunk' => [['Long Memory', 3, ['attr' => ['wisdom' => 2]]], ['Starlit Eyes', 3, ['attr' => ['precision' => 2]]]],
            'cultures' => [
                'silverwood' => ['Silverwood', 'Wardens of the silver forest', '#9fd0a8', [
                    ['Treewalker', 3, ['attr' => ['agility' => 2]]], ['Leafstep', 1, ['stat' => ['dodge' => 0.03]]],
                    ['Swift Bow', 3, ['stat' => ['haste' => 0.01]]], ['Moonbow', 1, ['stat' => ['crit' => 0.02]]],
                    ['Silverwood Sentinel', 1, ['stat' => ['dmg' => 0.05, 'dodge' => 0.02]]]]],
                'starspire' => ['Starspire', 'High mages of the white towers', '#a8b8ff', [
                    ['Tower Study', 3, ['attr' => ['arcana' => 2]]], ['Astral Font', 1, ['stat' => ['resRegen' => 0.08]]],
                    ['Star Charts', 3, ['stat' => ['cdr' => 0.01]]], ['Starlore', 1, ['stat' => ['critDmg' => 0.08]]],
                    ['Celestial', 1, ['stat' => ['dmg' => 0.04, 'heal' => 0.04, 'cdr' => 0.02]]]]],
                'duskvale' => ['Duskvale', 'Healers of the twilight glades', '#b090d0', [
                    ['Dusk Prayer', 3, ['attr' => ['spirit' => 2]]], ['Dew', 1, ['stat' => ['heal' => 0.04]]],
                    ['Gentle Night', 3, ['stat' => ['healRecv' => 0.02]]], ['Twilight Veil', 1, ['stat' => ['threat' => -0.10]]],
                    ['Night Bloom', 1, ['stat' => ['heal' => 0.06, 'regen' => 0.10]]]]],
            ],
        ],
        'dwarf' => [
            'root' => ['Dwarven Heritage', ['kin' => 0.01, 'attr' => ['guard' => 2]]],
            'trunk' => [['Stout', 3, ['attr' => ['guard' => 2]]], ['Deep Lungs', 3, ['attr' => ['vitality' => 2]]]],
            'cultures' => [
                'ironhold' => ['Ironhold', 'Smiths and the shieldwall', '#a3abb5', [
                    ['Forged', 3, ['attr' => ['guard' => 2]]], ['Shieldwall', 1, ['stat' => ['taken' => 0.03]]],
                    ['Iron Grip', 3, ['stat' => ['block' => 0.01]]], ['Anvil-Born', 1, ['stat' => ['hp' => 0.04]]],
                    ['Mountain King', 1, ['stat' => ['taken' => 0.04, 'threat' => 0.10]]]]],
                'brewhall' => ['Brewhall', 'Brewers, cooks and storytellers', '#d08a3a', [
                    ['Hearty Stew', 3, ['attr' => ['recovery' => 2]]], ['Hearty Ale', 1, ['stat' => ['regen' => 0.15]]],
                    ['Good Company', 3, ['stat' => ['healRecv' => 0.02]]], ['Liquid Courage', 1, ['stat' => ['dmg' => 0.04]]],
                    ['Bottomless Tankard', 1, ['stat' => ['hp' => 0.05, 'healRecv' => 0.06]]]]],
                'runedeep' => ['Runedeep', 'Rune priests and deep delvers', '#4ac0c0', [
                    ['Rune Lore', 3, ['attr' => ['arcana' => 1, 'spirit' => 1]]], ['Runecarving', 1, ['stat' => ['heal' => 0.03, 'dmg' => 0.03]]],
                    ['Delver', 3, ['stat' => ['fortune' => 0.03]]], ['Prospector', 1, ['stat' => ['fortune' => 0.10]]],
                    ['Rune of Power', 1, ['stat' => ['dmg' => 0.04, 'heal' => 0.04, 'crit' => 0.02]]]]],
            ],
        ],
        'orc' => [
            'root' => ['Orcish Heritage', ['kin' => 0.01, 'attr' => ['fury' => 2]]],
            'trunk' => [['Thick Skull', 3, ['attr' => ['vitality' => 2]]], ['War Drums', 3, ['attr' => ['fury' => 2]]]],
            'cultures' => [
                'bloodfang' => ['Bloodfang', 'Berserkers of the red steppe', '#d04a3a', [
                    ['Bloodlust', 3, ['attr' => ['might' => 2]]], ['Blood Frenzy', 1, ['stat' => ['critDmg' => 0.08]]],
                    ['Charge', 3, ['stat' => ['haste' => 0.01]]], ['Savagery', 1, ['stat' => ['dmg' => 0.04]]],
                    ['Red Fury', 1, ['stat' => ['dmg' => 0.06, 'haste' => 0.03]]]]],
                'stormcaller' => ['Stormcallers', 'Shamans who speak with the ancestors', '#4aa3ff', [
                    ['Spirit Talk', 3, ['attr' => ['spirit' => 1, 'arcana' => 1]]], ["Ancestors' Voice", 1, ['stat' => ['heal' => 0.04]]],
                    ['Rain Dance', 3, ['stat' => ['resRegen' => 0.02]]], ['Thunder', 1, ['stat' => ['dmg' => 0.03, 'heal' => 0.03]]],
                    ['Spirit Walker', 1, ['kin' => 0.02, 'stat' => ['heal' => 0.04]]]]],
                'ashland' => ['Ashlanders', 'Survivors of the burned wastes', '#8a7a6a', [
                    ['Ashen Hide', 3, ['attr' => ['resolve' => 2]]], ['Scarred Hide', 1, ['stat' => ['taken' => 0.03]]],
                    ['Hard Living', 3, ['stat' => ['hp' => 0.01]]], ['Endure', 1, ['stat' => ['regen' => 0.15]]],
                    ['Unkillable', 1, ['stat' => ['hp' => 0.06, 'taken' => 0.03]]]]],
            ],
        ],
        'felkin' => [
            'root' => ['Felkin Heritage', ['kin' => 0.01, 'attr' => ['agility' => 2]]],
            'trunk' => [['Light Paws', 3, ['attr' => ['agility' => 2]]], ['Whiskers', 3, ['attr' => ['precision' => 2]]]],
            'cultures' => [
                'sandstride' => ['Sandstriders', 'Nomads of the golden dunes', '#e0c070', [
                    ['Dune Runner', 3, ['attr' => ['stamina' => 2]]], ['Mirage', 1, ['stat' => ['dodge' => 0.03]]],
                    ['Oasis', 3, ['stat' => ['resRegen' => 0.02]]], ['Caravan', 1, ['stat' => ['fortune' => 0.08]]],
                    ['Desert Wind', 1, ['stat' => ['haste' => 0.04, 'dodge' => 0.02]]]]],
                'moonclaw' => ['Moonclaw', 'Night hunters of the high roofs', '#8a6fb0', [
                    ['Sharp Claws', 3, ['attr' => ['ferocity' => 2]]], ['Pounce', 1, ['stat' => ['critDmg' => 0.08]]],
                    ['Night Eyes', 3, ['stat' => ['crit' => 0.01]]], ['Shadow Prowl', 1, ['stat' => ['threat' => -0.10]]],
                    ['Moonlit Hunt', 1, ['stat' => ['dmg' => 0.06, 'crit' => 0.02]]]]],
                'hearthpaw' => ['Hearthpaw', 'Village healers and keepers of the fire', '#ffb070', [
                    ['Warm Paws', 3, ['attr' => ['spirit' => 2]]], ['Purring Calm', 1, ['stat' => ['heal' => 0.04]]],
                    ['Curl Up', 3, ['stat' => ['healRecv' => 0.02]]], ['Ninth Life', 1, ['stat' => ['hp' => 0.04]]],
                    ['Hearthkeeper', 1, ['kin' => 0.02, 'stat' => ['heal' => 0.05]]]]],
            ],
        ],
        'draka' => [
            'root' => ['Draka Heritage', ['kin' => 0.01, 'attr' => ['recovery' => 2]]],
            'trunk' => [['Scales', 3, ['attr' => ['guard' => 2]]], ['Inner Fire', 3, ['attr' => ['arcana' => 2]]]],
            'cultures' => [
                'ashwing' => ['Ashwing', 'Sky riders of the volcano peaks', '#ff8a3d', [
                    ['Updraft Wings', 3, ['attr' => ['swiftness' => 2]]], ['Updraft', 1, ['stat' => ['haste' => 0.03]]],
                    ['Talons', 3, ['stat' => ['dmg' => 0.01]]], ['Dive', 1, ['stat' => ['critDmg' => 0.08]]],
                    ['Skyborn', 1, ['stat' => ['dmg' => 0.05, 'haste' => 0.03]]]]],
                'cinderscale' => ['Cinderscale', 'Guardians of the great forge', '#a84a2a', [
                    ['Forge Scales', 3, ['attr' => ['vitality' => 2]]], ['Molten Scales', 1, ['stat' => ['taken' => 0.03]]],
                    ['Smoke Roar', 3, ['stat' => ['threat' => 0.03]]], ['Forge Heart', 1, ['stat' => ['hp' => 0.04]]],
                    ['Living Forge', 1, ['stat' => ['taken' => 0.04, 'hp' => 0.04]]]]],
                'emberkin' => ['Emberkin', 'Flame-speakers who mend with warmth', '#ffd25a', [
                    ['Kindle', 3, ['attr' => ['spirit' => 1, 'recovery' => 1]]], ['Warm Embers', 1, ['stat' => ['heal' => 0.04]]],
                    ['Hearth Glow', 3, ['stat' => ['regen' => 0.05]]], ['Rekindle', 1, ['stat' => ['healRecv' => 0.06]]],
                    ['Phoenix Blood', 1, ['stat' => ['heal' => 0.05, 'dmg' => 0.04]]]]],
            ],
        ],
    ];

    private static array $built = [];

    /** Renown needed for a Heritage rank: rank 1 is free, then 100, 300, 600, 1000... */
    public const SHAPE = ['starts' => [8, 4, 1, 4, 8], 'depth' => 24, 'hub' => 4, 'value' => 0.5];

    public static function renownFor(int $rank): int
    {
        return 20 * ($rank - 1) * $rank;
    }

    /** Heritage points at a rank: the root at rank 1, then two a rank. */
    public static function points(int $rank): int
    {
        return max(0, 2 * $rank - 1);
    }

    public static function rank(int $renown): int
    {
        $r = 1;
        while ($renown >= self::renownFor($r + 1)) {
            ++$r;
        }

        return $r;
    }

    /** The handwritten core of one branch grown into a spine and four lanes. */
    private static function branch(string $id, string $name, string $theme, string $colour, ?string $culture, array $a, array $b, array $n, string $nName, array $y, array $z): array
    {
        $spine = [
            'a' => $a, 'b' => $b,
            'hubs' => [
                4 => [$nName, $n, 'notable'],
                8 => [null, TreeMap::merge(TreeMap::scale($a, 3), TreeMap::scale($b, 3)), 'notable'],
                12 => [null, TreeMap::merge($n, TreeMap::scale($a, 2)), 'capstone'],
                16 => [null, TreeMap::merge(TreeMap::scale($b, 4), TreeMap::scale($a, 2)), 'notable'],
                20 => [null, TreeMap::merge(TreeMap::scale($n, 1.25), TreeMap::scale($b, 2)), 'notable'],
            ],
            'end' => [$name.' Legacy', TreeMap::merge(TreeMap::scale($n, 1.5), TreeMap::scale($b, 3))],
        ];
        [$ya, $za] = [array_key_first($y), array_key_first($z)];
        $lanes = [
            1 => ['minor' => $a, 'notable' => TreeMap::merge(TreeMap::scale($a, 3), $b), 'end' => [null, TreeMap::merge(TreeMap::scale($a, 5), TreeMap::scale($n, 0.5)), 'notable']],
            3 => ['minor' => $b, 'notable' => TreeMap::merge(TreeMap::scale($b, 3), $a), 'end' => [null, TreeMap::merge(TreeMap::scale($b, 5), TreeMap::scale($n, 0.5)), 'notable']],
            0 => ['minor' => ['attr' => [$ya => 2]], 'notable' => ['attr' => [$ya => 5], 'renown' => 0.01], 'end' => [null, ['attr' => [$ya => 6], 'renown' => 0.05], 'notable']],
            4 => ['minor' => ['attr' => [$za => 2]], 'notable' => ['attr' => [$za => 5], 'kin' => 0.001], 'end' => [null, ['attr' => [$za => 4], 'kin' => 0.006], 'notable']],
        ];

        return [$id, $name, $theme, $colour, $culture, $spine, $lanes];
    }

    /** A race map: [root, branches => [[id, name, theme, colour, culture, nodeIds]], cultures => [id => [name, theme, colour, branchIds]], nodes, size]. */
    public static function tree(string $race): array
    {
        if (isset(self::$built[$race])) {
            return self::$built[$race];
        }
        $t = self::TREES[$race];
        $attrs = array_keys(Rules::ATTRIBUTES);
        $ri = array_search($race, array_keys(self::TREES), true);
        $racePts = array_keys(Rules::RACES[$race]['points']);
        $k = 0;
        $pick = function () use (&$k, $attrs, $ri) {
            $y = $attrs[($ri * 5 + $k * 2) % count($attrs)];
            $z = $attrs[($ri * 5 + $k * 2 + 1) % count($attrs)];
            ++$k;

            return [[$y => 1], [$z => 1]];
        };
        $trunk = [
            ['trunk0', $t['trunk'][0][0], 'Shared by every '.Rules::RACES[$race]['name'], Talents::perNode($t['trunk'][0]), ['attr' => [$racePts[0] => 1]], TreeMap::scale($t['trunk'][0][2], 2)],
            ['trunk1', $t['trunk'][1][0], 'Shared by every '.Rules::RACES[$race]['name'], Talents::perNode($t['trunk'][1]), ['attr' => [$racePts[1] ?? $racePts[0] => 1]], TreeMap::scale($t['trunk'][1][2], 2)],
            ['trunk2', 'Sagas', 'More Renown from every run', ['renown' => 0.01], TreeMap::scale($t['root'][1], 0.3), ['renown' => 0.04, 'kin' => 0.002]],
        ];
        $specs = [];
        $cultures = [];
        $c = 0;
        foreach ($t['cultures'] as $cid => [$name, $theme, $colour, [$m1, $m2, $m3, $m4, $m5]]) {
            $subs = [
                [$cid.'0', $m1[0], $theme, Talents::perNode($m1), Talents::perNode($m2), $m2[2], $m2[0]],
                [$cid.'1', $m3[0], $theme, Talents::perNode($m3), Talents::perNode($m4), $m4[2], $m4[0]],
                [$cid.'2', $name.' Kinship', 'Fight beside your own', Talents::perNode($m5, 0.5), ['kin' => 0.002], $m5[2], $m5[0]],
            ];
            foreach ($subs as [$bid, $bname, $btheme, $a, $b, $n, $nName]) {
                [$y, $z] = $pick();
                $specs[] = self::branch($bid, $bname, $btheme, $colour, $cid, $a, $b, $n, $nName, $y, $z);
            }
            $cultures[$cid] = [$name, $theme, $colour, array_column($subs, 0)];
            [$tid, $tname, $ttheme, $ta, $tb, $tn] = $trunk[$c++];
            [$y, $z] = $pick();
            $specs[] = self::branch($tid, $tname, $ttheme, '#ffd25a', null, $ta, $tb, $tn, $tname.' Heart', $y, $z);
        }
        $map = TreeMap::build($t['root'], $specs, self::SHAPE);
        $map['cultures'] = $cultures;

        return self::$built[$race] = $map;
    }

    /** Every backstory of a race: id => [name, culture, branch id, blurb]. */
    public static function backstories(string $race): array
    {
        $out = [];
        foreach (self::BACKSTORIES[$race] ?? [] as $cid => $list) {
            foreach ($list as $i => [$id, $name, $blurb]) {
                $out[$id] = [$name, $cid, $cid.$i, $blurb];
            }
        }

        return $out;
    }

    /** For the creator: race => id => [name, culture, branch, blurb, what it gives, the branch's name]. */
    public static function backstoryInfo(): array
    {
        $out = [];
        foreach (array_keys(self::TREES) as $race) {
            $tree = self::tree($race);
            $names = array_column($tree['branches'], 1, 0);
            foreach (self::backstories($race) as $id => [$name, $cid, $bid, $blurb]) {
                $out[$race][$id] = [$name, $cid, $bid, $blurb, Talents::describe(self::backstoryEffect($race, $id, $cid)), $names[$bid]];
            }
        }

        return $out;
    }

    /** The nodes a backstory starts a hero with: the root and the first steps along its branch. */
    public static function backstoryStart(string $race, string $backstory): array
    {
        $bid = self::backstories($race)[$backstory][2];
        $nodes = ['root' => 1];
        for ($d = 1; $d <= self::BACKSTORY_NODES; ++$d) {
            $nodes[$bid.'.2.'.$d] = 1;
        }

        return $nodes;
    }

    /**
     * What a backstory gives for good: double the first minor of its branch, and more Renown while the hero follows
     * its culture. Same effect words as the maps.
     */
    public static function backstoryEffect(string $race, ?string $backstory, ?string $culture): array
    {
        $b = self::backstories($race)[$backstory ?? ''] ?? null;
        if ($b === null) {
            return [];
        }
        $tree = self::tree($race);
        $e = TreeMap::scale($tree['nodes'][$b[2].'.2.1']['effect'], 2);
        if ($culture === $b[1]) {
            $e = TreeMap::merge($e, ['renown' => self::BACKSTORY_RENOWN_BONUS]);
        }

        return $e;
    }

    public static function trees(): array
    {
        $out = [];
        foreach (array_keys(self::TREES) as $race) {
            $out[$race] = self::tree($race);
        }

        return $out;
    }

    /**
     * How many groupmates count as kin for a hero: same race counts once, same race and culture twice, and someone
     * who also shares your backstory three times. $others: [[race, culture, backstory], ...] for the other members.
     */
    public static function kin(string $race, ?string $culture, array $others, ?string $backstory = null): int
    {
        $n = 0;
        foreach ($others as $o) {
            [$r, $c] = $o;
            if ($r === $race) {
                $n += ($culture !== null && $c === $culture) ? (($backstory !== null && ($o[2] ?? null) === $backstory) ? 3 : 2) : 1;
            }
        }

        return $n;
    }

    /** Renown a run pays: units of reward times the kin in the group, plus whatever the hero's tree adds. */
    public static function renownGain(float $units, int $kin, float $bonus): int
    {
        return (int) round($units * (self::RENOWN_ALONE + self::RENOWN_PER_KIN * $kin) * (1 + $bonus));
    }

    /** The order demo heroes learn in: the root, their culture's spines, the trunk, then the lanes. Deterministic. */
    public static function plan(string $race, string $culture): array
    {
        $key = 'p:'.$race.':'.$culture;
        if (isset(self::$built[$key])) {
            return self::$built[$key];
        }
        $tree = self::tree($race);
        [$s, $depth] = [self::SHAPE['starts'], self::SHAPE['depth']];
        $mine = [...$tree['cultures'][$culture][3], 'trunk0', 'trunk1', 'trunk2'];
        $plan = ['root'];
        for ($d = 1; $d <= $depth; ++$d) {
            foreach ($mine as $bid) {
                $plan[] = $bid.'.2.'.$d;
            }
        }
        foreach ($mine as $bid) {
            foreach ([1, 3, 0, 4] as $j) {
                for ($d = $s[$j]; $d <= $depth; ++$d) {
                    $plan[] = $bid.'.'.$j.'.'.$d;
                }
            }
        }

        return self::$built[$key] = $plan;
    }

    public static function auto(string $race, string $culture, int $rank): array
    {
        return TreeMap::auto(self::tree($race), self::plan($race, $culture), self::points($rank), $culture);
    }
}

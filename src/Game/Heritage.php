<?php

namespace App\Game;

/**
 * Race trees. Each race has a root, a shared trunk and three cultures. A hero follows one culture at a time, and
 * only that culture's branch can be learned. Points come from Renown, which grows by running dungeons with
 * groupmates of the same race: each one adds Renown to every run, twice as much when they share your culture.
 * Without kin in the group a run still pays a trickle.
 *
 * Effects use the same words as Talents (attr, stat, type, skill, cost, kin, renown).
 */
final class Heritage
{
    /** Renown per reward unit of a run (a full clear is 15 units): a trickle alone, more for each kinsman. */
    public const RENOWN_ALONE = 2;
    public const RENOWN_PER_KIN = 10;

    /** Gold per level to follow another culture. Points in the old culture come back. */
    public const CULTURE_SWAP_GOLD = 40;

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
    public static function renownFor(int $rank): int
    {
        return 50 * ($rank - 1) * $rank;
    }

    public static function rank(int $renown): int
    {
        $r = 1;
        while ($renown >= self::renownFor($r + 1)) {
            ++$r;
        }

        return $r;
    }

    /** A race tree: [root, trunk => ids, cultures => [id => [name, theme, colour, nodeIds]], nodes => [id => node]]. */
    public static function tree(string $race): array
    {
        if (isset(self::$built[$race])) {
            return self::$built[$race];
        }
        $t = self::TREES[$race];
        $nodes = ['root' => Talents::node('root', $t['root'][0], 1, $t['root'][1], null, 0, null, 'root', null)];
        $trunk = [];
        $prev = 'root';
        foreach ($t['trunk'] as $n => [$name, $max, $effect]) {
            $id = 'trunk'.($n + 1);
            $nodes[$id] = Talents::node($id, $name, $max, $effect, $prev, 1, null, 'minor', null);
            $nodes[$id]['need'] = 0;
            $trunk[] = $id;
            $prev = $id;
        }
        $cultures = [];
        foreach ($t['cultures'] as $cid => [$name, $theme, $colour, $list]) {
            $ids = [];
            $p = 'root';
            foreach ($list as $n => [$nname, $max, $effect]) {
                $id = $cid.($n + 1);
                $kind = $n === 4 ? 'capstone' : ($n % 2 ? 'notable' : 'minor');
                $nodes[$id] = Talents::node($id, $nname, $max, $effect, $p, 2, $cid, $kind, null, $cid);
                $nodes[$id]['need'] = $n === 4 ? 10 : 0;
                $ids[] = $id;
                $p = $id;
            }
            $cultures[$cid] = [$name, $theme, $colour, $ids];
        }

        return self::$built[$race] = ['root' => 'root', 'trunk' => $trunk, 'cultures' => $cultures, 'nodes' => $nodes];
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
     * How many groupmates count as kin for a hero: same race counts once, same race and culture twice.
     * $others: [[race, culture], ...] for the other members.
     */
    public static function kin(string $race, ?string $culture, array $others): int
    {
        $n = 0;
        foreach ($others as [$r, $c]) {
            if ($r === $race) {
                $n += ($culture !== null && $c === $culture) ? 2 : 1;
            }
        }

        return $n;
    }

    /** Renown a run pays: units of reward times the kin in the group, plus whatever the hero's tree adds. */
    public static function renownGain(float $units, int $kin, float $bonus): int
    {
        return (int) round($units * (self::RENOWN_ALONE + self::RENOWN_PER_KIN * $kin) * (1 + $bonus));
    }

    /** Heritage points a demo hero spends: root, its culture, then the trunk. Deterministic. */
    public static function auto(string $race, string $culture, int $points): array
    {
        $tree = self::tree($race);
        $have = [];
        $order = ['root', ...$tree['cultures'][$culture][3], ...$tree['trunk'], ...$tree['trunk'], ...$tree['trunk']];
        $guard = 0;
        while ($points > 0 && $guard++ < 100) {
            $learned = false;
            foreach ($order as $id) {
                if (Talents::check($tree, $have, $id, $points, $culture) === null) {
                    $have[$id] = ($have[$id] ?? 0) + 1;
                    --$points;
                    $learned = true;
                    break;
                }
            }
            if (!$learned) {
                break;
            }
        }

        return $have;
    }
}

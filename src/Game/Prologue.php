<?php

namespace App\Game;

/**
 * The prologue: a short scripted fight right after a hero is made. Four guides fill the other roles, the group
 * runs the first wing of Ember Hollow (two packs and a boss) and nobody can lose. It teaches what the tank, the
 * healer and the damage dealers do and gives no loot or XP. The playable build mirrors this file in server.js.
 */
final class Prologue
{
    public const SECONDS = 180;
    public const DUNGEON = 'ember-hollow';
    public const ENCOUNTERS = 3;
    public const LEVEL = 3;

    /** The guides, one per role, with fixed looks: [name, race, class, look]. */
    public const GUIDES = [
        'tank' => ['Brannoc', 'dwarf', 'guardian', ['skin' => '#e2b394', 'hair' => 'crop', 'hairColor' => '#c9502e', 'eyes' => 'round', 'eyeColor' => '#5a3a26', 'mouth' => 'grin', 'beard' => 'braided', 'acc' => 'none', 'build' => 1.1, 'height' => 0.95, 'dye1' => '#2f6fd0', 'dye2' => '#ece4d4', 'metal' => '#b8c2cc']],
        'healer' => ['Mira', 'human', 'cleric', ['skin' => '#eac0a2', 'hair' => 'long', 'hairColor' => '#d9a441', 'eyes' => 'sparkle', 'eyeColor' => '#2f7ae0', 'mouth' => 'smile', 'beard' => 'none', 'acc' => 'none', 'build' => 1, 'height' => 1, 'dye1' => '#ece4d4', 'dye2' => '#f1c40f', 'metal' => '#e0b04a']],
        'dps1' => ['Sela', 'elf', 'ranger', ['skin' => '#efd0b6', 'hair' => 'ponytail', 'hairColor' => '#2a2220', 'eyes' => 'sharp', 'eyeColor' => '#3f9a4a', 'mouth' => 'flat', 'beard' => 'none', 'acc' => 'none', 'build' => 0.92, 'height' => 1.05, 'dye1' => '#3aa655', 'dye2' => '#3d3a44', 'metal' => '#c58a5a']],
        'dps2' => ['Ozric', 'orc', 'mage', ['skin' => '#7f9a5e', 'hair' => 'mohawk', 'hairColor' => '#4f6d9c', 'eyes' => 'sleepy', 'eyeColor' => '#e0a02a', 'mouth' => 'cat', 'beard' => 'none', 'acc' => 'glasses', 'build' => 1, 'height' => 1, 'dye1' => '#5b3fa8', 'dye2' => '#f1c40f', 'metal' => '#b8c2cc']],
        'dps3' => ['Kira', 'felkin', 'rogue', ['skin' => '#c99b6a', 'hair' => 'bob', 'hairColor' => '#e9e6e0', 'eyes' => 'sharp', 'eyeColor' => '#e0a02a', 'mouth' => 'cat', 'beard' => 'none', 'acc' => 'eyepatch', 'build' => 0.92, 'height' => 0.95, 'dye1' => '#c0392b', 'dye2' => '#3d3a44', 'metal' => '#b8c2cc']],
    ];

    /** Which guides join a hero of this role: the four other seats of tank, healer and three damage dealers. */
    public static function guides(string $role): array
    {
        $seats = self::GUIDES;
        unset($seats[$role === 'dps' ? 'dps3' : $role]);

        return $seats;
    }

    /** The first wing only. */
    public static function dungeon(): array
    {
        $d = Dungeons::get(self::DUNGEON);
        $d['plan'] = array_slice($d['plan'], 0, self::ENCOUNTERS);

        return $d;
    }

    /**
     * Runs the fight. $hero is the player's combatant and $look the player's look; returns the roster (tank first,
     * as in real battles) and the simulator's result, from the first seed that ends in a clear.
     */
    public static function run(array $hero, array $look): array
    {
        $role = Rules::role($hero['cls']);
        $realLevel = $hero['level'];
        $hero['level'] = self::LEVEL;
        $seats = [['combatant' => $hero, 'look' => $look, 'role' => $role, 'race' => $hero['race']]];
        $n = 0;
        foreach (self::guides($role) as [$name, $race, $cls, $glook]) {
            $b = Reference::build($cls, self::LEVEL + 1);
            $b['race'] = $race;
            $kit = array_filter(Rules::CLASSES[$cls]['kit'], fn ($x) => $x !== 'none');
            $seats[] = ['combatant' => Combatants::make($b, -(++$n), $name), 'look' => $glook + $kit + ['race' => $race, 'hat' => 'none', 'gloves' => 'none', 'cape' => 'none', 'offhand' => 'none'], 'role' => Rules::role($cls), 'race' => $race];
        }
        usort($seats, fn ($a, $b) => array_search($a['role'], ['tank', 'healer', 'dps'], true) <=> array_search($b['role'], ['tank', 'healer', 'dps'], true));
        // The player's own stats are their level 1 kit; the guides carry the fight a little, so it is always a clear.
        $party = array_column($seats, 'combatant');
        $result = null;
        for ($seed = 1; $seed <= 40; ++$seed) {
            $result = (new Simulator())->run($party, 2, $seed, self::dungeon());
            if (!$result['report']['wiped']) {
                break;
            }
        }
        $roster = array_map(fn ($s) => [
            'id' => $s['combatant']['id'], 'name' => $s['combatant']['name'], 'cls' => $s['combatant']['cls'], 'race' => $s['race'], 'level' => $s['combatant']['id'] === $hero['id'] ? $realLevel : $s['combatant']['level'],
            'role' => $s['role'], 'look' => $s['look'], 'resource' => $s['combatant']['stats']['resource'], 'maxHp' => (int) $s['combatant']['stats']['maxHp'],
        ], $seats);

        return ['roster' => $roster, 'timeline' => $result['timeline'], 'report' => $result['report'], 'seed' => $seed];
    }
}

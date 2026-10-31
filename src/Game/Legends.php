<?php

namespace App\Game;

/**
 * Legend forms: the last permanent choice. At level 50 a hero takes one of two forms of their Path, for good. A form
 * gives a title ("Annika the Dawnward"), a capstone passive and a stronger ultimate. Forms are ordinary modifier
 * bundles, so Stats::derive and both engines read them the same way talents are read.
 *
 * [path => [form => [title, flavour, capstone name, capstone effect, ultimate words, ultimate bonus, path skill bonus]]]
 */
final class Legends
{
    public const LEVEL = 50;

    public const FORMS = [
        // Guardian
        'bulwark' => [
            'unbroken' => ['the Unbroken', 'A wall that learned to walk.', 'Stone Oath', ['taken' => 0.08, 'block' => 0.05], 'Last Stand holds far longer against the worst blows', 0.45, 0.25],
            'aegisLord' => ['the Aegis-Lord', 'Shelters the whole line behind one shield.', 'Shared Shelter', ['hp' => 0.10, 'healRecv' => 0.10], 'Last Stand also steadies the healers behind you', 0.35, 0.35],
        ],
        'vanguard' => [
            'warbringer' => ['the Warbringer', 'Charges first and is never ignored.', 'Battle Standard', ['threat' => 0.30, 'dmg' => 0.08], 'Last Stand roars with the strength of the whole charge', 0.40, 0.30],
            'reaver' => ['the Reaver', 'Hits back harder the more it is hit.', 'Blood for Blood', ['lifesteal' => 0.05, 'dmg' => 0.06], 'Last Stand feeds on every blow it turns aside', 0.45, 0.25],
        ],
        // Warden
        'oakheart' => [
            'evergreen' => ['the Evergreen', 'Roots that no winter can kill.', 'Endless Spring', ['regen' => 0.40, 'hp' => 0.06], 'Ancient Bark grows back thicker each time', 0.45, 0.25],
            'heartwood' => ['the Heartwood', 'The oldest tree in a young forest.', 'Rings of Years', ['taken' => 0.06, 'healRecv' => 0.12], 'Ancient Bark turns aside even crushing blows', 0.40, 0.30],
        ],
        'thornguard' => [
            'bramblelord' => ['the Bramble-Lord', 'Every step leaves thorns behind.', 'Thicket', ['threat' => 0.20, 'dmg' => 0.10], 'Ancient Bark bristles with thorns', 0.40, 0.35],
            'wildwall' => ['the Wild Wall', 'Grows to meet whatever comes.', 'Overgrowth', ['hp' => 0.10, 'block' => 0.04], 'Ancient Bark covers you from root to crown', 0.45, 0.25],
        ],
        // Cleric
        'lightbearer' => [
            'dawnward' => ['the Dawnward', 'Carries the first light of morning into the dark.', 'Daybreak', ['heal' => 0.10, 'crit' => 0.04], 'Divine Hymn rings out like a sunrise', 0.45, 0.25],
            'radiant' => ['the Radiant', 'Shines so bright the wounded forget their wounds.', 'Halo', ['critDmg' => 0.20, 'heal' => 0.05], 'Divine Hymn lands as a blaze of light', 0.40, 0.35],
        ],
        'sentinel' => [
            'bastion' => ['the Bastion of Faith', 'No blow lands that was not foreseen.', 'Foresight', ['heal' => 0.08, 'cdr' => 0.04], 'Divine Hymn arrives a breath before the danger', 0.40, 0.35],
            'warden' => ['the Ever-Watchful', 'Prays before the fight, not after it.', 'Vigil', ['resRegen' => 0.20, 'heal' => 0.05], 'Divine Hymn carries the whole group through', 0.45, 0.25],
        ],
        // Druid
        'grove' => [
            'eldergrove' => ['of the Elder Grove', 'Speaks for the oldest trees.', 'Deep Roots', ['heal' => 0.08, 'resRegen' => 0.15], 'Tranquility blooms into a whole meadow', 0.45, 0.25],
            'seasonsong' => ['the Seasonsong', 'Heals at the pace of the turning year.', 'Long Summer', ['heal' => 0.06, 'haste' => 0.05], 'Tranquility lasts like a summer evening', 0.40, 0.35],
        ],
        'wildcaller' => [
            'packmother' => ['the Pack-Mother', 'The spirits come when they are called, and they bring friends.', 'The Pack', ['heal' => 0.06, 'dmg' => 0.10], 'Tranquility howls with spirit wolves', 0.40, 0.35],
            'stormcaller' => ['the Stormcaller', 'Calls rain on the fire and lightning on the foe.', 'Gathering Storm', ['haste' => 0.06, 'heal' => 0.06], 'Tranquility falls as a healing storm', 0.45, 0.25],
        ],
        // Ranger
        'sharpshooter' => [
            'farsight' => ['Farsight', 'Never misses what it can see, and it sees everything.', 'Eagle Eye', ['crit' => 0.05, 'critDmg' => 0.15], 'Rain of Arrows finds every weak spot', 0.45, 0.25],
            'deadeye' => ['the Deadeye', 'One arrow, one ending.', 'Held Breath', ['critDmg' => 0.25, 'dmg' => 0.04], 'Rain of Arrows strikes like a single perfect shot', 0.40, 0.35],
        ],
        'beastmaster' => [
            'wildheart' => ['the Wildheart', 'Fights as one with the beast at their side.', 'One Pack', ['dmg' => 0.10, 'hp' => 0.05], 'Rain of Arrows drives the companion into a frenzy', 0.40, 0.35],
            'packleader' => ['the Pack-Leader', 'The wild answers this voice.', 'Call of the Wild', ['haste' => 0.07, 'dmg' => 0.05], 'Rain of Arrows falls with the whole pack', 0.45, 0.25],
        ],
        // Mage
        'arcanist' => [
            'starborn' => ['the Starborn', 'Draws power from the sky itself.', 'Starfall', ['critDmg' => 0.20, 'dmg' => 0.06], 'Meteor falls as a burning star', 0.45, 0.25],
            'archmage' => ['the Archmage', 'Has read every book and rewritten some.', 'Perfect Formula', ['cdr' => 0.05, 'dmg' => 0.08], 'Meteor arrives sooner and hits harder', 0.40, 0.35],
        ],
        'frostbinder' => [
            'wintercrown' => ['the Winter-Crown', 'Brings the long winter with them.', 'Endless Winter', ['dmg' => 0.08, 'taken' => 0.05], 'Meteor falls as a mountain of ice', 0.45, 0.25],
            'glacier' => ['the Glacier', 'Slow, patient and unstoppable.', 'Permafrost', ['resRegen' => 0.20, 'dmg' => 0.06], 'Meteor freezes everything it does not crush', 0.40, 0.35],
        ],
        // Rogue
        'duelist' => [
            'bladedancer' => ['the Bladedancer', 'Moves like music, cuts like a sentence.', 'Flowing Steel', ['haste' => 0.07, 'crit' => 0.03], 'Shadow Dance becomes a whirl of blades', 0.45, 0.25],
            'nightblade' => ['the Nightblade', 'The last thing many foes never saw.', 'Killing Edge', ['critDmg' => 0.20, 'dmg' => 0.05], 'Shadow Dance ends in one perfect cut', 0.40, 0.35],
        ],
        'trickster' => [
            'venomweaver' => ['the Venomweaver', 'Every cut carries a gift.', 'Slow Poison', ['dmg' => 0.10, 'dodge' => 0.03], 'Shadow Dance leaves every foe poisoned', 0.40, 0.35],
            'shadowfox' => ['the Shadowfox', 'Never where the blow lands.', 'Sleight', ['dodge' => 0.06, 'dmg' => 0.06], 'Shadow Dance steps through the enemy lines', 0.45, 0.25],
        ],
    ];

    public static function forPath(?string $path): array
    {
        return self::FORMS[$path] ?? [];
    }

    public static function get(?string $path, ?string $form): ?array
    {
        return $form !== null ? (self::FORMS[$path][$form] ?? null) : null;
    }

    /** The form as a modifier bundle for Talents::mods: the capstone stats, the ultimate and the Path skill. */
    public static function effect(string $cls, ?string $path, ?string $form): ?array
    {
        $f = self::get($path, $form);
        if (!$f) {
            return null;
        }
        $skill = [Rules::CLASSES[$cls]['ultimate'][0] => $f[5]];
        foreach (array_keys(Rules::CLASSES[$cls]['paths'][$path][2] ?? []) as $id) {
            $skill[$id] = $f[6];
        }

        return ['stat' => $f[3], 'skill' => $skill];
    }

    /** "Annika the Dawnward". */
    public static function titled(string $name, ?string $path, ?string $form): string
    {
        $f = self::get($path, $form);

        return $f ? $name.' '.$f[0] : $name;
    }
}

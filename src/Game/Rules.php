<?php

namespace App\Game;

/**
 * Static game data: attributes, races, classes, Origins, skills, Keystones, gear, glyphs and legendary powers.
 * Numbers are tuning targets for the proof of concept, not final balance.
 */
final class Rules
{
    public const ATTRIBUTES = [
        'might' => ['Might', 'offense', 'Physical power: swords, arrows, daggers'],
        'arcana' => ['Arcana', 'offense', 'Spell power: missiles, frost, holy damage'],
        'precision' => ['Precision', 'offense', 'Crit chance (curve)'],
        'insight' => ['Insight', 'offense', 'Every skill hits, heals and shields harder'],
        'swiftness' => ['Swiftness', 'tempo', 'Haste: attack and cast speed'],
        'ferocity' => ['Ferocity', 'tempo', 'MEGA crit chance (curve) and crit damage'],
        'focus' => ['Focus', 'tempo', 'Cooldown recovery (curve)'],
        'vitality' => ['Vitality', 'defense', 'Max health'],
        'guard' => ['Guard', 'defense', 'Armor and block (curve)'],
        'agility' => ['Agility', 'defense', 'Dodge (curve)'],
        'tenacity' => ['Tenacity', 'defense', 'Less damage taken from everything (curve)'],
        'spirit' => ['Spirit', 'sustain', 'Healing power'],
        'recovery' => ['Recovery', 'sustain', 'Health regen and healing received'],
        'resolve' => ['Resolve', 'sustain', 'Debuff and knockback resistance (curve)'],
        'hunger' => ['Hunger', 'sustain', 'Lifesteal: damage you deal heals you (curve)'],
        'wisdom' => ['Wisdom', 'resources', 'Max mana and mana regen'],
        'stamina' => ['Stamina', 'resources', 'Max energy and energy regen'],
        'fury' => ['Fury', 'resources', 'Max rage and rage gained per hit'],
        'thrift' => ['Thrift', 'resources', 'Skills cost less (curve)'],
        'presence' => ['Presence', 'group', 'Threat'],
        'command' => ['Command', 'group', 'Strength of buffs you give allies'],
        'fortune' => ['Fortune', 'group', 'Gold and materials (never item drops)'],
        'lore' => ['Lore', 'group', 'More XP and Renown'],
    ];

    /**
     * What every attribute does for each class on top of its own effect, so no attribute is useful to one class only.
     *   stat/type => [key => v]   v at one point per level in that attribute (it grows with points, shrinks with level)
     *   as => [attr => f]         that share of the attribute also counts as another attribute
     */
    public const TWISTS = [
        'guardian' => [
            'might' => ['stat' => ['threat' => 0.25]], 'arcana' => ['stat' => ['block' => 0.10]], 'precision' => ['stat' => ['rageGain' => 0.20]],
            'insight' => ['type' => ['aoe' => 0.20]], 'swiftness' => ['stat' => ['threat' => 0.15]], 'ferocity' => ['type' => ['strike' => 0.20]],
            'focus' => ['type' => ['wall' => 0.25]], 'vitality' => ['stat' => ['regen' => 0.40]], 'guard' => ['type' => ['strike' => 0.12]],
            'agility' => ['stat' => ['block' => 0.08]], 'tenacity' => ['stat' => ['threat' => 0.15]], 'spirit' => ['stat' => ['healRecv' => 0.15]],
            'recovery' => ['stat' => ['taken' => 0.05]], 'resolve' => ['stat' => ['hp' => 0.08]], 'hunger' => ['stat' => ['rageGain' => 0.15]],
            'wisdom' => ['stat' => ['cdr' => 0.08]], 'stamina' => ['stat' => ['hp' => 0.06]], 'fury' => ['stat' => ['dmg' => 0.12]],
            'thrift' => ['stat' => ['cdr' => 0.06]], 'presence' => ['stat' => ['taken' => 0.04]], 'command' => ['type' => ['shield' => 0.25]],
            'fortune' => ['stat' => ['crit' => 0.05]], 'lore' => ['stat' => ['hp' => 0.05]],
        ],
        'warden' => [
            'might' => ['stat' => ['regen' => 0.30]], 'arcana' => ['type' => ['aoe' => 0.20]], 'precision' => ['stat' => ['threat' => 0.15]],
            'insight' => ['type' => ['wall' => 0.25]], 'swiftness' => ['type' => ['hot' => 0.20]], 'ferocity' => ['type' => ['aoe' => 0.15]],
            'focus' => ['type' => ['shield' => 0.20]], 'vitality' => ['type' => ['hot' => 0.25]], 'guard' => ['stat' => ['regen' => 0.25]],
            'agility' => ['stat' => ['taken' => 0.04]], 'tenacity' => ['stat' => ['regen' => 0.25]], 'spirit' => ['as' => ['recovery' => 0.5]],
            'recovery' => ['stat' => ['hp' => 0.06]], 'resolve' => ['stat' => ['regen' => 0.25]], 'hunger' => ['stat' => ['threat' => 0.15]],
            'wisdom' => ['type' => ['shield' => 0.15]], 'stamina' => ['stat' => ['dodge' => 0.05]], 'fury' => ['stat' => ['threat' => 0.20]],
            'thrift' => ['stat' => ['rageGain' => 0.15]], 'presence' => ['stat' => ['hp' => 0.05]], 'command' => ['stat' => ['healRecv' => 0.12]],
            'fortune' => ['stat' => ['dodge' => 0.04]], 'lore' => ['stat' => ['regen' => 0.20]],
        ],
        'cleric' => [
            'might' => ['as' => ['spirit' => 0.4]], 'arcana' => ['type' => ['shield' => 0.20]], 'precision' => ['type' => ['heal' => 0.15]],
            'insight' => ['stat' => ['cdr' => 0.06]], 'swiftness' => ['type' => ['groupheal' => 0.15]], 'ferocity' => ['stat' => ['critDmg' => 0.15]],
            'focus' => ['stat' => ['resRegen' => 0.15]], 'vitality' => ['stat' => ['heal' => 0.06]], 'guard' => ['stat' => ['taken' => 0.05]],
            'agility' => ['stat' => ['threat' => -0.20]], 'tenacity' => ['stat' => ['resRegen' => 0.10]], 'spirit' => ['type' => ['hot' => 0.10]],
            'recovery' => ['type' => ['hot' => 0.15]], 'resolve' => ['stat' => ['resRegen' => 0.12]], 'hunger' => ['stat' => ['heal' => 0.05]],
            'wisdom' => ['stat' => ['heal' => 0.06]], 'stamina' => ['stat' => ['resRegen' => 0.15]], 'fury' => ['stat' => ['crit' => 0.05]],
            'thrift' => ['type' => ['groupheal' => 0.15]], 'presence' => ['type' => ['shield' => 0.15]], 'command' => ['type' => ['groupheal' => 0.20]],
            'fortune' => ['stat' => ['resRegen' => 0.10]], 'lore' => ['type' => ['heal' => 0.10]],
        ],
        'druid' => [
            'might' => ['type' => ['pet' => 0.25]], 'arcana' => ['as' => ['spirit' => 0.4]], 'precision' => ['type' => ['hot' => 0.15]],
            'insight' => ['type' => ['groupheal' => 0.15]], 'swiftness' => ['stat' => ['resRegen' => 0.12]], 'ferocity' => ['type' => ['pet' => 0.20]],
            'focus' => ['type' => ['hot' => 0.20]], 'vitality' => ['type' => ['shield' => 0.20]], 'guard' => ['type' => ['shield' => 0.15]],
            'agility' => ['stat' => ['dodge' => 0.06]], 'tenacity' => ['stat' => ['heal' => 0.05]], 'spirit' => ['type' => ['groupheal' => 0.10]],
            'recovery' => ['as' => ['spirit' => 0.3]], 'resolve' => ['stat' => ['taken' => 0.04]], 'hunger' => ['stat' => ['regen' => 0.30]],
            'wisdom' => ['type' => ['hot' => 0.10]], 'stamina' => ['stat' => ['haste' => 0.06]], 'fury' => ['type' => ['strike' => 0.25]],
            'thrift' => ['stat' => ['resRegen' => 0.12]], 'presence' => ['type' => ['pet' => 0.20]], 'command' => ['type' => ['hot' => 0.20]],
            'fortune' => ['stat' => ['heal' => 0.04]], 'lore' => ['type' => ['heal' => 0.10]],
        ],
        'ranger' => [
            'might' => ['type' => ['pet' => 0.15]], 'arcana' => ['type' => ['dot' => 0.25]], 'precision' => ['type' => ['mark' => 0.25]],
            'insight' => ['type' => ['mark' => 0.20]], 'swiftness' => ['type' => ['strike' => 0.10]], 'ferocity' => ['type' => ['pet' => 0.20]],
            'focus' => ['type' => ['aoe' => 0.20]], 'vitality' => ['stat' => ['dmg' => 0.05]], 'guard' => ['stat' => ['taken' => 0.04]],
            'agility' => ['stat' => ['crit' => 0.05]], 'tenacity' => ['stat' => ['dodge' => 0.04]], 'spirit' => ['type' => ['pet' => 0.25]],
            'recovery' => ['stat' => ['regen' => 0.30]], 'resolve' => ['stat' => ['dmg' => 0.04]], 'hunger' => ['type' => ['dot' => 0.20]],
            'wisdom' => ['stat' => ['cdr' => 0.08]], 'stamina' => ['stat' => ['haste' => 0.06]], 'fury' => ['stat' => ['critDmg' => 0.15]],
            'thrift' => ['stat' => ['haste' => 0.05]], 'presence' => ['stat' => ['threat' => -0.25]], 'command' => ['stat' => ['dmg' => 0.06]],
            'fortune' => ['stat' => ['crit' => 0.06]], 'lore' => ['stat' => ['critDmg' => 0.10]],
        ],
        'mage' => [
            'might' => ['type' => ['aoe' => 0.20]], 'arcana' => ['stat' => ['critDmg' => 0.10]], 'precision' => ['type' => ['dot' => 0.20]],
            'insight' => ['stat' => ['crit' => 0.05]], 'swiftness' => ['stat' => ['cdr' => 0.06]], 'ferocity' => ['type' => ['aoe' => 0.15]],
            'focus' => ['type' => ['buff' => 0.25]], 'vitality' => ['as' => ['arcana' => 0.2]], 'guard' => ['stat' => ['taken' => 0.05]],
            'agility' => ['stat' => ['haste' => 0.05]], 'tenacity' => ['stat' => ['dmg' => 0.04]], 'spirit' => ['stat' => ['resRegen' => 0.15]],
            'recovery' => ['stat' => ['resRegen' => 0.10]], 'resolve' => ['stat' => ['dmg' => 0.05]], 'hunger' => ['type' => ['dot' => 0.20]],
            'wisdom' => ['stat' => ['dmg' => 0.05]], 'stamina' => ['stat' => ['haste' => 0.05]], 'fury' => ['stat' => ['crit' => 0.06]],
            'thrift' => ['stat' => ['dmg' => 0.05]], 'presence' => ['stat' => ['threat' => -0.25]], 'command' => ['type' => ['buff' => 0.20]],
            'fortune' => ['stat' => ['critDmg' => 0.10]], 'lore' => ['stat' => ['cdr' => 0.05]],
        ],
        'rogue' => [
            'might' => ['type' => ['dot' => 0.15]], 'arcana' => ['type' => ['dot' => 0.25]], 'precision' => ['stat' => ['critDmg' => 0.10]],
            'insight' => ['type' => ['aoe' => 0.20]], 'swiftness' => ['type' => ['strike' => 0.10]], 'ferocity' => ['stat' => ['crit' => 0.05]],
            'focus' => ['type' => ['buff' => 0.25]], 'vitality' => ['stat' => ['dodge' => 0.04]], 'guard' => ['stat' => ['dodge' => 0.05]],
            'agility' => ['stat' => ['dmg' => 0.06]], 'tenacity' => ['stat' => ['dodge' => 0.05]], 'spirit' => ['stat' => ['regen' => 0.30]],
            'recovery' => ['stat' => ['dodge' => 0.04]], 'resolve' => ['stat' => ['crit' => 0.04]], 'hunger' => ['type' => ['strike' => 0.15]],
            'wisdom' => ['type' => ['dot' => 0.15]], 'stamina' => ['stat' => ['dmg' => 0.05]], 'fury' => ['stat' => ['critDmg' => 0.15]],
            'thrift' => ['stat' => ['haste' => 0.06]], 'presence' => ['stat' => ['threat' => -0.30]], 'command' => ['type' => ['strike' => 0.12]],
            'fortune' => ['stat' => ['crit' => 0.05]], 'lore' => ['stat' => ['crit' => 0.04]],
        ],
    ];

    public const POINTS_PER_LEVEL = 6;
    public const SOFT_CAP_SHARE = 0.20;
    public const OATH_LEVEL = 20;
    public const PATH_LEVEL = 10;
    public const KEYSTONE_LEVELS = [15, 25, 35, 45];
    public const ULTIMATE_LEVEL = 20;

    /** The first days: new heroes are marked on the tavern board; veterans who run with them earn the mentor bonus. */
    public const NEWCOMER_DAYS = 3;
    public const NEWCOMER_LEVEL = 15;
    public const MENTOR_LEVEL = 20;
    public const MENTOR_BONUS = 0.20;

    /** Joining a group in its tier's scarcest role: this many chests roll twice and keep the higher, once a day. */
    public const SCARCE_ROLLS = 5;
    public const REFORGE_LEVEL = 50;
    public const LOADOUT_SIZE = 5;

    public const RACES = [
        'human' => ['name' => 'Human', 'points' => ['might' => 4, 'vitality' => 4, 'command' => 4], 'passive' => ['versatile', 'Versatile', '5% more XP from every battle']],
        'elf' => ['name' => 'Elf', 'points' => ['precision' => 8, 'wisdom' => 4], 'passive' => ['keenSenses', 'Keen Senses', 'Crits refund a little mana or energy']],
        'dwarf' => ['name' => 'Dwarf', 'points' => ['guard' => 8, 'resolve' => 4], 'passive' => ['stoneblood', 'Stoneblood', 'Immune to knockback']],
        'orc' => ['name' => 'Orc', 'points' => ['fury' => 8, 'vitality' => 4], 'passive' => ['bloodfury', 'Bloodfury', 'Below half health, Might and Arcana count 10% higher']],
        'felkin' => ['name' => 'Felkin', 'points' => ['agility' => 8, 'swiftness' => 4], 'passive' => ['nineLives', 'Nine Lives', 'Once per battle, survive a killing blow with 1 health']],
        'draka' => ['name' => 'Draka', 'points' => ['recovery' => 8, 'arcana' => 4], 'passive' => ['emberHeart', 'Ember Heart', 'Half damage from fire, Recovery counts 10% higher']],
    ];

    public const ORIGINS = [
        'anvil' => ['Anvil', 'guard', 'Tempering costs 10% less'],
        'lantern' => ['Lantern', 'spirit', 'Your first heal each battle is a crit'],
        'comet' => ['Comet', 'ferocity', 'MEGA crits add 2 to the combo counter'],
        'fox' => ['Fox', 'agility', 'After a dodge, your next hit is a crit'],
        'oak' => ['Oak', 'vitality', 'Start every pack with a small shield'],
        'bell' => ['Bell', 'presence', 'Taunts recover 20% faster'],
        'tide' => ['Tide', 'wisdom', 'Mana regen doubles between packs'],
        'hare' => ['Hare', 'stamina', 'Energy refills between packs'],
        'wolf' => ['Wolf', 'fury', "Rage doesn't fade between packs"],
        'hawk' => ['Hawk', 'precision', 'Your first hit on each boss is a crit'],
        'ember' => ['Ember', 'arcana', 'Spell crits set the target burning'],
        'crown' => ['Crown', 'command', 'Buffs you give last 2 seconds longer'],
    ];
    public const ORIGIN_POINTS = 6;

    /**
     * Skill types: strike (one enemy), aoe (all enemies), heal (lowest ally), groupheal, hot, shield, taunt,
     * wall (damage reduction), buff (own damage), mark (enemy takes more damage), slow (enemy attacks slower),
     * vanish (drop threat), dot (damage over time), pet (extra attacker for a while).
     * mult scales from the hero's power for the skill's school; cost is in the class resource.
     */
    public const CLASSES = [
        'guardian' => [
            'name' => 'Guardian', 'role' => 'tank', 'resource' => 'rage', 'school' => 'might',
            'points' => ['guard' => 8, 'vitality' => 6, 'fury' => 4, 'presence' => 2],
            'passive' => ['oathbound', 'Oathbound', 'Guard counts higher while an ally is below half health'],
            'suggest' => ['guard' => 3, 'vitality' => 3, 'presence' => 2, 'fury' => 1, 'might' => 1, 'resolve' => 1],
            'kit' => ['weapon' => 'sword', 'offhand' => 'shield', 'top' => 'plate', 'bottom' => 'greaves', 'shoes' => 'sabatons'],
            'skills' => [
                'shieldSlam' => ['Shield Slam', 1, 'strike', 1.3, 10, 4, ['threat' => 5]],
                'taunt' => ['Taunting Shout', 3, 'taunt', 0, 0, 12, []],
                'shieldWall' => ['Shield Wall', 5, 'wall', 0.30, 20, 24, ['dur' => 8, 'party' => true]],
                'cleave' => ['Cleave', 8, 'aoe', 0.7, 15, 6, ['threat' => 4]],
                'shieldThrow' => ['Shield Throw', 12, 'strike', 1.6, 12, 6, ['threat' => 5]],
                'rallyingCry' => ['Rallying Cry', 16, 'shield', 0.10, 25, 30, ['party' => true, 'ofHp' => true]],
            ],
            'paths' => [
                'bulwark' => ['Bulwark', 'Blocks and group damage reduction', ['bastion' => ['Bastion', 10, 'wall', 0.45, 20, 20, ['dur' => 6]]]],
                'vanguard' => ['Vanguard', 'Holds threat through damage', ['counterstrike' => ['Counterstrike', 10, 'strike', 2.2, 20, 8, ['threat' => 6]]]],
            ],
            'ultimate' => ['lastStand', 'Last Stand', 20, 'wall', 0.40, 0, 90, ['dur' => 10, 'party' => true]],
        ],
        'warden' => [
            'name' => 'Warden', 'role' => 'tank', 'resource' => 'rage', 'school' => 'might',
            'points' => ['vitality' => 8, 'recovery' => 6, 'fury' => 4, 'presence' => 2],
            'passive' => ['deepRoots', 'Deep Roots', 'Regenerate health while holding position'],
            'suggest' => ['vitality' => 3, 'recovery' => 2, 'guard' => 2, 'presence' => 2, 'fury' => 1, 'might' => 1],
            'kit' => ['weapon' => 'hammer', 'offhand' => 'buckler', 'top' => 'leather', 'bottom' => 'kilt', 'shoes' => 'boots'],
            'skills' => [
                'rootbreak' => ['Rootbreak', 1, 'aoe', 0.8, 10, 6, ['threat' => 5]],
                'barkskin' => ['Barkskin', 3, 'shield', 0.35, 20, 15, ['self' => true, 'ofHp' => true]],
                'thornLash' => ['Thorn Lash', 5, 'strike', 1.4, 10, 4, ['threat' => 5]],
                'roar' => ['Taunting Roar', 8, 'taunt', 0, 0, 12, []],
                'entangle' => ['Entangling Roots', 12, 'slow', 0.25, 15, 18, ['dur' => 6, 'aoeMult' => 0.5]],
                'ironwood' => ['Ironwood', 16, 'wall', 0.25, 20, 22, ['dur' => 8]],
            ],
            'paths' => [
                'oakheart' => ['Oakheart', 'Regeneration and self-healing', ['regrowth' => ['Regrowth', 10, 'hot', 0.20, 15, 20, ['self' => true, 'dur' => 10, 'ofHp' => true]]]],
                'thornguard' => ['Thornguard', 'Reflects damage on big pulls', ['bramble' => ['Bramble Aura', 10, 'aoe', 1.2, 20, 12, ['threat' => 6]]]],
            ],
            'ultimate' => ['ancientBark', 'Ancient Bark', 20, 'wall', 0.60, 0, 90, ['dur' => 12]],
        ],
        'cleric' => [
            'name' => 'Cleric', 'role' => 'healer', 'resource' => 'mana', 'school' => 'spirit',
            'points' => ['spirit' => 8, 'wisdom' => 6, 'vitality' => 3, 'command' => 3],
            'passive' => ['lastRite', 'Last Rite', 'Once per clear, saves an ally from a killing blow'],
            'suggest' => ['spirit' => 4, 'wisdom' => 3, 'vitality' => 1, 'focus' => 1, 'precision' => 1],
            'kit' => ['weapon' => 'wand', 'offhand' => 'book', 'top' => 'robe', 'bottom' => 'pants', 'shoes' => 'boots'],
            'skills' => [
                'mendingLight' => ['Mending Light', 1, 'heal', 2.6, 22, 2, []],
                'smite' => ['Smite', 3, 'strike', 0.9, 8, 3, ['school' => 'arcana']],
                'sanctuary' => ['Sanctuary', 5, 'groupheal', 1.1, 40, 10, []],
                'holyWard' => ['Holy Ward', 8, 'shield', 2.2, 28, 8, ['tank' => true]],
                'renew' => ['Renew', 12, 'hot', 2.4, 20, 4, ['dur' => 10]],
                'prayerOfLight' => ['Prayer of Light', 16, 'groupheal', 1.4, 45, 14, []],
            ],
            'paths' => [
                'lightbearer' => ['Lightbearer', 'Big direct heals and critical heals', ['radiance' => ['Radiance', 10, 'heal', 4.6, 45, 12, []]]],
                'sentinel' => ['Sentinel', 'Shields before damage lands', ['aegis' => ['Aegis', 10, 'shield', 1.6, 55, 20, ['party' => true]]]],
            ],
            'ultimate' => ['divineHymn', 'Divine Hymn', 20, 'groupheal', 4.0, 0, 90, []],
        ],
        'druid' => [
            'name' => 'Druid', 'role' => 'healer', 'resource' => 'mana', 'school' => 'spirit',
            'points' => ['spirit' => 7, 'wisdom' => 5, 'swiftness' => 5, 'recovery' => 3],
            'passive' => ['seasons', 'Seasons', 'Heals grow stronger the longer a fight lasts'],
            'suggest' => ['spirit' => 4, 'wisdom' => 3, 'swiftness' => 2, 'vitality' => 1],
            'kit' => ['weapon' => 'staff', 'offhand' => 'none', 'top' => 'robe', 'bottom' => 'pants', 'shoes' => 'sandals'],
            'skills' => [
                'rejuvenate' => ['Rejuvenate', 1, 'hot', 5.0, 18, 1, ['dur' => 12]],
                'wildGrowth' => ['Wild Growth', 3, 'hot', 2.6, 45, 12, ['dur' => 8, 'party' => true]],
                'swiftmend' => ['Swiftmend', 5, 'heal', 3.0, 22, 6, []],
                'moonfire' => ['Moonfire', 8, 'strike', 0.8, 8, 3, ['school' => 'arcana']],
                'lifebloom' => ['Lifebloom', 12, 'heal', 2.2, 18, 3, []],
                'barkward' => ['Barkward', 16, 'shield', 1.8, 26, 10, ['tank' => true]],
            ],
            'paths' => [
                'grove' => ['Grove', 'Heal-over-time that ramps through long fights', ['tranquilGrove' => ['Tranquil Grove', 10, 'groupheal', 1.8, 55, 20, []]]],
                'wildcaller' => ['Wildcaller', 'Healing spirits that also bite', ['spiritWolves' => ['Spirit Wolves', 10, 'pet', 0.7, 40, 20, ['dur' => 12, 'school' => 'arcana']]]],
            ],
            'ultimate' => ['tranquility', 'Tranquility', 20, 'groupheal', 4.5, 0, 90, []],
        ],
        'ranger' => [
            'name' => 'Ranger', 'role' => 'dps', 'resource' => 'energy', 'school' => 'might',
            'points' => ['might' => 8, 'stamina' => 5, 'swiftness' => 4, 'command' => 3],
            'passive' => ['steadyAim', 'Steady Aim', 'Each hit on the same target grows stronger'],
            'suggest' => ['might' => 4, 'precision' => 2, 'swiftness' => 2, 'stamina' => 1, 'vitality' => 1],
            'kit' => ['weapon' => 'bow', 'offhand' => 'none', 'top' => 'leather', 'bottom' => 'pants', 'shoes' => 'boots'],
            'skills' => [
                'aimedShot' => ['Aimed Shot', 1, 'strike', 1.5, 20, 0, []],
                'volley' => ['Volley', 3, 'aoe', 0.85, 30, 6, []],
                'markedPrey' => ['Marked Prey', 5, 'mark', 0.15, 15, 20, ['dur' => 10]],
                'snareTrap' => ['Snare Trap', 8, 'slow', 0.25, 10, 20, ['dur' => 8]],
                'multiShot' => ['Multi-Shot', 12, 'aoe', 1.0, 28, 8, []],
                'serpentSting' => ['Serpent Sting', 16, 'dot', 2.6, 18, 10, ['dur' => 10]],
            ],
            'paths' => [
                'sharpshooter' => ['Sharpshooter', 'Single target and crits', ['piercingShot' => ['Piercing Shot', 10, 'strike', 3.2, 35, 12, []]]],
                'beastmaster' => ['Beastmaster', 'A companion that fights beside you', ['callCompanion' => ['Call Companion', 10, 'pet', 0.9, 30, 20, ['dur' => 15]]]],
            ],
            'ultimate' => ['rainOfArrows', 'Rain of Arrows', 20, 'aoe', 4.0, 0, 90, []],
        ],
        'mage' => [
            'name' => 'Mage', 'role' => 'dps', 'resource' => 'mana', 'school' => 'arcana',
            'points' => ['arcana' => 10, 'wisdom' => 5, 'ferocity' => 3, 'precision' => 2],
            'passive' => ['overcharge', 'Overcharge', 'Crits refund part of their mana cost'],
            'suggest' => ['arcana' => 4, 'wisdom' => 2, 'ferocity' => 2, 'precision' => 1, 'vitality' => 1],
            'kit' => ['weapon' => 'staff', 'offhand' => 'book', 'top' => 'robe', 'bottom' => 'pants', 'shoes' => 'curly'],
            'skills' => [
                'arcaneBarrage' => ['Arcane Barrage', 5, 'strike', 2.0, 24, 4, []],
                'frostNova' => ['Frost Nova', 3, 'slow', 0.30, 25, 15, ['dur' => 6, 'aoeMult' => 0.6]],
                'fireball' => ['Fireball', 1, 'strike', 1.2, 16, 0, ['fire' => true]],
                'blizzard' => ['Blizzard', 8, 'aoe', 1.0, 38, 10, []],
                'livingBomb' => ['Living Bomb', 12, 'dot', 2.8, 22, 10, ['dur' => 8]],
                'iceLance' => ['Ice Lance', 16, 'strike', 1.6, 18, 3, []],
            ],
            'paths' => [
                'arcanist' => ['Arcanist', 'Burst damage and MEGA crits', ['arcaneSurge' => ['Arcane Surge', 10, 'buff', 0.40, 20, 30, ['dur' => 10]]]],
                'frostbinder' => ['Frostbinder', 'Freezes that take pressure off the tank', ['deepFreeze' => ['Deep Freeze', 10, 'slow', 0.40, 30, 20, ['dur' => 6, 'aoeMult' => 1.5]]]],
            ],
            'ultimate' => ['meteor', 'Meteor', 20, 'aoe', 6.0, 0, 90, ['fire' => true]],
        ],
        'rogue' => [
            'name' => 'Rogue', 'role' => 'dps', 'resource' => 'energy', 'school' => 'might',
            'points' => ['might' => 8, 'stamina' => 4, 'swiftness' => 4, 'agility' => 4],
            'passive' => ['keenEye', 'Keen Eye', 'Items in the group chest roll rarity slightly higher'],
            'suggest' => ['might' => 4, 'swiftness' => 2, 'precision' => 1, 'ferocity' => 1, 'stamina' => 1, 'vitality' => 1],
            'kit' => ['weapon' => 'daggers', 'offhand' => 'none', 'top' => 'tunic', 'bottom' => 'shorts', 'shoes' => 'boots'],
            'skills' => [
                'twinStrike' => ['Twin Strike', 1, 'strike', 1.4, 18, 0, []],
                'smokeBomb' => ['Smoke Bomb', 3, 'vanish', 0.3, 10, 20, []],
                'fanOfKnives' => ['Fan of Knives', 5, 'aoe', 0.75, 25, 5, []],
                'poisonedBlade' => ['Poisoned Blade', 8, 'dot', 2.4, 20, 10, ['dur' => 10]],
                'backstab' => ['Backstab', 12, 'strike', 2.0, 25, 6, []],
                'exposeArmor' => ['Expose Armor', 16, 'mark', 0.12, 20, 20, ['dur' => 10]],
            ],
            'paths' => [
                'duelist' => ['Duelist', 'Combo chains on one target', ['eviscerate' => ['Eviscerate', 10, 'strike', 3.4, 35, 10, []]]],
                'trickster' => ['Trickster', 'Poisons, debuffs and interrupts', ['cripple' => ['Cripple', 10, 'mark', 0.12, 20, 15, ['dur' => 10, 'slow' => 0.15]]]],
            ],
            'ultimate' => ['shadowDance', 'Shadow Dance', 20, 'buff', 0.60, 0, 90, ['dur' => 8]],
        ],
    ];

    /** Keystones at level 15 per role (more Keystone levels reuse the remaining options). */
    public const KEYSTONES = [
        'tank' => [
            'ironWill' => ['Iron Will', 'Walls and shields are 30% stronger'],
            'provoker' => ['Provoker', 'All threat you generate is 50% higher'],
            'rallyingWall' => ['Rallying Wall', 'The whole party takes 5% less damage while you stand'],
            'spikedGuard' => ['Spiked Guard', 'Blocked hits strike back for 40% of your power'],
            'secondWind' => ['Second Wind', 'Below 30% health, gain a shield worth 20% of your health once per pack'],
            'unmovable' => ['Unmovable', 'Immune to knockback and 20% more Resolve'],
        ],
        'healer' => [
            'overflow' => ['Overflow', 'Overhealing turns into a shield worth half of it'],
            'quickened' => ['Quickened', 'Healing skills recover 30% faster'],
            'frugal' => ['Frugal', 'Healing skills cost 25% less'],
            'guardianAngel' => ['Guardian Angel', 'Heals on allies below 30% health are 40% stronger'],
            'battleCleric' => ['Battle Healer', 'Your damage skills also heal the lowest ally for 50% of the damage'],
            'deepWell' => ['Deep Well', 'Mana regen is 30% higher'],
        ],
        'dps' => [
            'shrapnel' => ['Shrapnel', 'Area skills deal 40% more, single-target skills 10% less'],
            'patientHunter' => ['Patient Hunter', 'Your first hit on each pack and boss is a crit'],
            'teamPlayer' => ['Team Player', 'Your marks and buffs also give the party 5% more damage'],
            'executioner' => ['Executioner', '+50% damage to enemies below 25% health'],
            'quietBlade' => ['Quiet Blade', 'You generate 40% less threat'],
            'bloodthirst' => ['Bloodthirst', 'Crits heal you for 5% of the damage'],
        ],
    ];

    /** Visible slots map to the pixel renderer's layers; jewelry slots carry stats only. */
    public const SLOTS = [
        'head' => ['Head', 'hat'], 'top' => ['Chest', 'top'], 'bottom' => ['Legs', 'bottom'], 'shoes' => ['Feet', 'shoes'],
        'gloves' => ['Hands', 'gloves'], 'cape' => ['Back', 'cape'], 'weapon' => ['Main hand', 'weapon'], 'offhand' => ['Off hand', 'offhand'],
        'ring1' => ['Ring', null], 'ring2' => ['Ring', null], 'amulet' => ['Amulet', null], 'trinket' => ['Trinket', null],
    ];

    /**
     * Item looks. A dropped rare, epic or legendary gets one of its rarity's palettes from its seed, so two of the
     * same base rarely look alike; commons wear the hero's own colours. Any worn item can be dyed from DYES and
     * METALS. A palette is [cloth, trim, metal]; cloth and trim map to the renderer's dye1 and dye2.
     */
    public const ITEM_PALETTES = [
        'rare' => [['#3f6fb8', '#e9e2cf', '#bfcadb'], ['#2e8a7a', '#f1e6c8', '#c8d2da'], ['#4a5a9c', '#d9a441', '#b8c2cc'], ['#3d7a3f', '#e4d6b0', '#a9b4a0'], ['#8a3a3a', '#ece4d4', '#c0c6cc'], ['#5a6a7a', '#7fc4e0', '#d8dee4']],
        'epic' => [['#6b3fa8', '#f0c23a', '#b9a6d6'], ['#8a2f6a', '#f2d7a0', '#c9a6c0'], ['#2f3f8a', '#c084ff', '#a6b0d6'], ['#1f5e5a', '#e05aff', '#9fc4c0'], ['#5a1f2f', '#ffb0c8', '#d6a6b0'], ['#3a2a5a', '#7af0d0', '#b0a6d6']],
        'legendary' => [['#b8401a', '#fff0b0', '#e8b84a'], ['#7a1a1a', '#ffd25a', '#f0c060'], ['#1a3a6a', '#ffe9a0', '#e0c070'], ['#2a2a2a', '#ff8a2a', '#d8a040']],
    ];
    public const DYES = [
        '#c0392b', '#e67e22', '#f1c40f', '#3aa655', '#2e8a7a', '#2f6fd0', '#4a5a9c', '#5b3fa8', '#8a2f6a', '#e98ab0', '#ece4d4', '#8c6a4c', '#5a3a24', '#3d3a44', '#1e1c22', '#9aa4ae',
        '#7a1f1f', '#ff7a5a', '#b8860b', '#9acd32', '#1f5e3a', '#5fd0c0', '#87ceeb', '#1a2f6a', '#9a7ad8', '#d8a0e8', '#c71585', '#f5deb3', '#d2691e', '#708090', '#556b2f', '#ffd8a8',
    ];
    public const METALS = ['#b8c2cc', '#e0b04a', '#c58a5a', '#8a939e', '#d8dee4', '#3d3a44'];
    public const DYE_COST = 25;

    public const BASES = [
        'head' => ['helm' => 'Iron Helm', 'viking' => 'Horned Helm', 'wizard' => 'Wizard Hat', 'pot' => 'Cooking Pot', 'frog' => 'Frog Hood', 'crown' => 'Little Crown', 'bandana' => 'Bandana', 'hood' => 'Hood'],
        'top' => ['plate' => 'Breastplate', 'leather' => 'Leather Vest', 'robe' => 'Robe', 'tunic' => 'Tunic', 'sweater' => 'Cozy Sweater'],
        'bottom' => ['pants' => 'Trousers', 'shorts' => 'Shorts', 'kilt' => 'Kilt', 'greaves' => 'Greaves'],
        'shoes' => ['boots' => 'Boots', 'sabatons' => 'Sabatons', 'sandals' => 'Sandals', 'curly' => 'Curly Shoes'],
        'gloves' => ['gauntlets' => 'Gauntlets', 'leather' => 'Leather Gloves'],
        'cape' => ['cape' => 'Cape', 'scarf' => 'Long Scarf'],
        'weapon' => ['sword' => 'Sword', 'axe' => 'Axe', 'hammer' => 'Hammer', 'spear' => 'Spear', 'staff' => 'Staff', 'wand' => 'Wand', 'bow' => 'Bow', 'daggers' => 'Daggers', 'pan' => 'Frying Pan', 'fish' => 'Fish'],
        'offhand' => ['shield' => 'Kite Shield', 'buckler' => 'Buckler', 'book' => 'Spellbook'],
        'ring1' => ['ring' => 'Ring'], 'ring2' => ['ring' => 'Ring'], 'amulet' => ['amulet' => 'Amulet'], 'trinket' => ['trinket' => 'Trinket'],
    ];

    /** Affix per attribute: [prefix or suffix, word]. */
    public const AFFIXES = [
        'might' => ['pre', 'Brutal'], 'arcana' => ['pre', 'Arcane'], 'precision' => ['suf', 'of the Hawk'],
        'swiftness' => ['pre', 'Swift'], 'ferocity' => ['pre', 'Savage'], 'focus' => ['suf', 'of Focus'],
        'vitality' => ['pre', 'Sturdy'], 'guard' => ['pre', 'Stalwart'], 'agility' => ['pre', 'Nimble'],
        'spirit' => ['pre', 'Blessed'], 'recovery' => ['suf', 'of Mending'], 'resolve' => ['pre', 'Resolute'],
        'wisdom' => ['suf', 'of the Sage'], 'stamina' => ['pre', 'Tireless'], 'fury' => ['pre', 'Furious'],
        'presence' => ['pre', 'Imposing'], 'command' => ['suf', 'of Command'], 'fortune' => ['pre', 'Lucky'],
        'insight' => ['suf', 'of Insight'], 'tenacity' => ['pre', 'Unyielding'], 'hunger' => ['pre', 'Ravenous'],
        'thrift' => ['suf', 'of Thrift'], 'lore' => ['suf', 'of Lore'],
    ];

    public const RARITIES = [
        'common' => ['Common', 1, 0, 60.0],
        'rare' => ['Rare', 2, 1, 30.0],
        'epic' => ['Epic', 3, 2, 9.4],
        'legendary' => ['Legendary', 4, 3, 0.6],
    ];

    /** Glyph themes: attribute they add and the Resonance they build at 3 / 6 / 9. */
    public const GLYPHS = [
        'ember' => ['Ember', 'ferocity', '#ff8a3d', 'Crits set the target burning for 20% more damage'],
        'frost' => ['Frost', 'focus', '#7fd4ff', 'Your hits slow enemy attacks by 3%'],
        'thorn' => ['Thorn', 'agility', '#6fbf4a', 'Enemies that hit you take 15% of your power back'],
        'tide' => ['Tide', 'wisdom', '#3fa0c8', 'Overhealing turns into a shield on the lowest ally'],
        'storm' => ['Storm', 'swiftness', '#c9a8ff', 'Crits chain to a second enemy for 30%'],
        'shadow' => ['Shadow', 'precision', '#8a6fb0', 'You generate 20% less threat'],
        'light' => ['Light', 'spirit', '#ffe27a', 'Heals on allies below 30% health are 20% stronger'],
        'stone' => ['Stone', 'guard', '#a89c8e', 'Blocking a hit gives the lowest ally a small shield'],
    ];

    public const LEGENDARY_POWERS = [
        'phoenixRite' => ['Phoenix Rite', 'Once per battle, rise again at half health'],
        'echo' => ['Echoing Skills', 'Skills have a 20% chance to cast twice'],
        'everbloom' => ['Everbloom', 'Your heals leave a heal-over-time for 30% more'],
        'titanGrip' => ["Titan's Grip", 'Your weapon damage counts 25% higher'],
        'starfall' => ['Starfall', 'MEGA crits hit every enemy'],
    ];

    public const SIGNATURE_LEVEL = 30;

    /** Every tenth Mastery level adds a trait, in this order and then round again. */
    public const SIGNATURE_TRAITS = ['swift', 'potent', 'echo', 'potent'];

    /**
     * Signature Mastery grows from every use, with no cap; each level takes a little longer than the last. A use is
     * worth the skill's cooldown in seconds, so quick and slow skills grow alike: about 10 Mastery after a week of
     * runs, 25 after two months, 70 after a year.
     */
    public static function signatureMastery(int $xp): int
    {
        return (int) floor(sqrt(max(0, $xp) / 120));
    }

    public static function signatureXpFor(int $mastery): int
    {
        return 120 * $mastery * $mastery;
    }

    /** @return array{swift: int, potent: int, echo: int} how many of each trait a Mastery level has earned */
    public static function signatureTraits(int $mastery): array
    {
        $out = ['swift' => 0, 'potent' => 0, 'echo' => 0];
        for ($k = 0; $k < intdiv($mastery, 10); ++$k) {
            ++$out[self::SIGNATURE_TRAITS[$k % count(self::SIGNATURE_TRAITS)]];
        }

        return $out;
    }

    /** XP for one run: grows with the dungeon level and how far the group got, plus small bonuses. */
    public static function battleXp(int $dungeonLevel, float $units, string $race, int $battlesTogether, float $xpBonus): int
    {
        return (int) round(10.5 * $dungeonLevel ** 1.5 * $units * ($race === 'human' ? 1.05 : 1.0) * (1 + 0.01 * min(10, $battlesTogether)) * (1 + $xpBonus));
    }

    /**
     * Catch-up for alternate heroes: double XP below half the account's best level, half again more within reach of
     * it, nothing within five levels.
     */
    public static function catchUp(int $level, int $accountBest): float
    {
        return match (true) {
            $level * 2 < $accountBest => 2.0,
            $level < $accountBest - 5 => 1.5,
            default => 1.0,
        };
    }

    /**
     * XP to the next level. Each level costs more than the last on top of the dungeon XP growing, so the climb slows
     * as it goes: a group that keeps up reaches 50 in about a month (see app:pacing), and past 50 every level costs 8%
     * more than the one before.
     */
    public static function xpForLevel(int $level): int
    {
        $curve = fn (int $l) => 160 * $l ** 1.5 * (1 + ($l - 1) / 5);
        $base = $level >= 50 ? $curve(50) * 1.08 ** ($level - 50) : $curve($level);

        return (int) round($base);
    }

    public static function role(string $class): string
    {
        return self::CLASSES[$class]['role'];
    }

    /** Every skill a class can use: [id => [name, level, type, mult, cost, cd, opts, source]]. Talent skills have source 'talent'. */
    public static function classSkills(string $class): array
    {
        $c = self::CLASSES[$class];
        $out = [];
        foreach ($c['skills'] as $id => $s) {
            $out[$id] = [...$s, 'core'];
        }
        foreach ($c['paths'] as $pathId => $p) {
            foreach ($p[2] as $id => $s) {
                $out[$id] = [...$s, $pathId];
            }
        }
        [$uid, $uname, $ulvl, $utype, $umult, $ucost, $ucd, $uopts] = $c['ultimate'];
        $out[$uid] = [$uname, $ulvl, $utype, $umult, $ucost, $ucd, $uopts, 'ultimate'];
        foreach (Talents::SKILLS[$class] ?? [] as $id => $s) {
            $out[$id] = [...$s, 'talent'];
        }

        return $out;
    }
}

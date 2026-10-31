<?php

namespace App\Game;

/**
 * Class talent maps. Every class has one root and ten branches that fan out from it. Each branch is a map of its own:
 * a spine of 30 nodes from the root outward, with six more lanes forking off it, about 166 nodes a branch and over
 * 1,600 a class. Nodes link along their lane, and on every fifth ring across lanes and into the neighbouring branch.
 * A node can be learned once a node linked to it is learned. Two talent points per level from level 2.
 *
 * What a node does comes from the branch's handwritten core (TREES): its minor nodes fill the spine, its notable and
 * capstone sit on the spine, and a capstone that teaches a skill sits halfway out. The other lanes follow one
 * attribute (every attribute does something for every class, see Rules::TWISTS) or one skill, and end in a
 * notable or a keystone with a trade-off.
 *
 * Effects are shared with the race maps (Heritage) and read by Stats::derive and the Simulator:
 *   attr  => [attribute => points]        flat attribute points
 *   stat  => [stat => fraction]           dmg, heal, hp, threat, taken, crit, critDmg, haste, cdr, dodge, block,
 *                                         regen, resRegen, rageGain, healRecv, fortune, xp, lifesteal
 *   type  => [skill type => fraction]     skills of that type hit, heal or protect harder
 *   skill => [skill id => fraction]       one skill hits, heals or protects harder
 *   cost  => fraction                     skills cost less
 *   kin   => fraction                     more damage and healing per groupmate of your race (Heritage)
 *   renown => fraction                    more Renown from every run (Heritage)
 *   grant => skill id                     teaches a skill from SKILLS
 */
final class Talents
{
    /** The shape of a class map: where each lane starts (lane 3 is the spine), how deep it goes, how often hubs come. */
    public const SHAPE = ['starts' => [13, 8, 4, 1, 4, 8, 13], 'depth' => 30, 'hub' => 5, 'value' => 0.5];

    /** Spine depth of the node that teaches the branch's skill (or holds its capstone). */
    public const SKILL_AT = 15;

    public const POINTS_PER_LEVEL = 2;

    /** Bumped when the maps change shape, so clients reload them. */
    public const VERSION = 2;

    /** Keystones at the ends of the outer lanes: big and with a cost. Every class map has all twenty. */
    public const KEYSTONES = [
        ['Glass Cannon', ['stat' => ['dmg' => 0.20, 'taken' => -0.10]]],
        ['Iron Fortress', ['stat' => ['taken' => 0.12, 'dmg' => -0.08]]],
        ['Blood Pact', ['stat' => ['lifesteal' => 0.06, 'healRecv' => -0.20]]],
        ['Overflowing', ['stat' => ['resRegen' => 0.30, 'haste' => -0.05]]],
        ['Hair Trigger', ['stat' => ['haste' => 0.12, 'critDmg' => -0.15]]],
        ["Executioner's Eye", ['stat' => ['critDmg' => 0.40, 'crit' => -0.04]]],
        ['Lucky Star', ['stat' => ['crit' => 0.08, 'critDmg' => -0.15]]],
        ['Patience', ['stat' => ['cdr' => 0.12, 'haste' => -0.06]]],
        ['Juggernaut', ['stat' => ['hp' => 0.15, 'dodge' => -0.05]]],
        ['Ghost', ['stat' => ['dodge' => 0.08, 'hp' => -0.08]]],
        ['Shieldwall', ['stat' => ['block' => 0.08, 'haste' => -0.04]]],
        ['Warlord', ['stat' => ['threat' => 0.40, 'dmg' => -0.05]]],
        ['Unseen', ['stat' => ['threat' => -0.40, 'hp' => -0.05]]],
        ['Martyr', ['stat' => ['heal' => 0.15, 'taken' => -0.06]]],
        ['Ascetic', ['cost' => 0.12, 'stat' => ['dmg' => -0.05]]],
        ['Wellspring', ['stat' => ['regen' => 0.60, 'healRecv' => -0.10]]],
        ['Berserker', ['stat' => ['rageGain' => 0.30, 'taken' => -0.05]]],
        ['Scholar', ['stat' => ['xp' => 0.20, 'dmg' => -0.03]]],
        ['Avalanche', ['type' => ['aoe' => 0.25, 'strike' => -0.10]]],
        ['Duelist', ['type' => ['strike' => 0.20, 'aoe' => -0.15]]],
    ];

    /** Skills taught by talents: same shape as Rules::CLASSES skills. */
    public const SKILLS = [
        'guardian' => [
            'shieldBash' => ['Shield Bash', 1, 'strike', 1.8, 15, 8, ['threat' => 6]],
            'challengingShout' => ['Challenging Shout', 1, 'aoe', 0.9, 15, 10, ['threat' => 8]],
            'avengersStrike' => ["Avenger's Strike", 1, 'strike', 2.6, 25, 10, ['threat' => 5]],
            'shieldOfAges' => ['Shield of Ages', 1, 'wall', 0.35, 25, 40, ['dur' => 6, 'party' => true]],
            'warBanner' => ['War Banner', 1, 'shield', 0.08, 20, 25, ['party' => true, 'ofHp' => true]],
            'whirlwind' => ['Whirlwind', 1, 'aoe', 1.3, 20, 9, ['threat' => 5]],
        ],
        'warden' => [
            'heartwoodBloom' => ['Heartwood Bloom', 1, 'hot', 0.15, 15, 18, ['self' => true, 'dur' => 10, 'ofHp' => true]],
            'thornburst' => ['Thornburst', 1, 'aoe', 1.2, 18, 10, ['threat' => 6]],
            'earthshaker' => ['Earthshaker', 1, 'aoe', 0.9, 15, 12, ['threat' => 8]],
            'oakSmash' => ['Oak Smash', 1, 'strike', 2.4, 20, 8, ['threat' => 6]],
            'sanctuaryGrove' => ['Sheltering Grove', 1, 'shield', 0.07, 20, 25, ['party' => true, 'ofHp' => true]],
        ],
        'cleric' => [
            'flashHeal' => ['Flash Heal', 1, 'heal', 2.0, 16, 1, []],
            'circleOfHealing' => ['Circle of Healing', 1, 'groupheal', 1.3, 35, 12, []],
            'barrierOfFaith' => ['Barrier of Faith', 1, 'shield', 1.0, 45, 22, ['party' => true]],
            'penance' => ['Penance', 1, 'strike', 1.4, 12, 6, ['school' => 'arcana']],
            'prayerOfMending' => ['Prayer of Mending', 1, 'hot', 1.6, 40, 14, ['dur' => 8, 'party' => true]],
            'guardianSpirit' => ['Guardian Spirit', 1, 'shield', 3.0, 40, 30, ['tank' => true]],
        ],
        'druid' => [
            'regrowthBloom' => ['Regrowth', 1, 'hot', 3.0, 22, 4, ['dur' => 9]],
            'efflorescence' => ['Efflorescence', 1, 'groupheal', 1.2, 35, 12, []],
            'naturesTouch' => ["Nature's Touch", 1, 'heal', 2.8, 22, 5, []],
            'starfire' => ['Starfire', 1, 'strike', 1.5, 14, 6, ['school' => 'arcana']],
            'ironbark' => ['Ironbark', 1, 'shield', 2.6, 30, 18, ['tank' => true]],
            'spiritBear' => ['Spirit Bear', 1, 'pet', 0.8, 40, 24, ['dur' => 12, 'school' => 'arcana']],
        ],
        'ranger' => [
            'chimeraShot' => ['Chimera Shot', 1, 'strike', 2.4, 30, 9, []],
            'explosiveTrap' => ['Explosive Trap', 1, 'aoe', 1.4, 30, 12, ['fire' => true]],
            'stampede' => ['Stampede', 1, 'pet', 1.1, 40, 30, ['dur' => 10]],
            'blackArrow' => ['Black Arrow', 1, 'dot', 3.2, 25, 12, ['dur' => 10]],
            'feignDeath' => ['Feign Death', 1, 'vanish', 0.2, 10, 25, []],
            'killShot' => ['Kill Shot', 1, 'strike', 3.4, 40, 15, []],
        ],
        'mage' => [
            'pyroblast' => ['Pyroblast', 1, 'strike', 3.0, 35, 12, ['fire' => true]],
            'frozenOrb' => ['Frozen Orb', 1, 'aoe', 1.2, 32, 12, []],
            'arcaneMissiles' => ['Arcane Missiles', 1, 'strike', 1.8, 20, 4, []],
            'chainLightning' => ['Chain Lightning', 1, 'aoe', 1.0, 26, 7, []],
            'conflagrate' => ['Conflagrate', 1, 'dot', 3.4, 26, 12, ['dur' => 8]],
            'temporalSurge' => ['Temporal Surge', 1, 'buff', 0.30, 20, 30, ['dur' => 10]],
        ],
        'rogue' => [
            'mutilate' => ['Mutilate', 1, 'strike', 2.2, 30, 6, []],
            'envenom' => ['Envenom', 1, 'dot', 3.0, 25, 12, ['dur' => 8]],
            'bladeFlurry' => ['Blade Flurry', 1, 'aoe', 1.1, 28, 9, []],
            'shadowstrike' => ['Shadowstrike', 1, 'strike', 2.6, 35, 10, []],
            'adrenalineRush' => ['Adrenaline Rush', 1, 'buff', 0.35, 20, 30, ['dur' => 8]],
        ],
    ];

    /**
     * class => [root [name, effect], branches [id => [name, theme, colour, [[name, ranks, effect] x 4]]]].
     * The first branches listed are the ones demo heroes and the reference group fill first.
     */
    public const TREES = [
        'guardian' => [
            'root' => ['Shieldbearer', ['attr' => ['guard' => 3, 'vitality' => 3]]],
            'branches' => [
                'bulwark' => ['Bulwark', 'Block and armor', '#6fb7ff', [
                    ['Thick Plating', 3, ['attr' => ['guard' => 3]]], ['Braced Stance', 3, ['stat' => ['block' => 0.01]]],
                    ['Unbroken', 1, ['stat' => ['taken' => 0.04]]], ['Shield Bash', 1, ['grant' => 'shieldBash']]]],
                'provocation' => ['Provocation', 'Hold every enemy', '#ffd25a', [
                    ['Loud Voice', 3, ['stat' => ['threat' => 0.06]]], ['Glare', 3, ['skill' => ['shieldSlam' => 0.06]]],
                    ['Center of Attention', 1, ['stat' => ['threat' => 0.15]]], ['Challenging Shout', 1, ['grant' => 'challengingShout']]]],
                'fortitude' => ['Fortitude', 'A deeper health pool', '#7be07f', [
                    ['Big Frame', 3, ['attr' => ['vitality' => 3]]], ['Iron Hide', 3, ['stat' => ['hp' => 0.02]]],
                    ['Stubborn', 1, ['stat' => ['healRecv' => 0.08]]], ['Undying Resolve', 1, ['stat' => ['taken' => 0.06, 'hp' => 0.05]]]]],
                'aegis' => ['Aegis', 'Stronger walls', '#b8d8ff', [
                    ['Reinforced', 3, ['type' => ['wall' => 0.05]]], ['Sturdy Shield', 3, ['skill' => ['shieldWall' => 0.06]]],
                    ['Hold the Line', 1, ['stat' => ['cdr' => 0.04]]], ['Shield of Ages', 1, ['grant' => 'shieldOfAges']]]],
                'vengeance' => ['Vengeance', 'Hit back hard', '#ff8a6b', [
                    ['Heavy Arm', 3, ['attr' => ['might' => 3]]], ['Punishing Blows', 3, ['type' => ['strike' => 0.05]]],
                    ['Retribution', 1, ['stat' => ['dmg' => 0.08]]], ["Avenger's Strike", 1, ['grant' => 'avengersStrike']]]],
                'warcry' => ['Warcry', 'Rage and fury', '#ff5a3a', [
                    ['Fuming', 3, ['attr' => ['fury' => 3]]], ['Hot Blood', 3, ['stat' => ['rageGain' => 0.05]]],
                    ['Battle Trance', 1, ['cost' => 0.10]], ['Rampage', 1, ['type' => ['aoe' => 0.20]]]]],
                'resolve' => ['Resolve', 'Shrug off curses', '#c9a8ff', [
                    ['Iron Will', 3, ['attr' => ['resolve' => 3]]], ['Second Breath', 3, ['stat' => ['regen' => 0.05]]],
                    ['Steadfast', 1, ['stat' => ['taken' => 0.03]]], ['Bedrock', 1, ['stat' => ['hp' => 0.06, 'regen' => 0.15]]]]],
                'swordplay' => ['Swordplay', 'Crits and parries', '#e6ecf2', [
                    ['Keen Edge', 3, ['attr' => ['precision' => 3]]], ['Deep Cuts', 3, ['stat' => ['critDmg' => 0.04]]],
                    ['Riposte', 1, ['stat' => ['dodge' => 0.03]]], ['Blade Storm', 1, ['stat' => ['crit' => 0.05, 'dmg' => 0.05]]]]],
                'banner' => ['Banner', 'Protect the group', '#f0c23a', [
                    ['Standard Bearer', 3, ['attr' => ['command' => 3]]], ['Rally', 3, ['skill' => ['rallyingCry' => 0.06]]],
                    ['Inspiring Presence', 1, ['type' => ['shield' => 0.15]]], ['War Banner', 1, ['grant' => 'warBanner']]]],
                'sweep' => ['Wide Swings', 'Many enemies at once', '#ff9a3a', [
                    ['Broad Shoulders', 3, ['attr' => ['might' => 2, 'vitality' => 1]]], ['Long Reach', 3, ['skill' => ['cleave' => 0.06]]],
                    ['Sweeping Strikes', 1, ['type' => ['aoe' => 0.10]]], ['Whirlwind', 1, ['grant' => 'whirlwind']]]],
            ],
        ],
        'warden' => [
            'root' => ['Rooted', ['attr' => ['vitality' => 3, 'recovery' => 3]]],
            'branches' => [
                'heartwood' => ['Heartwood', 'Heal yourself', '#7be07f', [
                    ['Living Sap', 3, ['attr' => ['vitality' => 3]]], ['Dense Rings', 3, ['stat' => ['hp' => 0.02]]],
                    ['Living Wood', 1, ['stat' => ['regen' => 0.20]]], ['Heartwood Bloom', 1, ['grant' => 'heartwoodBloom']]]],
                'wildroar' => ['Wild Roar', 'Hold every enemy', '#ffd25a', [
                    ['Bellow', 3, ['stat' => ['threat' => 0.06]]], ['Looming', 3, ['attr' => ['presence' => 2]]],
                    ['Alpha', 1, ['stat' => ['threat' => 0.15]]], ['Earthshaker', 1, ['grant' => 'earthshaker']]]],
                'bark' => ['Barkskin', 'Stronger shields and walls', '#b8d8ff', [
                    ['Hardened Bark', 3, ['skill' => ['barkskin' => 0.08]]], ['Knotted', 3, ['type' => ['shield' => 0.04]]],
                    ['Petrified Bark', 1, ['type' => ['wall' => 0.10]]], ['Ancient Roots', 1, ['stat' => ['taken' => 0.06, 'hp' => 0.04]]]]],
                'thorns' => ['Thorns', 'Punish crowds', '#6fbf4a', [
                    ['Sharp Thorns', 3, ['type' => ['aoe' => 0.04]]], ['Deep Roots', 3, ['skill' => ['rootbreak' => 0.06]]],
                    ['Barbed Hide', 1, ['stat' => ['taken' => 0.04]]], ['Thornburst', 1, ['grant' => 'thornburst']]]],
                'moss' => ['Moss and Rain', 'Heals land harder on you', '#3fa0c8', [
                    ['Soft Moss', 3, ['attr' => ['recovery' => 3]]], ['Drinking Roots', 3, ['stat' => ['healRecv' => 0.03]]],
                    ['Rain Drinker', 1, ['stat' => ['regen' => 0.25]]], ['Verdant', 1, ['stat' => ['healRecv' => 0.10, 'hp' => 0.05]]]]],
                'maul' => ['Maul', 'Heavy blows', '#ff8a6b', [
                    ['Gnarled Fist', 3, ['attr' => ['might' => 3]]], ['Crushing', 3, ['type' => ['strike' => 0.05]]],
                    ['Splinter', 1, ['stat' => ['critDmg' => 0.10]]], ['Oak Smash', 1, ['grant' => 'oakSmash']]]],
                'sap' => ['Rising Sap', 'Rage and fury', '#ff5a3a', [
                    ['Sap Fury', 3, ['attr' => ['fury' => 3]]], ['Seething', 3, ['stat' => ['rageGain' => 0.05]]],
                    ['Sap Flow', 1, ['cost' => 0.10]], ['Overgrowth', 1, ['stat' => ['dmg' => 0.08, 'rageGain' => 0.10]]]]],
                'stone' => ['Stoneskin', 'Armor and block', '#a89c8e', [
                    ['Pebble Skin', 3, ['attr' => ['guard' => 3]]], ['Shale', 3, ['stat' => ['block' => 0.01]]],
                    ['Granite', 1, ['stat' => ['taken' => 0.03]]], ['Mountain', 1, ['stat' => ['hp' => 0.08]]]]],
                'grove' => ['Grove Ward', 'Protect the group', '#f0c23a', [
                    ['Canopy', 3, ['attr' => ['command' => 3]]], ['Ironwood Ring', 3, ['skill' => ['ironwood' => 0.06]]],
                    ['Shelter', 1, ['type' => ['wall' => 0.08]]], ['Sheltering Grove', 1, ['grant' => 'sanctuaryGrove']]]],
                'hunt' => ["Hunter's Bark", 'Speed and cooldowns', '#c9a8ff', [
                    ['Quick Sap', 3, ['attr' => ['swiftness' => 3]]], ['Spring Step', 3, ['stat' => ['haste' => 0.015]]],
                    ['Quickroot', 1, ['stat' => ['cdr' => 0.04]]], ['Wild Pace', 1, ['stat' => ['haste' => 0.05, 'dmg' => 0.04]]]]],
            ],
        ],
        'cleric' => [
            'root' => ['Devotion', ['attr' => ['spirit' => 3, 'wisdom' => 3]]],
            'branches' => [
                'light' => ['Holy Light', 'Big direct heals', '#ffe27a', [
                    ['Warm Hands', 3, ['type' => ['heal' => 0.04]]], ['Mending Grace', 3, ['skill' => ['mendingLight' => 0.06]]],
                    ['Bright Hands', 1, ['stat' => ['heal' => 0.06]]], ['Flash Heal', 1, ['grant' => 'flashHeal']]]],
                'wards' => ['Wards', 'Shields before damage lands', '#b8d8ff', [
                    ['Warding Words', 3, ['type' => ['shield' => 0.05]]], ['Holy Bulwark', 3, ['skill' => ['holyWard' => 0.06]]],
                    ['Blessed Barrier', 1, ['type' => ['shield' => 0.10]]], ['Barrier of Faith', 1, ['grant' => 'barrierOfFaith']]]],
                'grace' => ['Grace', 'Mana to spare', '#4aa3ff', [
                    ['Calm Mind', 3, ['attr' => ['wisdom' => 3]]], ['Still Waters', 3, ['stat' => ['resRegen' => 0.04]]],
                    ['Clarity', 1, ['cost' => 0.08]], ['Wellspring', 1, ['stat' => ['resRegen' => 0.15]]]]],
                'sanctum' => ['Sanctum', 'Heal the whole group', '#9ff0a0', [
                    ['Gathered Light', 3, ['type' => ['groupheal' => 0.04]]], ['Sacred Ground', 3, ['skill' => ['sanctuary' => 0.06]]],
                    ['Choir', 1, ['stat' => ['heal' => 0.05]]], ['Circle of Healing', 1, ['grant' => 'circleOfHealing']]]],
                'renewal' => ['Renewal', 'Healing over time', '#7ad0a0', [
                    ['Patient Prayer', 3, ['skill' => ['renew' => 0.06]]], ['Steady Glow', 3, ['type' => ['hot' => 0.04]]],
                    ['Lingering Light', 1, ['type' => ['hot' => 0.10]]], ['Prayer of Mending', 1, ['grant' => 'prayerOfMending']]]],
                'hymn' => ['Hymnal', 'Save the tank', '#f0c23a', [
                    ['Psalms', 3, ['attr' => ['command' => 3]]], ['Crescendo', 3, ['skill' => ['divineHymn' => 0.06]]],
                    ['Chorale', 1, ['stat' => ['heal' => 0.05]]], ['Guardian Spirit', 1, ['grant' => 'guardianSpirit']]]],
                'mercy' => ['Mercy', 'Critical heals', '#ffb340', [
                    ['Gentle Touch', 3, ['attr' => ['spirit' => 3]]], ['Blessed Chance', 3, ['stat' => ['crit' => 0.01]]],
                    ['Merciful Crits', 1, ['stat' => ['critDmg' => 0.10]]], ['Miracle', 1, ['stat' => ['crit' => 0.04, 'heal' => 0.05]]]]],
                'litany' => ['Swift Prayer', 'Speed and cooldowns', '#c9a8ff', [
                    ['Quick Tongue', 3, ['attr' => ['swiftness' => 3]]], ['Hurried Rites', 3, ['stat' => ['haste' => 0.015]]],
                    ['Quick Litany', 1, ['stat' => ['cdr' => 0.04]]], ['Rapture', 1, ['stat' => ['haste' => 0.05, 'cdr' => 0.04]]]]],
                'zeal' => ['Zeal', 'Smite between heals', '#ff8a6b', [
                    ['Righteous', 3, ['attr' => ['arcana' => 3]]], ['Judgement', 3, ['skill' => ['smite' => 0.08]]],
                    ['Holy Fire', 1, ['stat' => ['dmg' => 0.10]]], ['Penance', 1, ['grant' => 'penance']]]],
                'faith' => ['Faith', 'Stay standing', '#7be07f', [
                    ['Sturdy Faith', 3, ['attr' => ['vitality' => 3]]], ['Blessed Body', 3, ['stat' => ['hp' => 0.02]]],
                    ['Martyr', 1, ['stat' => ['taken' => 0.04]]], ['Unshaken', 1, ['stat' => ['hp' => 0.06, 'taken' => 0.03]]]]],
            ],
        ],
        'druid' => [
            'root' => ['Wild Heart', ['attr' => ['spirit' => 3, 'swiftness' => 3]]],
            'branches' => [
                'bloom' => ['Bloom', 'Healing over time', '#7ad0a0', [
                    ['Fresh Buds', 3, ['skill' => ['rejuvenate' => 0.06]]], ['Petals', 3, ['type' => ['hot' => 0.04]]],
                    ['Evergreen', 1, ['type' => ['hot' => 0.10]]], ['Regrowth', 1, ['grant' => 'regrowthBloom']]]],
                'wild' => ['Wild Growth', 'Heal the whole group', '#9ff0a0', [
                    ['Spreading Vines', 3, ['skill' => ['wildGrowth' => 0.06]]], ['Meadow', 3, ['type' => ['groupheal' => 0.04]]],
                    ['Overgrowth', 1, ['stat' => ['heal' => 0.05]]], ['Efflorescence', 1, ['grant' => 'efflorescence']]]],
                'tide' => ['Tidewater', 'Mana to spare', '#4aa3ff', [
                    ['Tidal Mind', 3, ['attr' => ['wisdom' => 3]]], ['Rainfall', 3, ['stat' => ['resRegen' => 0.04]]],
                    ['Innervate', 1, ['cost' => 0.08]], ['Deep Springs', 1, ['stat' => ['resRegen' => 0.15]]]]],
                'swift' => ['Swiftmend', 'Fast direct heals', '#7be07f', [
                    ['Quick Mend', 3, ['skill' => ['swiftmend' => 0.08]]], ['Green Touch', 3, ['type' => ['heal' => 0.04]]],
                    ["Nature's Swiftness", 1, ['stat' => ['cdr' => 0.04]]], ["Nature's Touch", 1, ['grant' => 'naturesTouch']]]],
                'barkward' => ['Barkward', 'Shield the tank', '#b8d8ff', [
                    ['Thick Bark', 3, ['skill' => ['barkward' => 0.06]]], ['Living Armor', 3, ['type' => ['shield' => 0.05]]],
                    ['Thornbark', 1, ['type' => ['shield' => 0.10]]], ['Ironbark', 1, ['grant' => 'ironbark']]]],
                'seasons' => ['Seasons', 'Long fights', '#ffb340', [
                    ['Summer Sun', 3, ['stat' => ['heal' => 0.02]]], ['Patience', 3, ['attr' => ['focus' => 2]]],
                    ['Long Summer', 1, ['stat' => ['heal' => 0.05]]], ['Solstice', 1, ['stat' => ['heal' => 0.06, 'haste' => 0.03]]]]],
                'pack' => ['Spirit Pack', 'Spirits that bite', '#c8a070', [
                    ['Pack Leader', 3, ['attr' => ['command' => 3]]], ['Wild Chance', 3, ['stat' => ['crit' => 0.01]]],
                    ['Pack Bond', 1, ['stat' => ['critDmg' => 0.10]]], ['Spirit Bear', 1, ['grant' => 'spiritBear']]]],
                'moon' => ['Moonkin', 'Moonfire between heals', '#c084ff', [
                    ['Moonlit', 3, ['attr' => ['arcana' => 3]]], ['Lunar Fire', 3, ['skill' => ['moonfire' => 0.08]]],
                    ['Starsurge', 1, ['stat' => ['dmg' => 0.10]]], ['Starfire', 1, ['grant' => 'starfire']]]],
                'wind' => ['Windwalker', 'Speed and dodges', '#c9a8ff', [
                    ['Tailwind', 3, ['attr' => ['swiftness' => 3]]], ['Breeze', 3, ['stat' => ['haste' => 0.015]]],
                    ['Zephyr', 1, ['stat' => ['dodge' => 0.03]]], ['Gale', 1, ['stat' => ['haste' => 0.05, 'cdr' => 0.03]]]]],
                'hide' => ['Thick Hide', 'Stay standing', '#a89c8e', [
                    ['Furred', 3, ['attr' => ['vitality' => 3]]], ['Heavy Pelt', 3, ['stat' => ['hp' => 0.02]]],
                    ['Bear Hide', 1, ['stat' => ['taken' => 0.04]]], ['Elder Hide', 1, ['stat' => ['hp' => 0.06, 'taken' => 0.03]]]]],
            ],
        ],
        'ranger' => [
            'root' => ['Hunter', ['attr' => ['might' => 3, 'precision' => 3]]],
            'branches' => [
                'marks' => ['Marksmanship', 'One target, hard', '#ff8a6b', [
                    ['Steady Hands', 3, ['skill' => ['aimedShot' => 0.06]]], ['Broadheads', 3, ['type' => ['strike' => 0.04]]],
                    ['Deadeye', 1, ['stat' => ['critDmg' => 0.10]]], ['Chimera Shot', 1, ['grant' => 'chimeraShot']]]],
                'hunt' => ['The Hunt', 'Marked prey', '#ff6a8a', [
                    ['Tracker', 3, ['skill' => ['markedPrey' => 0.06]]], ['Prey Sense', 3, ['type' => ['mark' => 0.05]]],
                    ["Hunter's Mark", 1, ['stat' => ['dmg' => 0.06]]], ['Apex Predator', 1, ['stat' => ['dmg' => 0.08, 'crit' => 0.02]]]]],
                'eye' => ['Eagle Eye', 'Crits', '#ffd25a', [
                    ['Sharp Sight', 3, ['attr' => ['precision' => 3]]], ['Vital Spots', 3, ['stat' => ['crit' => 0.01]]],
                    ['Bullseye', 1, ['stat' => ['crit' => 0.03]]], ['Kill Shot', 1, ['grant' => 'killShot']]]],
                'volley' => ['Volleys', 'Many enemies at once', '#ff9a3a', [
                    ['Quiver', 3, ['skill' => ['volley' => 0.06]]], ['Spread Shot', 3, ['type' => ['aoe' => 0.04]]],
                    ['Barrage', 1, ['type' => ['aoe' => 0.10]]], ['Explosive Trap', 1, ['grant' => 'explosiveTrap']]]],
                'venom' => ['Venom', 'Poisons', '#6fbf4a', [
                    ['Viper Fang', 3, ['skill' => ['serpentSting' => 0.06]]], ['Lingering Venom', 3, ['type' => ['dot' => 0.05]]],
                    ['Toxic', 1, ['type' => ['dot' => 0.12]]], ['Black Arrow', 1, ['grant' => 'blackArrow']]]],
                'beast' => ['Beast Bond', 'Companions', '#c8a070', [
                    ['Treats', 3, ['type' => ['pet' => 0.06]]], ['Pack Call', 3, ['attr' => ['command' => 2]]],
                    ['Kindred Spirits', 1, ['type' => ['pet' => 0.12]]], ['Stampede', 1, ['grant' => 'stampede']]]],
                'wind' => ['Windrunner', 'Speed and cooldowns', '#c9a8ff', [
                    ['Light Step', 3, ['attr' => ['swiftness' => 3]]], ['Nock Fast', 3, ['stat' => ['haste' => 0.015]]],
                    ['Quick Draw', 1, ['stat' => ['cdr' => 0.04]]], ['Rapid Fire', 1, ['stat' => ['haste' => 0.06]]]]],
                'stamina' => ['Endurance', 'Energy to spare', '#ffe27a', [
                    ['Long Legs', 3, ['attr' => ['stamina' => 3]]], ['Even Breath', 3, ['stat' => ['resRegen' => 0.04]]],
                    ['Second Breath', 1, ['cost' => 0.08]], ['Tireless', 1, ['stat' => ['resRegen' => 0.12, 'dmg' => 0.03]]]]],
                'trap' => ['Trapper', 'Slow them down', '#7fd4ff', [
                    ['Snares', 3, ['skill' => ['snareTrap' => 0.08]]], ['Pitfalls', 3, ['type' => ['slow' => 0.06]]],
                    ['Frost Trap', 1, ['stat' => ['taken' => 0.03]]], ['Tar Pits', 1, ['type' => ['slow' => 0.15], 'stat' => ['dmg' => 0.04]]]]],
                'survival' => ['Survival', 'Stay alive, stay quiet', '#a090c0', [
                    ['Nimble', 3, ['attr' => ['agility' => 3]]], ['Evasion', 3, ['stat' => ['dodge' => 0.01]]],
                    ['Camouflage', 1, ['stat' => ['threat' => -0.15]]], ['Feign Death', 1, ['grant' => 'feignDeath']]]],
            ],
        ],
        'mage' => [
            'root' => ['Arcane Mind', ['attr' => ['arcana' => 3, 'wisdom' => 3]]],
            'branches' => [
                'fire' => ['Fire', 'Big burning hits', '#ff7a2a', [
                    ['Kindling', 3, ['skill' => ['fireball' => 0.06]]], ['Hot Streak', 3, ['attr' => ['ferocity' => 2]]],
                    ['Combustion', 1, ['stat' => ['critDmg' => 0.10]]], ['Pyroblast', 1, ['grant' => 'pyroblast']]]],
                'arcane' => ['Arcane', 'Steady spell damage', '#c084ff', [
                    ['Barrage', 3, ['skill' => ['arcaneBarrage' => 0.06]]], ['Spellweave', 3, ['type' => ['strike' => 0.04]]],
                    ['Arcane Power', 1, ['stat' => ['dmg' => 0.06]]], ['Arcane Missiles', 1, ['grant' => 'arcaneMissiles']]]],
                'storm' => ['Storm', 'Many enemies at once', '#7fb8ff', [
                    ['Gathering Storm', 3, ['skill' => ['blizzard' => 0.06]]], ['Static', 3, ['type' => ['aoe' => 0.04]]],
                    ['Eye of the Storm', 1, ['type' => ['aoe' => 0.10]]], ['Chain Lightning', 1, ['grant' => 'chainLightning']]]],
                'mana' => ['Mana Flow', 'Mana to spare', '#4aa3ff', [
                    ['Deep Pool', 3, ['attr' => ['wisdom' => 3]]], ['Flowing Mana', 3, ['stat' => ['resRegen' => 0.04]]],
                    ['Clearcasting', 1, ['cost' => 0.08]], ['Evocation', 1, ['stat' => ['resRegen' => 0.15]]]]],
                'frost' => ['Frost', 'Freeze and shatter', '#7fd4ff', [
                    ['Ice Shards', 3, ['skill' => ['iceLance' => 0.06]]], ['Bitter Cold', 3, ['skill' => ['frostNova' => 0.06]]],
                    ['Shatter', 1, ['type' => ['slow' => 0.12]]], ['Frozen Orb', 1, ['grant' => 'frozenOrb']]]],
                'ember' => ['Embers', 'Burns over time', '#ff8a3d', [
                    ['Smoulder', 3, ['skill' => ['livingBomb' => 0.06]]], ['Ash', 3, ['type' => ['dot' => 0.05]]],
                    ['Wildfire', 1, ['type' => ['dot' => 0.12]]], ['Conflagrate', 1, ['grant' => 'conflagrate']]]],
                'insight' => ['Insight', 'Crits', '#ffd25a', [
                    ['Sharp Mind', 3, ['attr' => ['precision' => 3]]], ['Lucid', 3, ['stat' => ['crit' => 0.01]]],
                    ['Focus Magic', 1, ['stat' => ['crit' => 0.03]]], ['Mind over Matter', 1, ['stat' => ['critDmg' => 0.15, 'crit' => 0.02]]]]],
                'time' => ['Time', 'Speed and cooldowns', '#c9a8ff', [
                    ['Clockwork', 3, ['attr' => ['focus' => 3]]], ['Borrowed Time', 3, ['stat' => ['cdr' => 0.01]]],
                    ['Time Warp', 1, ['stat' => ['haste' => 0.04]]], ['Temporal Surge', 1, ['grant' => 'temporalSurge']]]],
                'power' => ['Overpower', 'Raw spell power', '#ff6a8a', [
                    ['Raw Talent', 3, ['attr' => ['arcana' => 2]]], ['Overload', 3, ['stat' => ['dmg' => 0.02]]],
                    ['Glass Cannon', 1, ['stat' => ['dmg' => 0.08, 'taken' => -0.05]]], ['Archmage', 1, ['stat' => ['dmg' => 0.10]]]]],
                'wards' => ['Wards', 'Stay alive, stay quiet', '#b8d8ff', [
                    ['Mage Armor', 3, ['attr' => ['vitality' => 3]]], ['Mana Shield', 3, ['stat' => ['hp' => 0.02]]],
                    ['Ice Barrier', 1, ['stat' => ['taken' => 0.04]]], ['Blink', 1, ['stat' => ['dodge' => 0.04, 'threat' => -0.15]]]]],
            ],
        ],
        'rogue' => [
            'root' => ['Shadowstep', ['attr' => ['might' => 3, 'agility' => 3]]],
            'branches' => [
                'assassin' => ['Assassination', 'One target, hard', '#ff8a6b', [
                    ['Twin Fangs', 3, ['skill' => ['twinStrike' => 0.06]]], ['Precise Cuts', 3, ['type' => ['strike' => 0.04]]],
                    ['Cold Blood', 1, ['stat' => ['critDmg' => 0.10]]], ['Mutilate', 1, ['grant' => 'mutilate']]]],
                'poison' => ['Poisons', 'Damage over time', '#6fbf4a', [
                    ['Coated Blades', 3, ['skill' => ['poisonedBlade' => 0.06]]], ['Virulence', 3, ['type' => ['dot' => 0.05]]],
                    ['Deadly Poison', 1, ['type' => ['dot' => 0.12]]], ['Envenom', 1, ['grant' => 'envenom']]]],
                'tempo' => ['Adrenaline', 'Speed', '#ffd25a', [
                    ['Quick Feet', 3, ['attr' => ['swiftness' => 3]]], ['Lightning Reflexes', 3, ['stat' => ['haste' => 0.015]]],
                    ['Adrenaline Rush', 1, ['grant' => 'adrenalineRush']], ['Killing Spree', 1, ['stat' => ['haste' => 0.06]]]]],
                'subtle' => ['Subtlety', 'Strike from the shadows', '#8a6fb0', [
                    ['Backstabber', 3, ['skill' => ['backstab' => 0.06]]], ['Opportunist', 3, ['stat' => ['crit' => 0.01]]],
                    ['Hemorrhage', 1, ['stat' => ['dmg' => 0.06]]], ['Shadowstrike', 1, ['grant' => 'shadowstrike']]]],
                'blades' => ['Blade Flurry', 'Many enemies at once', '#ff9a3a', [
                    ['Knife Belt', 3, ['skill' => ['fanOfKnives' => 0.06]]], ['Whirling Steel', 3, ['type' => ['aoe' => 0.04]]],
                    ['Flurry', 1, ['type' => ['aoe' => 0.10]]], ['Blade Flurry', 1, ['grant' => 'bladeFlurry']]]],
                'expose' => ['Expose', 'Weaken the target', '#ff6a8a', [
                    ['Find the Gap', 3, ['skill' => ['exposeArmor' => 0.06]]], ['Weak Spots', 3, ['type' => ['mark' => 0.05]]],
                    ['Sunder', 1, ['type' => ['mark' => 0.12]]], ['Crippling', 1, ['stat' => ['dmg' => 0.06, 'crit' => 0.02]]]]],
                'vigor' => ['Vigor', 'Energy to spare', '#ffe27a', [
                    ['Deep Breath', 3, ['attr' => ['stamina' => 3]]], ['Second Wind', 3, ['stat' => ['resRegen' => 0.04]]],
                    ['Relentless', 1, ['cost' => 0.08]], ['Endless Vigor', 1, ['stat' => ['resRegen' => 0.12, 'dmg' => 0.03]]]]],
                'duel' => ['Dueling', 'Crit damage', '#e6ecf2', [
                    ['Fencer', 3, ['attr' => ['precision' => 3]]], ['Cruel Edge', 3, ['stat' => ['critDmg' => 0.03]]],
                    ['Riposte', 1, ['stat' => ['dodge' => 0.03]]], ['Eviscerating', 1, ['skill' => ['eviscerate' => 0.20], 'stat' => ['critDmg' => 0.10]]]]],
                'shadow' => ['Shadows', 'Stay alive, stay quiet', '#a090c0', [
                    ['Light Feet', 3, ['attr' => ['agility' => 3]]], ['Unseen', 3, ['stat' => ['threat' => -0.05]]],
                    ['Shadow Cloak', 1, ['stat' => ['dodge' => 0.03]]], ['Cloak of Shadows', 1, ['stat' => ['taken' => 0.06, 'dodge' => 0.03]]]]],
                'luck' => ["Fortune's Favor", 'Gold and materials', '#f0c23a', [
                    ['Light Fingers', 3, ['attr' => ['fortune' => 3]]], ['Coin Sense', 3, ['stat' => ['fortune' => 0.04]]],
                    ['Pickpocket', 1, ['stat' => ['fortune' => 0.10]]], ['Lucky Strikes', 1, ['stat' => ['crit' => 0.04, 'fortune' => 0.10]]]]],
            ],
        ],
    ];

    private static array $built = [];

    public static function points(int $level): int
    {
        return self::POINTS_PER_LEVEL * max(0, $level - 1);
    }

    /** One effect of a handwritten node, sized for one node of the big map. Ranked nodes were per rank already. */
    public static function perNode(array $src, float $f = 1.0): array
    {
        [, $ranks, $effect] = $src;

        return TreeMap::scale($effect, ($ranks > 1 ? 0.7 : 0.3) * $f);
    }

    /** Skills a lane can follow: the class's own skills (not the ultimate, not talent skills). */
    private static function laneSkills(string $cls): array
    {
        return array_keys(array_filter(Rules::classSkills($cls), fn ($s) => !in_array($s[7], ['talent', 'ultimate'], true)));
    }

    /**
     * A class map as the client and the rules read it:
     * [root, branches => [[id, name, theme, colour, culture, nodeIds]], nodes => [id => node], size].
     */
    public static function tree(string $cls): array
    {
        if (isset(self::$built['t:'.$cls])) {
            return self::$built['t:'.$cls];
        }
        $t = self::TREES[$cls];
        $attrs = array_keys(Rules::ATTRIBUTES);
        $ci = array_search($cls, array_keys(Rules::CLASSES), true);
        $skills = self::laneSkills($cls);
        $suggest = array_keys(Rules::CLASSES[$cls]['suggest']);
        $specs = [];
        $k = 0;
        foreach ($t['branches'] as $bid => [$name, $theme, $colour, [$n1, $n2, $n3, $n4]]) {
            $a = self::perNode($n1);
            $b = self::perNode($n2);
            $notable = $n3[2];
            $x = array_key_first($n1[2]['attr'] ?? []) ?? $suggest[$k % count($suggest)];
            $spine = [
                'a' => $a, 'b' => $b,
                'hubs' => [
                    5 => [$n3[0], $notable, 'notable'],
                    10 => [null, TreeMap::merge(TreeMap::scale($a, 3), TreeMap::scale($b, 3)), 'notable'],
                    self::SKILL_AT => [$n4[0], $n4[2], 'capstone'],
                    20 => [null, TreeMap::merge($notable, TreeMap::scale($a, 2)), 'notable'],
                    25 => [null, TreeMap::merge(TreeMap::scale($b, 4), TreeMap::scale($a, 2)), 'notable'],
                ],
                'end' => [$name.' Mastery', TreeMap::merge(TreeMap::scale($notable, 1.5), TreeMap::scale($b, 3))],
            ];
            $lanes = [];
            // Lanes 2 and 4: the branch's attribute and its second minor, grown big.
            $lanes[2] = [
                'minor' => ['attr' => [$x => 2]],
                'notable' => TreeMap::merge(['attr' => [$x => 6]], TreeMap::scale($b, 1.5)),
                'end' => [null, TreeMap::merge(['attr' => [$x => 10]], TreeMap::scale($notable, 0.75)), 'notable'],
            ];
            $lanes[4] = [
                'minor' => $b,
                'notable' => TreeMap::merge(TreeMap::scale($b, 4), ['attr' => [$x => 2]]),
                'end' => [null, TreeMap::merge(TreeMap::scale($b, 6), TreeMap::scale($a, 2)), 'notable'],
            ];
            // Lanes 1 and 5: one of the class's skills each.
            foreach ([1 => 0, 5 => 1] as $j => $o) {
                $sk = $skills[($k * 2 + $o) % count($skills)];
                $lanes[$j] = [
                    'minor' => ['skill' => [$sk => 0.03]],
                    'notable' => ['skill' => [$sk => 0.10], 'attr' => [$suggest[0] => 3]],
                    'end' => [null, ['skill' => [$sk => 0.25], 'cost' => 0.03], 'notable'],
                ];
            }
            // Lanes 0 and 6: any attribute, so every attribute has a home in every class map, and a keystone.
            foreach ([0 => 0, 6 => 1] as $j => $o) {
                $y = $attrs[($ci * 3 + $k * 2 + $o) % count($attrs)];
                $tw = Rules::TWISTS[$cls][$y] ?? [];
                $lanes[$j] = [
                    'minor' => ['attr' => [$y => 2]],
                    'notable' => TreeMap::merge(['attr' => [$y => 5]], isset($tw['as']) ? ['attr' => [$y => 2]] : TreeMap::scale($tw, 0.25)),
                    'end' => [...self::KEYSTONES[($k * 2 + $o) % count(self::KEYSTONES)], 'keystone'],
                ];
            }
            $specs[] = [$bid, $name, $theme, $colour, null, $spine, $lanes];
            ++$k;
        }

        return self::$built['t:'.$cls] = TreeMap::build($t['root'], $specs, self::SHAPE + ['cls' => $cls]);
    }

    /** Every class map, for the browser build. */
    public static function trees(): array
    {
        $out = [];
        foreach (array_keys(self::TREES) as $cls) {
            $out[$cls] = self::tree($cls);
        }

        return $out;
    }

    /** Skills a set of learned talents teaches. */
    public static function grants(string $cls, array $talents): array
    {
        $out = [];
        $nodes = self::tree($cls)['nodes'];
        foreach ($talents as $id => $r) {
            if ($r > 0 && isset($nodes[$id]['effect']['grant'])) {
                $out[$nodes[$id]['effect']['grant']] = $id;
            }
        }

        return $out;
    }

    public static function check(array $tree, array $have, string $id, int $free, ?string $culture = null): ?string
    {
        return TreeMap::check($tree, $have, $id, $free, $culture);
    }

    /**
     * The order demo heroes and the reference group learn in: the spines of their first three branches out to the
     * skill, then out to the end, then the branch lanes, then the other branches. Deterministic.
     */
    public static function plan(string $cls, int $offset = 0): array
    {
        $key = 'p:'.$cls.':'.($offset % 3);
        if (isset(self::$built[$key])) {
            return self::$built[$key];
        }
        $order = array_keys(self::TREES[$cls]['branches']);
        if ($offset) {
            // Demo heroes lean into different branches so a group of the same class still differs.
            $k = $offset % 3;
            $order = [...array_slice($order, $k, 1), ...array_slice($order, 0, $k), ...array_slice($order, $k + 1)];
        }
        [$s, $depth] = [self::SHAPE['starts'], self::SHAPE['depth']];
        $lane = fn ($bid, $j, $from, $to) => array_map(fn ($d) => $bid.'.'.$j.'.'.$d, range(max($from, $s[$j]), $to));
        $plan = ['root'];
        foreach (array_chunk($order, 3) as $group) {
            foreach ($group as $bid) {
                array_push($plan, ...$lane($bid, 3, 1, self::SKILL_AT));
            }
            foreach ($group as $bid) {
                array_push($plan, ...$lane($bid, 3, self::SKILL_AT + 1, $depth));
            }
            foreach ($group as $bid) {
                foreach ([2, 4, 1, 5, 0, 6] as $j) {
                    array_push($plan, ...$lane($bid, $j, 1, $depth));
                }
            }
        }

        return self::$built[$key] = $plan;
    }

    public static function auto(string $cls, int $points, int $offset = 0): array
    {
        return TreeMap::auto(self::tree($cls), self::plan($cls, $offset), $points);
    }

    /** Everything a set of learned nodes adds up to, as one effect (skills they teach left out). */
    public static function total(array $tree, array $have): array
    {
        $parts = [];
        foreach ($have as $id => $r) {
            if ($r > 0 && isset($tree['nodes'][$id])) {
                $e = $tree['nodes'][$id]['effect'];
                unset($e['grant']);
                $parts[] = $e;
            }
        }

        return TreeMap::merge(...$parts);
    }

    /**
     * Everything learned in the class tree and the race tree, summed into one set of modifiers:
     * [attrs => [[attr, n, from]], stat => [], type => [], skill => [], cost, kin, renown].
     */
    public static function mods(array $build): array
    {
        $m = ['attrs' => [], 'stat' => [], 'type' => [], 'skill' => [], 'cost' => 0.0, 'kin' => 0.0, 'renown' => 0.0];
        $sets = [];
        if (!empty($build['talents']) && isset(self::TREES[$build['cls']])) {
            $sets[] = [self::tree($build['cls']), $build['talents'], 'Talent'];
        }
        if (!empty($build['heritage']) && isset(Heritage::TREES[$build['race']])) {
            $sets[] = [Heritage::tree($build['race']), $build['heritage'], 'Heritage'];
        }
        if (!empty($build['backstory']) && isset(Heritage::TREES[$build['race']])) {
            $b = Heritage::backstories($build['race'])[$build['backstory']] ?? null;
            if ($b) {
                $sets[] = [['nodes' => ['b' => ['name' => $b[0], 'max' => 1, 'effect' => Heritage::backstoryEffect($build['race'], $build['backstory'], $build['culture'] ?? null)]]], ['b' => 1], 'Backstory'];
            }
        }
        if (!empty($build['legend']) && ($le = Legends::effect($build['cls'], $build['path'] ?? null, $build['legend']))) {
            $sets[] = [['nodes' => ['l' => ['name' => Legends::get($build['path'], $build['legend'])[2], 'max' => 1, 'effect' => $le]]], ['l' => 1], 'Legend'];
        }
        foreach ($sets as [$tree, $have, $label]) {
            foreach ($have as $id => $rank) {
                $n = $tree['nodes'][$id] ?? null;
                if (!$n || $rank < 1) {
                    continue;
                }
                $rank = min($rank, $n['max']);
                $e = $n['effect'];
                foreach ($e['attr'] ?? [] as $a => $v) {
                    $m['attrs'][] = [$a, $v * $rank, $label.': '.$n['name']];
                }
                foreach (['stat', 'type', 'skill'] as $k) {
                    foreach ($e[$k] ?? [] as $x => $v) {
                        $m[$k][$x] = ($m[$k][$x] ?? 0) + $v * $rank;
                    }
                }
                foreach (['cost', 'kin', 'renown'] as $k) {
                    $m[$k] += ($e[$k] ?? 0) * $rank;
                }
            }
        }

        return $m;
    }

    public const STAT_TEXT = [
        'dmg' => '%s damage', 'heal' => '%s healing', 'hp' => '%s max health', 'threat' => '%s threat', 'taken' => '%s less damage taken',
        'crit' => '%s crit chance', 'critDmg' => '%s crit damage', 'haste' => '%s haste', 'cdr' => '%s faster cooldowns',
        'dodge' => '%s dodge', 'block' => '%s block', 'regen' => '%s health regen', 'resRegen' => '%s mana and energy regen',
        'rageGain' => '%s rage from hits', 'healRecv' => '%s healing received', 'fortune' => '%s gold and materials', 'xp' => '%s XP',
        'lifesteal' => '%s lifesteal',
    ];

    public const TYPE_TEXT = [
        'strike' => 'single-target skills', 'aoe' => 'area skills', 'heal' => 'direct heals', 'groupheal' => 'group heals', 'hot' => 'heals over time',
        'shield' => 'shields', 'wall' => 'walls', 'mark' => 'marks', 'slow' => 'slows', 'dot' => 'damage over time', 'pet' => 'companions', 'buff' => 'self buffs',
    ];

    /** Plain words for an effect, per rank when the node has more than one rank. */
    public static function describe(array $e, int $max = 1, ?string $cls = null): string
    {
        $p = fn ($v) => ($v >= 0 ? '+' : '−').rtrim(rtrim(number_format(abs($v) * 100, 1), '0'), '.').'%';
        $parts = [];
        foreach ($e['attr'] ?? [] as $a => $v) {
            $parts[] = sprintf('+%d %s', $v, Rules::ATTRIBUTES[$a][0]);
        }
        foreach ($e['stat'] ?? [] as $k => $v) {
            if ($k === 'taken') {
                $parts[] = sprintf($v >= 0 ? '%s less damage taken' : '%s more damage taken', ltrim($p(abs($v)), '+'));
            } elseif ($v < 0 && in_array($k, ['threat', 'hp', 'dmg', 'heal', 'haste', 'crit', 'critDmg', 'dodge', 'healRecv', 'xp', 'fortune'], true)) {
                $parts[] = sprintf(str_replace('%s ', '%s less ', self::STAT_TEXT[$k]), ltrim($p(-$v), '+'));
            } else {
                $parts[] = sprintf(self::STAT_TEXT[$k] ?? ('%s '.$k), $p($v));
            }
        }
        foreach ($e['type'] ?? [] as $k => $v) {
            $parts[] = $v < 0 ? sprintf('%s less from %s', ltrim($p(-$v), '+'), self::TYPE_TEXT[$k] ?? $k) : sprintf('%s to %s', $p($v), self::TYPE_TEXT[$k] ?? $k);
        }
        foreach ($e['skill'] ?? [] as $k => $v) {
            $parts[] = sprintf('%s to %s', $p($v), $cls ? (Rules::classSkills($cls)[$k][0] ?? $k) : $k);
        }
        if (!empty($e['cost'])) {
            $parts[] = sprintf('skills cost %s less', ltrim($p($e['cost']), '+'));
        }
        if (!empty($e['kin'])) {
            $parts[] = sprintf('%s damage and healing for each groupmate of your race (twice for your culture)', $p($e['kin']));
        }
        if (!empty($e['renown'])) {
            $parts[] = sprintf('%s Renown from every run', $p($e['renown']));
        }
        if (!empty($e['grant']) && $cls) {
            $s = self::SKILLS[$cls][$e['grant']];
            $parts[] = sprintf('Teaches %s', $s[0]);
        }
        $text = ucfirst(implode(', ', $parts));

        return $max > 1 ? $text.' per rank' : $text;
    }
}

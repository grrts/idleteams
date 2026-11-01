<?php

namespace App\Game;

/**
 * Marks: earned, never bought, shown on the hero card. Most come from battles; a few from choices (Oath, Signature,
 * Legend) or the social side (guilds, the life story). Battle marks are decided here so the playable build can
 * mirror one function.
 */
final class Marks
{
    public const ALL = [
        // Firsts and choices
        'firstBattle' => ['First Blood', 'Finished a first battle'],
        'firstClear' => ['Delver', 'Cleared a whole dungeon'],
        'oathsworn' => ['Oathsworn', 'Took the Oath at level 20'],
        'signature' => ['Signed', 'Made one skill their own at level 30'],
        'legend' => ['Legend', 'Took a Legend form at level 50'],
        'storyteller' => ['Storyteller', 'Wrote their life story'],
        // Levels
        'level10' => ['Adventurer', 'Reached level 10'],
        'level25' => ['Seasoned', 'Reached level 25'],
        'level40' => ['Old Hand', 'Reached level 40'],
        // Career
        'veteran' => ['Veteran', '100 battles fought'],
        'ironVeteran' => ['Iron Veteran', '1,000 battles fought'],
        'hundredClears' => ['Delver of a Hundred', '100 dungeons cleared'],
        'centurion' => ['Centurion', '100 bosses defeated'],
        'thousandBosses' => ['Bane of a Thousand', '1,000 bosses defeated'],
        'floor' => ['Knows the Floor', 'Died 50 times and kept coming back'],
        'cartographer' => ['Cartographer', 'Cleared every dungeon at least once'],
        'wyvernSlayer' => ['Wyvern Slayer', 'Cleared the Wyvern Roost'],
        'dreamwalker' => ['Dreamwalker', 'Cleared the Dreaming Deep'],
        // One battle
        'scarred' => ['Scarred', 'Died three times in one battle and kept going'],
        'dentedShield' => ['Dented Shield', 'Blocked three Tank Busters in one battle'],
        'untouchable' => ['Untouchable', 'Dodged three Tank Busters in one battle'],
        'curseBreaker' => ['Curse Breaker', 'Shook off three curses in one battle'],
        'grounded' => ['Grounded', 'Resisted three shocks in one battle'],
        'notAScratch' => ['Not a Scratch', 'Cleared a dungeon without anyone in the group dying'],
        'lastStanding' => ['Last One Standing', 'Was the only one still up when the group fell'],
        'overflowing' => ['Overflowing Cup', 'Overhealed more than they healed in one run'],
        'tankTop' => ['Tank Top', 'Did the most damage in the group as a tank'],
        'battleMedic' => ['Battle Medic', 'Did the most damage in the group as a healer'],
        // The group
        'fullTable' => ['Full Table', 'Ran with four other real players'],
        'oneBlood' => ['One Blood', 'Ran in a group of five of one race'],
        'manyRoads' => ['Many Roads', 'Ran in a group of five different races'],
        'legendFound' => ['Legend Finder', 'Won a legendary from a group chest'],
        'bannerBearer' => ['Banner Bearer', 'Joined a guild'],
        'founder' => ['Founder', 'Founded a guild'],
        'mentor' => ['Mentor', 'Ran 10 times with a new hero in the group'],
    ];

    /**
     * Marks a hero earns from one finished battle.
     *
     * @param array $hero   ['level', 'role', 'career' (after this battle, with 'cleared' dungeon ids)]
     * @param int   $k      the hero's index in the report
     * @param array $group  one ['race', 'real'] per hero in the group
     */
    public static function fromBattle(array $hero, int $k, array $rep, array $group, string $dungeon, array $dungeons): array
    {
        $c = $hero['career'];
        $row = $rep['heroes'][$k] ?? [];
        $mech = $row['mechanics'] ?? [];
        $roles = array_map(fn ($r) => Rules::role($r['cls']), $rep['heroes']);
        $out = [];
        $add = function (string $id, bool $if) use (&$out) {
            if ($if) {
                $out[] = $id;
            }
        };
        $add('firstBattle', ($c['battles'] ?? 0) >= 1);
        $add('firstClear', ($c['dungeons'] ?? 0) >= 1);
        $add('level10', $hero['level'] >= 10);
        $add('level25', $hero['level'] >= 25);
        $add('level40', $hero['level'] >= 40);
        $add('veteran', ($c['battles'] ?? 0) >= 100);
        $add('ironVeteran', ($c['battles'] ?? 0) >= 1000);
        $add('hundredClears', ($c['dungeons'] ?? 0) >= 100);
        $add('centurion', ($c['bossKills'] ?? 0) >= 100);
        $add('thousandBosses', ($c['bossKills'] ?? 0) >= 1000);
        $add('floor', ($c['deaths'] ?? 0) >= 50);
        $add('cartographer', !array_diff($dungeons, $c['cleared'] ?? []));
        $add('mentor', ($c['mentored'] ?? 0) >= 10);
        $add('wyvernSlayer', in_array('wyvern-roost', $c['cleared'] ?? [], true));
        $add('dreamwalker', in_array('dreaming-deep', $c['cleared'] ?? [], true));

        $add('scarred', ($row['deaths'] ?? 0) >= 3);
        $add('dentedShield', ($mech['busterBlocked'] ?? 0) >= 3);
        $add('untouchable', ($mech['busterDodged'] ?? 0) >= 3);
        $add('curseBreaker', ($mech['curseResisted'] ?? 0) >= 3);
        $add('grounded', ($mech['shockResisted'] ?? 0) >= 3);
        $add('notAScratch', !$rep['wiped'] && array_sum(array_map(fn ($r) => $r['deaths'] ?? 0, $rep['heroes'])) === 0);
        $add('lastStanding', $rep['wiped'] && ($row['deaths'] ?? 0) === 0 && count($rep['heroes']) > 1);
        $add('overflowing', ($row['healing'] ?? 0) > 0 && ($row['overheal'] ?? 0) > ($row['healing'] ?? 0));
        $damage = array_map(fn ($r) => $r['damage'] ?? 0, $rep['heroes']);
        $top = $damage ? array_search(max($damage), $damage, true) : null;
        $add('tankTop', $top === $k && ($roles[$k] ?? '') === 'tank' && max($damage) > 0);
        $add('battleMedic', $top === $k && ($roles[$k] ?? '') === 'healer' && max($damage) > 0);

        $races = array_column($group, 'race');
        $add('fullTable', count($group) >= 5 && count(array_filter($group, fn ($g) => $g['real'])) >= 5);
        $add('oneBlood', count($races) >= 5 && count(array_unique($races)) === 1);
        $add('manyRoads', count($races) >= 5 && count(array_unique($races)) === count($races));

        return $out;
    }
}

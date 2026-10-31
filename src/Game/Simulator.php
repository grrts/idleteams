<?php

namespace App\Game;

use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * Deterministic battle simulation. Same inputs and seed always give the same battle, so it can run once on the
 * server, be replayed on every screen, and be checked later.
 *
 * A battle is one run through a dungeon: three wings, each with trash packs and then a boss. Bosses pick from
 * the same toolbox: auto attacks on the top-threat target, Tank Buster, Magma Rain (fire, hits everyone),
 * Shockwave (knockback), a curse on a random hero, adds at half health, and an enrage that ends the fight if
 * damage is too low. The last boss, the Ember Golem, uses all of it.
 * Every role owns one way to fail: tank (threat, Tank Buster), healer (Magma Rain, mana), damage (enrage, adds).
 */
final class Simulator
{
    public const DT = 0.5;

    /** Seconds the group walks between fights. */
    public const WALK = 4;

    /** Mechanic timings: first use and repeat, in seconds into the boss fight. A dungeon can override them per mechanic. */
    public const MECHANIC_TIMING = ['buster' => [12.0, 15], 'rain' => [6.0, 9], 'shock' => [25.0, 30], 'curse' => [18.0, 30]];

    /** The dungeon being run, as Dungeons::get() gives it. */
    private array $d = [];
    private Randomizer $r;
    private float $t = 0.0;
    private array $h = [];
    private array $e = [];
    /** Index of the current encounter in the dungeon's plan. */
    private int $clear = 0;
    private int $wing = 0;
    private float $phaseStart = 0.0;
    private string $phase = 'pack';
    private array $ev = [];
    private array $snap = [];
    private array $report = [];
    private array $ref;
    private int $enemySeq = 0;
    private int $dungeonLevel = 1;
    private array $mech = [];
    private float $enrageAt = 0.0;
    private bool $enraged = false;
    private bool $shardsSpawned = false;
    private ?array $wipe = null;
    private array $lastDeath = [];
    private array $oomAt = [];
    /** Heroic and Mythic (src/Game/Modes.php): enemy health and damage, and the affixes in play. */
    private array $mods = ['pack' => [1.0, 1.0], 'boss' => [1.0, 1.0], 'affixes' => []];
    private float $hpMod = 1.0;
    private float $dmgMod = 1.0;
    private array $affixAt = [];

    /**
     * @param array $heroes [['id', 'name', 'cls', 'race', 'origin', 'level', 'path', 'keystones', 'loadout', 'ranks', 'stats' => Stats::derive()]]
     */
    /** Damage per second a party deals to a target dummy that never hits back. Used to tune enemies. */
    public function measureDps(array $heroes, int $seconds = 90, int $seed = 12345): float
    {
        $this->r = new Randomizer(new Mt19937($seed));
        $this->ref = ['dps' => 1, 'hps' => 0, 'tankHp' => 1, 'tankDr' => 0, 'avgHp' => 1, 'avgDr' => 0];
        foreach ($heroes as $i => $x) {
            $this->h[$i] = $this->initHero($i, $x);
            $this->report[$i] = ['damage' => 0, 'healing' => 0, 'overheal' => 0, 'taken' => 0, 'absorbed' => 0, 'deaths' => 0, 'mechanics' => [], 'casts' => 0, 'sigXp' => 0];
        }
        $this->applyKin();
        $this->phase = 'boss';
        $this->mech = ['buster' => 1e9, 'rain' => 1e9, 'shock' => 1e9, 'curse' => 1e9];
        $this->enrageAt = 1e9;
        $this->shardsSpawned = true;
        $this->spawn('boss', 'Target Dummy', 1e15, 0, 2.0);
        foreach ($this->h as $h) {
            $this->e[$this->enemySeq]['threat'][$h['i']] = $h['role'] === 'tank' ? 10.0 : 0.0;
        }
        while ($this->t < $seconds) {
            $this->t = round($this->t + self::DT, 2);
            $this->tick();
        }

        return array_sum(array_column($this->report, 'damage')) / $seconds;
    }

    public function run(array $heroes, int $dungeonLevel, int $seed, ?array $dungeon = null, ?array $mods = null): array
    {
        $this->d = $dungeon ?? Dungeons::get();
        $this->mods = $mods ?? $this->mods;
        $this->r = new Randomizer(new Mt19937($seed));
        $this->dungeonLevel = max(1, $dungeonLevel);
        $this->ref = Reference::forLevel($this->dungeonLevel);
        foreach ($heroes as $i => $x) {
            $this->h[$i] = $this->initHero($i, $x);
            $this->report[$i] = ['damage' => 0, 'healing' => 0, 'overheal' => 0, 'taken' => 0, 'absorbed' => 0, 'deaths' => 0, 'mechanics' => [], 'casts' => 0, 'sigXp' => 0];
        }
        $this->applyKin();
        $done = 0;
        $bosses = 0;
        foreach ($this->d['plan'] as $c => [$kind, $name, $wing]) {
            $this->clear = $c;
            $this->wing = $wing;
            if ($c > 0) {
                $this->walk();
            }
            foreach ($this->h as &$hero) {
                if ($hero['dead']) {
                    $hero['dead'] = false;
                    $hero['hp'] = $hero['s']['maxHp'] * 0.4;
                    $this->emit('revive', $hero['i'], -1, 0, 0);
                }
                $hero['lastRite'] = false;
            }
            unset($hero);
            if (!$this->fight($kind, $name)) {
                break;
            }
            ++$done;
            $bosses += $kind === 'boss' ? 1 : 0;
        }

        $report = [
            'dungeon' => $this->d['name'],
            'plan' => Dungeons::plan($this->d),
            'encountersDone' => $done,
            'bossesKilled' => $bosses,
            'wiped' => (bool) $this->wipe,
            'cause' => $this->wipe ? $this->explain() : null,
            'length' => round($this->t, 1),
            'dungeonLevel' => $dungeonLevel,
            'affixes' => $this->mods['affixes'],
            'heroes' => [],
        ];
        foreach ($this->h as $i => $hero) {
            $report['heroes'][$i] = array_map(fn ($v) => is_float($v) ? (int) round($v) : $v, $this->report[$i]) + ['id' => $hero['id'], 'name' => $hero['name'], 'cls' => $hero['cls']];
        }

        return ['report' => $report, 'timeline' => ['events' => $this->ev, 'snaps' => $this->snap, 'length' => round($this->t, 1)]];
    }

    // ------------------------------------------------------------------ setup

    private function initHero(int $i, array $x): array
    {
        $s = $x['stats'];
        $skills = [];
        $all = Rules::classSkills($x['cls']);
        foreach ($x['loadout'] as $id) {
            if (isset($all[$id])) {
                $skills[$id] = $all[$id];
            }
        }
        $ult = Rules::CLASSES[$x['cls']]['ultimate'][0];
        if ($x['level'] >= Rules::ULTIMATE_LEVEL) {
            $skills[$ult] = $all[$ult];
        }
        $ks = array_values($x['keystones'] ?? []);

        return [
            'i' => $i, 'id' => $x['id'], 'name' => $x['name'], 'cls' => $x['cls'], 'role' => Rules::role($x['cls']),
            'race' => $x['race'], 'culture' => $x['culture'] ?? null, 'backstory' => $x['backstory'] ?? null, 'origin' => $x['origin'], 'level' => $x['level'], 'ks' => $ks, 's' => $s,
            'school' => Rules::CLASSES[$x['cls']]['school'], 'passive' => Rules::CLASSES[$x['cls']]['passive'][0],
            'skills' => $skills, 'ult' => $ult, 'ranks' => $x['ranks'] ?? [],
            'hp' => $s['maxHp'], 'res' => $s['resource'] === 'rage' ? 0.0 : $s['resMax'], 'absorb' => 0.0,
            'cd' => [], 'gcd' => 0.0, 'swing' => 0.0, 'dead' => false, 'knock' => 0.0,
            'walls' => [], 'buffs' => [], 'hots' => [], 'pets' => [], 'curse' => null,
            'nineLives' => false, 'phoenix' => false, 'lastRite' => false, 'secondWind' => false,
            'stack' => 0, 'stackTarget' => null, 'forceCrit' => false, 'firstHeal' => true, 'firstBossHit' => true,
            'firstPackHit' => true, 'oom' => false,
            'sig' => isset($x['signature']['id'], $skills[$x['signature']['id']]) ? $x['signature'] + ['traits' => Rules::signatureTraits((int) ($x['signature']['mastery'] ?? 0))] : null,
        ];
    }

    /** Heritage: heroes fight harder beside their own race, twice as much beside their own culture. */
    private function applyKin(): void
    {
        foreach ($this->h as $i => $h) {
            if (($h['s']['kin'] ?? 0) <= 0) {
                continue;
            }
            $others = [];
            foreach ($this->h as $k => $x) {
                if ($k !== $i) {
                    $others[] = [$x['race'], $x['culture'], $x['backstory'] ?? null];
                }
            }
            $f = 1 + min(Heritage::KIN_CAP, $h['s']['kin'] * Heritage::kin($h['race'], $h['culture'], $others, $h['backstory'] ?? null));
            foreach (['might', 'arcana', 'spirit'] as $p) {
                $this->h[$i]['s'][$p] *= $f;
            }
        }
    }

    private function ks(array $h, string $id): bool
    {
        return in_array($id, $h['ks'], true);
    }

    private function res(array $h, string $theme): int
    {
        return $h['s']['resonance'][$theme] ?? 0;
    }

    private function power(array $h, string $id): bool
    {
        return in_array($id, $h['s']['powers'], true);
    }

    // ------------------------------------------------------------------ phases

    private function snapshot(): void
    {
        $t = $this->t;
        $this->snap[] = [
                (int) round($t),
                array_map(fn ($h) => $h['dead'] ? 0 : (int) round(1000 * $h['hp'] / $h['s']['maxHp']), array_values($this->h)),
                array_map(fn ($h) => $h['s']['resMax'] > 0 ? (int) round(1000 * $h['res'] / $h['s']['resMax']) : 0, array_values($this->h)),
                array_map(fn ($e) => [$e['id'], max(0, (int) round(1000 * $e['hp'] / $e['max']))], array_values($this->e)),
                array_map(fn ($h) => $h['absorb'] > 0 ? (int) round(1000 * min(1, $h['absorb'] / $h['s']['maxHp'])) : 0, array_values($this->h)),
            ];
    }

    /** The group walks to the next fight: no combat, the playback shows them moving on. */
    private function walk(): void
    {
        $this->e = [];
        $this->emit('walk', $this->clear, -1, 0, 0, ['to' => Dungeons::label($this->d, $this->clear)]);
        $end = $this->t + self::WALK;
        while ($this->t < $end) {
            $this->t = round($this->t + self::DT, 2);
            if (abs($this->t - round($this->t)) < 0.01) {
                $this->snapshot();
            }
        }
    }

    private function fight(string $phase, string $id): bool
    {
        $this->phase = $phase;
        $f = $this->difficulty();
        $ref = $this->ref;
        $this->e = [];
        $this->shardsSpawned = false;
        $this->enraged = false;
        [$this->hpMod, $this->dmgMod] = $this->mods[$phase];
        $this->affixAt = ['volcanic' => 9.0, 'quaking' => 15.0];
        $hitDmg = $ref['hps'] * 0.14 * 2 * $f / (1 - $ref['tankDr']);
        if ($phase === 'pack') {
            // A pack shares one health budget among its enemies; a brute hits harder and slower than an imp.
            $pack = $this->d['packs'][$id];
            $name = $pack['name'];
            foreach ($pack['spawn'] as $sp) {
                $foe = $this->d['enemies'][$sp['enemy']];
                for ($k = 0; $k < $sp['count']; ++$k) {
                    $this->spawn($foe['kind'], $foe['name'], Dungeons::share($ref['dps'] * 11 * $f, $sp['health']), $hitDmg * $sp['damage'], (float) $sp['swing']);
                }
            }
        } else {
            $boss = $this->d['bosses'][$id];
            $name = $boss['name'];
            $this->spawn('boss', $name, $ref['dps'] * 46 * $f * $boss['health'], $ref['hps'] * 0.46 * 2 * $f * $boss['damage'] / (1 - $ref['tankDr']), 2.0);
            $this->e[$this->enemySeq]['hit'] = $boss['hit'];
            $this->mech = [];
            foreach (self::MECHANIC_TIMING as $m => [$at]) {
                $this->mech[$m] = in_array($m, $boss['mechanics'], true) ? (float) ($this->d['mechanics'][$m]['at'] ?? $at) : 1e9;
            }
            $this->shardsSpawned = !in_array('adds', $boss['mechanics'], true);
            $this->enrageAt = (float) $boss['enrage'];
        }
        $this->phaseStart = $this->t;
        $this->emit('phase', $this->clear, $phase === 'boss' ? 1 : 0, 0, 0, ['name' => $name, 'wing' => $this->wing, 'enemies' => array_map(fn ($e) => [$e['id'], $e['kind'], $e['name'], (int) $e['max']], $this->e)]);

        // Between packs: a short breather.
        foreach ($this->h as &$h) {
            if ($h['dead']) {
                continue;
            }
            $s = $h['s'];
            if ($s['resource'] === 'rage' && $h['origin'] !== 'wolf') {
                $h['res'] = 0;
            }
            if ($s['resource'] === 'energy' && $h['origin'] === 'hare') {
                $h['res'] = $s['resMax'];
            }
            if ($s['resource'] === 'mana') {
                $h['res'] = min($s['resMax'], $h['res'] + $s['resRegen'] * 3 * ($h['origin'] === 'tide' ? 2 : 1));
            }
            if ($h['origin'] === 'oak') {
                $h['absorb'] += $s['maxHp'] * 0.08;
            }
            $h['secondWind'] = false;
            $h['firstPackHit'] = true;
            $h['firstBossHit'] = true;
            $h['stack'] = 0;
            $h['gcd'] = $this->t;
            $h['swing'] = $this->t + 0.5 * $h['i'] / 5;
        }
        unset($h);
        // The tank opens the pull.
        foreach ($this->e as &$e) {
            foreach ($this->h as $h) {
                $e['threat'][$h['i']] = $h['role'] === 'tank' && !$h['dead'] ? 10.0 : 0.0;
            }
        }
        unset($e);

        $limit = $this->t + ($phase === 'boss' ? 160 : 90);
        while (true) {
            $this->t = round($this->t + self::DT, 2);
            $this->tick();
            if (!$this->aliveEnemies()) {
                return true;
            }
            if (!$this->aliveHeroes()) {
                $this->wipe = $this->wipe ?? ['t' => $this->t, 'clear' => $this->clear, 'phase' => $phase, 'enraged' => $this->enraged];

                return false;
            }
            if ($this->t > $limit) {
                $this->wipe = ['t' => $this->t, 'clear' => $this->clear, 'phase' => $phase, 'enraged' => true, 'timeout' => true];

                return false;
            }
        }
    }

    /** Each wing is harder than the last; the first dungeons go easy on starter gear. */
    private function mechName(string $type): string
    {
        return $this->d['mechanics'][$type]['name'] ?? $type;
    }

    private function every(string $type): float|int
    {
        return $this->d['mechanics'][$type]['every'] ?? self::MECHANIC_TIMING[$type][1];
    }

    private function difficulty(): float
    {
        $ramp = min(1.0, 0.50 + 0.04 * $this->dungeonLevel);

        return $ramp * (1 + 0.15 * $this->wing);
    }

    private function spawn(string $kind, string $name, float $hp, float $dmg, float $swing): void
    {
        $id = ++$this->enemySeq;
        $hp *= $this->hpMod;
        $dmg *= $this->dmgMod;
        $this->e[$id] = ['id' => $id, 'kind' => $kind, 'name' => $name, 'hp' => $hp, 'max' => $hp, 'dmg' => $dmg, 'swingEvery' => $swing,
            'swing' => $this->t + 1.0, 'threat' => [], 'taunt' => null, 'tauntUntil' => 0.0, 'slows' => [], 'marks' => [], 'dots' => []];
    }

    // ------------------------------------------------------------------ the tick

    private function tick(): void
    {
        $t = $this->t;
        $whole = abs($t - round($t)) < 0.01;

        foreach ($this->h as $i => &$h) {
            if ($h['dead']) {
                continue;
            }
            $s = $h['s'];
            if ($s['resource'] !== 'rage') {
                $h['res'] = min($s['resMax'], $h['res'] + $s['resRegen'] * self::DT * ($this->ks($h, 'deepWell') ? 1.3 : 1));
            }
            $regen = $s['regen'] + ($h['passive'] === 'deepRoots' ? $s['maxHp'] * 0.012 : 0);
            $h['hp'] = min($s['maxHp'], $h['hp'] + $regen * self::DT);
        }
        unset($h);

        if ($whole) {
            $this->tickHots();
            $this->tickDots();
        }

        // Heroes act.
        foreach (array_keys($this->h) as $i) {
            if ($this->h[$i]['dead'] || $this->h[$i]['knock'] > $t) {
                continue;
            }
            if ($t >= $this->h[$i]['swing']) {
                $this->autoAttack($i);
            }
            if ($t >= $this->h[$i]['gcd']) {
                $this->act($i);
            }
            foreach ($this->h[$i]['pets'] as $k => $pet) {
                if ($pet['until'] < $t) {
                    unset($this->h[$i]['pets'][$k]);
                } elseif ($whole) {
                    $this->hit($i, $this->focusTarget($i), $pet['mult'], $pet['school'], ['pet' => true]);
                }
            }
            if (!$this->aliveEnemies()) {
                return;
            }
        }

        // Enemies act.
        foreach (array_keys($this->e) as $id) {
            if (!isset($this->e[$id]) || $this->e[$id]['hp'] <= 0) {
                continue;
            }
            $e = &$this->e[$id];
            $slow = 0.0;
            foreach ($e['slows'] as $sl) {
                if ($sl[1] > $t) {
                    $slow = max($slow, $sl[0]);
                }
            }
            if ($t >= $e['swing']) {
                $target = $this->enemyTarget($id);
                if ($target !== null) {
                    $mult = ($this->enraged && $e['kind'] === 'boss' ? 3.0 : 1.0) * ($this->affix('raging') && $e['hp'] < $e['max'] * 0.3 ? 1.5 : 1.0);
                    $this->damageHero($target, $e['dmg'] * $mult, ['melee' => true, 'src' => $id, 'what' => $e['hit'] ?? $e['name']]);
                }
                $e['swing'] = $t + $e['swingEvery'] * (1 + $slow) * ($this->enraged && $e['kind'] === 'boss' ? 0.6 : 1);
            }
            unset($e);
        }

        if ($this->phase === 'boss') {
            $this->bossMechanics();
        }
        if ($this->mods['affixes']) {
            $this->affixes();
        }

        if ($whole) {
            $this->snapshot();
        }
    }

    private function affix(string $id): bool
    {
        return in_array($id, $this->mods['affixes'], true);
    }

    /** Volcanic and Quaking go off on a timer in every fight. */
    private function affixes(): void
    {
        $t = $this->t - $this->phaseStart;
        $ref = $this->ref;
        $f = $this->difficulty() * $this->dmgMod;
        if ($this->affix('volcanic') && $t >= $this->affixAt['volcanic']) {
            $this->affixAt['volcanic'] += 9;
            $alive = array_keys(array_filter($this->h, fn ($h) => !$h['dead'] && $h['role'] !== 'tank'));
            if ($alive) {
                $i = $alive[$this->r->getInt(0, count($alive) - 1)];
                $this->emit('mech', -1, $i, 0, 0, ['name' => 'Volcanic']);
                $this->damageHero($i, $ref['avgHp'] * 0.16 * $f, ['fire' => true, 'magic' => true, 'src' => -1, 'what' => 'Volcanic']);
            }
        }
        if ($this->affix('quaking') && $t >= $this->affixAt['quaking']) {
            $this->affixAt['quaking'] += 15;
            $this->emit('mech', -1, -1, 0, 0, ['name' => 'Quaking']);
            foreach ($this->h as $i => $h) {
                if (!$h['dead']) {
                    $this->damageHero($i, $ref['avgHp'] * 0.07 * $f, ['magic' => true, 'src' => -1, 'what' => 'Quaking']);
                }
            }
        }
    }

    /** Bolstering: a pack enemy's death heals the rest of the pack and makes it hit harder. */
    private function bolster(int $dead): void
    {
        if (!$this->affix('bolstering') || $this->e[$dead]['kind'] === 'boss') {
            return;
        }
        foreach ($this->e as $id => $e) {
            if ($e['hp'] > 0 && $e['kind'] !== 'boss') {
                $this->e[$id]['dmg'] *= 1.15;
                $this->e[$id]['hp'] = min($e['max'], $e['hp'] + $e['max'] * 0.1);
            }
        }
    }

    private function bossMechanics(): void
    {
        $t = $this->t - $this->phaseStart;
        $boss = null;
        foreach ($this->e as $e) {
            if ($e['kind'] === 'boss' && $e['hp'] > 0) {
                $boss = $e;
            }
        }
        if (!$boss) {
            return;
        }
        $f = $this->difficulty() * $this->dmgMod;
        $ref = $this->ref;
        $m = $this->enraged ? 2.0 : 1.0;

        if ($t >= $this->mech['buster']) {
            $this->mech['buster'] += $this->every('buster');
            $target = $this->enemyTarget($boss['id']);
            if ($target !== null) {
                $this->emit('mech', -1, $target, 0, 0, ['name' => $this->mechName('buster')]);
                $this->damageHero($target, $ref['tankHp'] * 0.30 * $f * $m / (1 - $ref['tankDr']), ['melee' => true, 'src' => $boss['id'], 'what' => $this->mechName('buster'), 'big' => true]);
            }
        }
        if ($t >= $this->mech['rain']) {
            $this->mech['rain'] += $this->every('rain');
            $this->emit('mech', -1, -1, 0, 0, ['name' => $this->mechName('rain')]);
            // Scaled from healing, but never past a share of a hero's health: big heals must not mean one-shots.
            $rain = min($ref['hps'] * 0.30 * 9 / 5, $ref['avgHp'] * 0.35 * (1 - $ref['avgDr'] * 0.5)) * $f * $m / (1 - $ref['avgDr'] * 0.5);
            foreach ($this->h as $i => $h) {
                if (!$h['dead']) {
                    $this->damageHero($i, $rain, ['fire' => !empty($this->d['mechanics']['rain']['fire']), 'magic' => true, 'src' => $boss['id'], 'what' => $this->mechName('rain')]);
                }
            }
        }
        if ($t >= $this->mech['shock']) {
            $this->mech['shock'] += $this->every('shock');
            $this->emit('mech', -1, -1, 0, 0, ['name' => $this->mechName('shock')]);
            foreach ($this->h as $i => &$h) {
                if ($h['dead']) {
                    continue;
                }
                $immune = $h['race'] === 'dwarf' || $this->ks($h, 'unmovable') || $this->r->getFloat(0, 1) < $h['s']['resist'];
                if ($immune) {
                    $this->report[$i]['mechanics']['shockResisted'] = ($this->report[$i]['mechanics']['shockResisted'] ?? 0) + 1;
                } else {
                    $h['knock'] = $this->t + 2.0;
                    $this->report[$i]['mechanics']['knockedBack'] = ($this->report[$i]['mechanics']['knockedBack'] ?? 0) + 1;
                }
            }
            unset($h);
        }
        if ($t >= $this->mech['curse']) {
            $this->mech['curse'] += $this->every('curse');
            $alive = array_keys(array_filter($this->h, fn ($h) => !$h['dead'] && $h['role'] !== 'tank'));
            if ($alive) {
                $i = $alive[$this->r->getInt(0, count($alive) - 1)];
                if ($this->r->getFloat(0, 1) < $this->h[$i]['s']['resist']) {
                    $this->emit('mech', -1, $i, 0, 1, ['name' => 'Curse resisted']);
                    $this->report[$i]['mechanics']['curseResisted'] = ($this->report[$i]['mechanics']['curseResisted'] ?? 0) + 1;
                } else {
                    $this->emit('mech', -1, $i, 0, 0, ['name' => $this->mechName('curse')]);
                    $this->h[$i]['curse'] = ['until' => $this->t + 10, 'dps' => $this->h[$i]['s']['maxHp'] * 0.035];
                }
            }
        }
        if (!$this->shardsSpawned && $boss['hp'] < $boss['max'] * 0.5) {
            $this->shardsSpawned = true;
            $adds = $this->d['mechanics']['adds'];
            $foe = $this->d['enemies'][$adds['enemy']];
            $this->emit('mech', -1, -1, 0, 0, ['name' => $adds['name']]);
            for ($k = 0; $k < $adds['count']; ++$k) {
                $this->spawn($foe['kind'], $foe['name'], $ref['dps'] * 3.5 * $this->difficulty(), $ref['hps'] * 0.10 * 2 * $this->difficulty() / (1 - $ref['tankDr']), 2.0);
                $id = $this->enemySeq;
                $this->emit('spawn', $id, -1, (int) $this->e[$id]['max'], 0, ['enemy' => [$id, $foe['kind'], $foe['name'], (int) $this->e[$id]['max']]]);
                foreach ($this->h as $h) {
                    $this->e[$id]['threat'][$h['i']] = $h['role'] === 'healer' ? 5.0 : 0.0;
                }
            }
            $this->emit('phase', $this->clear, 2, 0, 0, ['enemies' => array_map(fn ($e) => [$e['id'], $e['kind'], $e['name'], (int) $e['max']], $this->e)]);
        }
        if (!$this->enraged && $t >= $this->enrageAt) {
            $this->enraged = true;
            $this->emit('mech', -1, -1, 0, 0, ['name' => 'Enrage']);
        }
    }

    // ------------------------------------------------------------------ hero choices

    private function act(int $i): void
    {
        $h = $this->h[$i];
        $choice = match ($h['role']) {
            'tank' => $this->chooseTank($i),
            'healer' => $this->chooseHealer($i),
            default => $this->chooseDps($i),
        };
        if (!$choice) {
            $this->h[$i]['gcd'] = $this->t + 0.5;

            return;
        }
        [$id, $target] = $choice;
        $this->cast($i, $id, $target);
        if ($this->power($this->h[$i], 'echo') && $this->h[$i]['skills'][$id][2] !== 'taunt' && $this->r->getFloat(0, 1) < 0.2) {
            $this->cast($i, $id, $target, true);
        }
        $sig = $this->h[$i]['sig'];
        if ($sig && $sig['id'] === $id && $sig['traits']['echo'] && $this->r->getFloat(0, 1) < min(0.5, 0.1 * $sig['traits']['echo'])) {
            $this->cast($i, $id, $target, true);
        }
    }

    private function ready(int $i, string $id): bool
    {
        $h = $this->h[$i];
        if (!isset($h['skills'][$id])) {
            return false;
        }
        if (($h['cd'][$id] ?? 0) > $this->t) {
            return false;
        }

        return $h['res'] >= $this->cost($i, $id) - 0.001;
    }

    private function rank(int $i, string $id): int
    {
        return max(1, (int) ($this->h[$i]['ranks'][$id] ?? 1));
    }

    private function cost(int $i, string $id): float
    {
        $h = $this->h[$i];
        $sk = $h['skills'][$id];
        if ($sk[7] === 'ultimate') {
            return 0;
        }
        $c = $sk[4] * $h['s']['costScale'] * max(0.5, 1 - 0.02 * max(0, $this->rank($i, $id) - 5)) * ($h['s']['costMult'] ?? 1);
        if ($h['role'] === 'healer' && $this->ks($h, 'frugal') && in_array($sk[2], ['heal', 'groupheal', 'hot', 'shield'], true)) {
            $c *= 0.75;
        }

        return $c;
    }

    private function skillsOfType(int $i, array $types): array
    {
        $out = [];
        foreach ($this->h[$i]['skills'] as $id => $sk) {
            if (in_array($sk[2], $types, true) && $id !== $this->h[$i]['ult'] && $this->ready($i, $id)) {
                $out[] = $id;
            }
        }
        usort($out, fn ($a, $b) => $this->h[$i]['skills'][$b][3] <=> $this->h[$i]['skills'][$a][3]);

        return $out;
    }

    private function chooseTank(int $i): ?array
    {
        $h = $this->h[$i];
        $hpPct = $h['hp'] / $h['s']['maxHp'];
        $ult = $h['ult'];
        if ($hpPct < 0.4 && $this->ready($i, $ult)) {
            return [$ult, $i];
        }
        foreach ($this->e as $e) {
            if ($e['hp'] > 0 && $this->enemyTarget($e['id']) !== $i && ($ids = $this->skillsOfType($i, ['taunt']))) {
                return [$ids[0], $e['id']];
            }
        }
        // Brace for the Tank Buster a moment before it lands.
        $busterSoon = $this->phase === 'boss' && ($this->mech['buster'] ?? 1e9) - ($this->t - $this->phaseStart) < 2.5;
        if ($busterSoon && ($ids = $this->skillsOfType($i, ['wall', 'shield']))) {
            return [$ids[0], $i];
        }
        // Rage that would overflow is better spent on a wall.
        $rageFull = $h['s']['resource'] === 'rage' && $h['res'] >= 0.8 * $h['s']['resMax'] && $this->phase === 'boss';
        if (($hpPct < 0.65 || $rageFull) && ($ids = $this->skillsOfType($i, ['wall']))) {
            return [$ids[0], $i];
        }
        if ($hpPct < 0.75 && ($ids = $this->skillsOfType($i, ['shield', 'hot']))) {
            return [$ids[0], $i];
        }
        if (count($this->aliveEnemies()) >= 2 && ($ids = $this->skillsOfType($i, ['aoe']))) {
            return [$ids[0], null];
        }
        if ($ids = $this->skillsOfType($i, ['strike'])) {
            return [$ids[0], $this->focusTarget($i)];
        }

        return null;
    }

    private function chooseHealer(int $i): ?array
    {
        $alive = array_filter($this->h, fn ($x) => !$x['dead']);
        $pct = fn ($x) => $x['hp'] / $x['s']['maxHp'];
        uasort($alive, fn ($a, $b) => $pct($a) <=> $pct($b));
        $lowest = array_key_first($alive);
        $low = count(array_filter($alive, fn ($x) => $pct($x) < 0.7));
        $tank = null;
        foreach ($alive as $k => $x) {
            if ($x['role'] === 'tank') {
                $tank = $k;
            }
        }
        $ult = $this->h[$i]['ult'];
        if ($low >= 3 && $this->ready($i, $ult)) {
            return [$ult, null];
        }
        if ($low >= 3 && ($ids = $this->skillsOfType($i, ['groupheal']))) {
            return [$ids[0], null];
        }
        foreach ($this->h[$i]['skills'] as $id => $sk) {
            if ($low >= 2 && in_array($sk[2], ['hot', 'shield'], true) && !empty($sk[6]['party']) && $this->ready($i, $id)) {
                return [$id, null];
            }
        }
        if ($lowest !== null && $pct($alive[$lowest]) < 0.5 && ($ids = $this->skillsOfType($i, ['heal']))) {
            return [$ids[0], $lowest];
        }
        if ($tank !== null && $this->h[$tank]['absorb'] <= 0) {
            foreach ($this->h[$i]['skills'] as $id => $sk) {
                if ($sk[2] === 'shield' && empty($sk[6]['party']) && $this->ready($i, $id)) {
                    return [$id, $tank];
                }
            }
        }
        foreach ([$tank, $lowest] as $who) {
            if ($who === null || $pct($alive[$who]) > 0.95) {
                continue;
            }
            $hasHot = false;
            foreach ($this->h[$who]['hots'] as $hot) {
                if ($hot['src'] === $i) {
                    $hasHot = true;
                }
            }
            if (!$hasHot) {
                foreach ($this->h[$i]['skills'] as $id => $sk) {
                    if ($sk[2] === 'hot' && empty($sk[6]['party']) && empty($sk[6]['self']) && $this->ready($i, $id)) {
                        return [$id, $who];
                    }
                }
            }
        }
        if ($lowest !== null && $pct($alive[$lowest]) < 0.8 && ($ids = $this->skillsOfType($i, ['heal']))) {
            return [end($ids), $lowest];
        }
        if ($low >= 2 && ($ids = $this->skillsOfType($i, ['groupheal']))) {
            return [$ids[0], null];
        }
        $h = $this->h[$i];
        if ($h['res'] > $h['s']['resMax'] * 0.6 && ($lowest === null || $pct($alive[$lowest]) > 0.85)) {
            if ($ids = $this->skillsOfType($i, ['pet'])) {
                return [$ids[0], null];
            }
            if ($ids = $this->skillsOfType($i, ['strike'])) {
                return [$ids[0], $this->focusTarget($i)];
            }
        }

        return null;
    }

    private function chooseDps(int $i): ?array
    {
        $h = $this->h[$i];
        $boss = null;
        foreach ($this->e as $e) {
            if ($e['kind'] === 'boss' && $e['hp'] > 0) {
                $boss = $e;
            }
        }
        $ult = $h['ult'];
        if ($this->ready($i, $ult) && ($boss ? $boss['hp'] < $boss['max'] * 0.9 : count($this->aliveEnemies()) >= 3)) {
            return [$ult, $this->focusTarget($i)];
        }
        foreach ($this->e as $e) {
            if ($e['hp'] > 0 && $this->enemyTarget($e['id']) === $i && ($ids = $this->skillsOfType($i, ['vanish']))) {
                return [$ids[0], null];
            }
        }
        if ($boss) {
            foreach (['mark', 'buff', 'slow', 'pet'] as $type) {
                if ($ids = $this->skillsOfType($i, [$type])) {
                    return [$ids[0], $boss['id']];
                }
            }
            $target = $this->focusTarget($i);
            if ($target && !isset($this->e[$target]['dots'][$i]) && ($ids = $this->skillsOfType($i, ['dot']))) {
                return [$ids[0], $target];
            }
        }
        // Hold back when about to pull threat from a living tank: autos only until the tank is ahead again.
        $focus = $this->focusTarget($i);
        if ($focus !== null && $this->closeToPulling($i, $focus)) {
            return null;
        }
        $n = count($this->aliveEnemies());
        if (($n >= 3 || ($n >= 2 && $this->ks($h, 'shrapnel'))) && ($ids = $this->skillsOfType($i, ['aoe']))) {
            return [$ids[0], null];
        }
        if (!$boss && $n >= 2 && ($ids = $this->skillsOfType($i, ['slow', 'pet']))) {
            return [$ids[0], $this->focusTarget($i)];
        }
        if ($ids = $this->skillsOfType($i, ['strike'])) {
            return [$ids[0], $this->focusTarget($i)];
        }
        if ($ids = $this->skillsOfType($i, ['aoe', 'dot'])) {
            return [$ids[0], $this->focusTarget($i)];
        }

        return null;
    }

    // ------------------------------------------------------------------ casting

    private function cast(int $i, string $id, $target, bool $echo = false): void
    {
        $h = &$this->h[$i];
        $sk = $h['skills'][$id];
        [$name, , $type, $mult, , $cd, $opts] = $sk;
        if (!$echo) {
            $h['res'] -= $this->cost($i, $id);
            if ($h['res'] < $h['s']['resMax'] * 0.05 && $h['s']['resource'] === 'mana' && !$h['oom']) {
                $h['oom'] = true;
                $this->oomAt[$i] ??= ['t' => $this->t, 'clear' => $this->clear];
            }
            $cdm = (1 - $h['s']['cdr']) * max(0.5, 1 - 0.02 * max(0, $this->rank($i, $id) - 5));
            if ($h['role'] === 'healer' && $this->ks($h, 'quickened') && in_array($type, ['heal', 'groupheal', 'hot', 'shield'], true)) {
                $cdm *= 0.7;
            }
            if ($type === 'taunt' && $h['origin'] === 'bell') {
                $cdm *= 0.8;
            }
            if ($h['sig'] && $h['sig']['id'] === $id) {
                $cdm *= 0.92 ** $h['sig']['traits']['swift'];
                $this->report[$i]['sigXp'] += max(1, $cd);
            }
            $h['cd'][$id] = $this->t + $cd * $cdm;
            $h['gcd'] = $this->t + 1.5 / $h['s']['haste'];
            $this->report[$i]['casts']++;
        }
        unset($h);
        $hh = $this->h[$i];
        $rankMult = 1 + 0.1 * (min(5, $this->rank($i, $id)) - 1);
        $mult *= $rankMult * (1 + ($hh['s']['typeMult'][$type] ?? 0) + ($hh['s']['skillMult'][$id] ?? 0));
        $school = $opts['school'] ?? ($type === 'heal' || $type === 'groupheal' || $type === 'hot' || $type === 'shield' ? 'spirit' : $hh['school']);
        $cmd = $hh['s']['command'];
        $dur = ($opts['dur'] ?? 8) + ($hh['origin'] === 'crown' ? 2 : 0);
        $big = $sk[7] === 'ultimate' || $type === 'taunt' || $type === 'wall';
        $sig = $hh['sig'] && $hh['sig']['id'] === $id ? $hh['sig'] : null;
        if ($sig) {
            // The Signature: stronger with every Mastery level, and named in the log as the hero's own.
            $mult *= (1 + 0.01 * $sig['mastery']) * 1.1 ** $sig['traits']['potent'];
            $this->emit('cast', $i, is_int($target) ? $target : -1, 0, ($sk[7] === 'ultimate' ? 1 : 0) | 2, ['name' => $hh['name']."'s ".($sig['name'] ?: $name)]);
        } elseif ($big) {
            $this->emit('cast', $i, is_int($target) ? $target : -1, 0, $sk[7] === 'ultimate' ? 1 : 0, ['name' => $name]);
        }

        switch ($type) {
            case 'strike':
                $this->hit($i, $target ?? $this->focusTarget($i), $mult, $school, ['threat' => $opts['threat'] ?? 1, 'fire' => !empty($opts['fire']), 'single' => true]);
                break;
            case 'aoe':
                foreach ($this->aliveEnemies() as $eid) {
                    $this->hit($i, $eid, $mult * ($this->ks($hh, 'shrapnel') ? 1.4 : 1), $school, ['threat' => $opts['threat'] ?? 1, 'fire' => !empty($opts['fire'])]);
                }
                break;
            case 'dot':
                if ($target && isset($this->e[$target])) {
                    $this->e[$target]['dots'][$i] = ['until' => $this->t + $dur, 'tick' => $this->powerOf($i, $school) * $mult / $dur];
                }
                break;
            case 'taunt':
                foreach ($this->aliveEnemies() as $eid) {
                    $top = max($this->e[$eid]['threat'] ?: [0]);
                    $this->e[$eid]['threat'][$i] = $top * 1.1 + 1;
                    $this->e[$eid]['taunt'] = $i;
                    $this->e[$eid]['tauntUntil'] = $this->t + 4;
                }
                break;
            case 'wall':
                $pct = min(0.7, $mult / $rankMult * ($this->ks($hh, 'ironWill') ? 1.3 : 1) * (1 + ($cmd - 1) * 0.5));
                $who = !empty($opts['party']) ? array_keys($this->h) : [$i];
                foreach ($who as $w) {
                    $this->h[$w]['walls'][] = [$pct, $this->t + $dur];
                }
                break;
            case 'shield':
                $amount = !empty($opts['ofHp']) ? $hh['s']['maxHp'] * $mult : $this->powerOf($i, 'spirit') * $mult;
                $amount *= ($this->ks($hh, 'ironWill') ? 1.3 : 1) * $cmd;
                $who = !empty($opts['party']) ? array_keys(array_filter($this->h, fn ($x) => !$x['dead'])) : [!empty($opts['self']) ? $i : ($target ?? $i)];
                foreach ($who as $w) {
                    $this->h[$w]['absorb'] += $amount;
                }
                $this->emit('shield', $i, count($who) > 1 ? -1 : $who[0], (int) $amount, 0);
                break;
            case 'heal':
                $this->heal($i, $target ?? $i, $this->powerOf($i, 'spirit') * $mult);
                break;
            case 'groupheal':
                foreach ($this->h as $w => $x) {
                    if (!$x['dead']) {
                        $this->heal($i, $w, $this->powerOf($i, 'spirit') * $mult);
                    }
                }
                break;
            case 'hot':
                $amount = !empty($opts['ofHp']) ? $hh['s']['maxHp'] * $mult : $this->powerOf($i, 'spirit') * $mult;
                $who = !empty($opts['party']) ? array_keys(array_filter($this->h, fn ($x) => !$x['dead'])) : [!empty($opts['self']) ? $i : ($target ?? $i)];
                foreach ($who as $w) {
                    $this->h[$w]['hots'][] = ['src' => $i, 'until' => $this->t + $dur, 'tick' => $amount / $dur];
                }
                break;
            case 'buff':
                $this->h[$i]['buffs'][] = [$mult / $rankMult * $rankMult, $this->t + $dur];
                break;
            case 'mark':
                if ($target && isset($this->e[$target])) {
                    $this->e[$target]['marks'][] = [$mult * $cmd, $this->t + $dur];
                    if (!empty($opts['slow'])) {
                        $this->e[$target]['slows'][] = [$opts['slow'], $this->t + $dur];
                    }
                    if ($this->ks($hh, 'teamPlayer')) {
                        foreach (array_keys($this->h) as $w) {
                            $this->h[$w]['buffs'][] = [0.05 * $cmd, $this->t + $dur];
                        }
                    }
                }
                break;
            case 'slow':
                foreach (!empty($opts['aoeMult']) ? $this->aliveEnemies() : [$target ?? $this->focusTarget($i)] as $eid) {
                    if ($eid && isset($this->e[$eid])) {
                        $this->e[$eid]['slows'][] = [min(0.6, $mult / $rankMult * $cmd), $this->t + $dur];
                        if (!empty($opts['aoeMult'])) {
                            $this->hit($i, $eid, $opts['aoeMult'] * $rankMult, $school, []);
                        }
                    }
                }
                break;
            case 'vanish':
                foreach ($this->e as $eid => $e) {
                    $this->e[$eid]['threat'][$i] = ($e['threat'][$i] ?? 0) * $mult;
                }
                break;
            case 'pet':
                $this->h[$i]['pets'][] = ['until' => $this->t + $dur, 'mult' => $mult, 'school' => $school];
                if ($this->h[$i]['role'] === 'healer') {
                    $this->h[$i]['hots'][] = ['src' => $i, 'until' => $this->t + $dur, 'tick' => 0];
                    foreach ($this->h as $w => $x) {
                        if (!$x['dead']) {
                            $this->h[$w]['hots'][] = ['src' => $i, 'until' => $this->t + $dur, 'tick' => $this->powerOf($i, 'spirit') * $mult * 0.6 / $dur];
                        }
                    }
                }
                break;
        }
    }

    private function powerOf(int $i, string $school): float
    {
        $h = $this->h[$i];
        $p = $h['s'][$school] ?? $h['s']['might'];
        if ($h['race'] === 'orc' && $h['hp'] < $h['s']['maxHp'] * 0.5 && $school !== 'spirit') {
            $p *= 1.1;
        }
        $buff = 0.0;
        foreach ($h['buffs'] as $b) {
            if ($b[1] > $this->t) {
                $buff += $b[0];
            }
        }

        return $p * (1 + $buff);
    }

    private function autoAttack(int $i): void
    {
        $h = $this->h[$i];
        $target = $this->focusTarget($i);
        $this->h[$i]['swing'] = $this->t + 2.0 / $h['s']['haste'];
        if ($target === null) {
            return;
        }
        $school = $h['role'] === 'healer' ? 'arcana' : $h['school'];
        $mult = $h['role'] === 'healer' ? 0.25 : 0.55;
        $this->hit($i, $target, $mult, $school, ['threat' => $h['role'] === 'tank' ? 6 : 1, 'auto' => true]);
    }

    private function focusTarget(int $i): ?int
    {
        $alive = $this->aliveEnemies();
        if (!$alive) {
            return null;
        }
        $h = $this->h[$i];
        // Tanks pick up whatever is loose; damage dealers kill shards and imps first, then the boss.
        if ($h['role'] === 'tank') {
            foreach ($alive as $eid) {
                if ($this->enemyTarget($eid) !== $i) {
                    return $eid;
                }
            }
        }
        $best = null;
        foreach ($alive as $eid) {
            $e = $this->e[$eid];
            if ($best === null || ($e['kind'] !== 'boss' && $this->e[$best]['kind'] === 'boss') || ($e['kind'] === $this->e[$best]['kind'] && $e['hp'] < $this->e[$best]['hp'])) {
                $best = $eid;
            }
        }

        return $best;
    }

    // ------------------------------------------------------------------ damage and healing

    private function hit(int $i, ?int $eid, float $mult, string $school, array $o): void
    {
        if ($eid === null || !isset($this->e[$eid]) || $this->e[$eid]['hp'] <= 0) {
            return;
        }
        $h = &$this->h[$i];
        $e = &$this->e[$eid];
        $dmg = $this->powerOf($i, $school) * $mult;
        if (!empty($o['single']) && $this->ks($h, 'shrapnel')) {
            $dmg *= 0.9;
        }
        $mark = 0.0;
        foreach ($e['marks'] as $mk) {
            if ($mk[1] > $this->t) {
                $mark = max($mark, $mk[0]);
            }
        }
        $dmg *= 1 + $mark;
        if ($h['passive'] === 'steadyAim') {
            $h['stack'] = $h['stackTarget'] === $eid ? min(10, $h['stack'] + 1) : 0;
            $h['stackTarget'] = $eid;
            $dmg *= 1 + 0.03 * $h['stack'];
        }
        if ($this->ks($h, 'executioner') && $e['hp'] < $e['max'] * 0.25) {
            $dmg *= 1.5;
        }
        $crit = $this->r->getFloat(0, 1) < $h['s']['crit'] || $h['forceCrit'];
        if ($e['kind'] === 'boss' && $h['firstBossHit']) {
            $crit = $crit || $h['origin'] === 'hawk' || $this->ks($h, 'patientHunter');
            $h['firstBossHit'] = false;
        }
        if ($e['kind'] !== 'boss' && $h['firstPackHit']) {
            $crit = $crit || $this->ks($h, 'patientHunter');
            $h['firstPackHit'] = false;
        }
        $h['forceCrit'] = false;
        $mega = false;
        if ($crit) {
            $mega = $this->r->getFloat(0, 1) < $h['s']['mega'];
            $dmg *= $mega ? 8 : $h['s']['critMult'];
            if ($h['passive'] === 'overcharge' && $h['s']['resource'] === 'mana') {
                $h['res'] = min($h['s']['resMax'], $h['res'] + $h['s']['resMax'] * 0.02);
            }
            if ($h['race'] === 'elf') {
                $h['res'] = min($h['s']['resMax'], $h['res'] + $h['s']['resMax'] * 0.015);
            }
        }
        if ($h['s']['resource'] === 'rage') {
            $h['res'] = min($h['s']['resMax'], $h['res'] + $h['s']['rageGain'] * 0.5);
        }
        $dmg = max(1, $dmg);
        $e['hp'] -= $dmg;
        $this->report[$i]['damage'] += $dmg;
        $threat = $dmg * ($o['threat'] ?? 1) * $h['s']['threat'] * ($h['role'] === 'tank' ? 2.0 : 1.0);
        if ($this->ks($h, 'provoker')) {
            $threat *= 1.5;
        }
        if ($this->ks($h, 'quietBlade')) {
            $threat *= 0.6;
        }
        $threat *= 1 - 0.2 * $this->res($h, 'shadow');
        $e['threat'][$i] = ($e['threat'][$i] ?? 0) + $threat;
        $this->emit('hit', $i, $eid, (int) round($dmg), ($crit ? 1 : 0) | ($mega ? 2 : 0) | (!empty($o['auto']) ? 4 : 0) | (!empty($o['pet']) ? 8 : 0));
        $frost = $this->res($h, 'frost');
        if ($frost) {
            $e['slows'][] = [0.03 * $frost, $this->t + 3];
        }
        $burn = ($crit && $h['origin'] === 'ember' && $school === 'arcana') ? 0.3 : 0.0;
        $burn += $crit ? 0.2 * $this->res($h, 'ember') : 0.0;
        if ($burn > 0) {
            $e['dots']['burn'.$i] = ['until' => $this->t + 4, 'tick' => $dmg * $burn / 4, 'src' => $i];
        }
        $bt = $this->ks($h, 'bloodthirst') && $crit ? $dmg * 0.05 : 0;
        $bc = $this->ks($h, 'battleCleric') && empty($o['auto']) ? $dmg * 0.5 : 0;
        // Lifesteal heals quietly: no event per hit, so the timeline stays small.
        if (($h['s']['lifesteal'] ?? 0) > 0 && !$h['dead']) {
            $ls = min($h['s']['maxHp'] - $h['hp'], $dmg * $h['s']['lifesteal'] * $h['s']['healRecv']);
            $h['hp'] += $ls;
            $this->report[$i]['healing'] += $ls;
        }
        unset($h, $e);
        if ($bt > 0) {
            $this->heal($i, $i, $bt, false);
        }
        if ($bc > 0) {
            $this->heal($i, $this->lowestAlly(), $bc, false);
        }
        $storm = $this->res($this->h[$i], 'storm');
        if ($crit && $storm && empty($o['chain'])) {
            foreach ($this->aliveEnemies() as $other) {
                if ($other !== $eid) {
                    $this->hit($i, $other, $mult * 0.3 * $storm, $school, ['chain' => true]);
                    break;
                }
            }
        }
        if ($mega && $this->power($this->h[$i], 'starfall') && empty($o['chain'])) {
            foreach ($this->aliveEnemies() as $other) {
                if ($other !== $eid) {
                    $this->hit($i, $other, $mult, $school, ['chain' => true]);
                }
            }
        }
        if (isset($this->e[$eid]) && $this->e[$eid]['hp'] <= 0) {
            $this->emit('kill', $i, $eid, 0, 0);
            $this->bolster($eid);
        }
    }

    private function heal(int $src, ?int $w, float $amount, bool $canCrit = true): void
    {
        if ($w === null || $this->h[$w]['dead']) {
            return;
        }
        $h = &$this->h[$src];
        $t = &$this->h[$w];
        if ($h['passive'] === 'seasons') {
            $amount *= 1 + 0.01 * (($this->t - $this->phaseStart) / 5);
        }
        $pct = $t['hp'] / $t['s']['maxHp'];
        if ($pct < 0.3) {
            $amount *= 1 + ($this->ks($h, 'guardianAngel') ? 0.4 : 0) + 0.2 * $this->res($h, 'light');
        }
        $crit = false;
        if ($canCrit) {
            $crit = $this->r->getFloat(0, 1) < $h['s']['crit'] || ($h['origin'] === 'lantern' && $h['firstHeal']);
            $h['firstHeal'] = false;
            if ($crit) {
                $amount *= $h['s']['critMult'];
            }
        }
        $amount *= $t['s']['healRecv'];
        $missing = $t['s']['maxHp'] - $t['hp'];
        $done = min($missing, $amount);
        $over = $amount - $done;
        $t['hp'] += $done;
        $this->report[$src]['healing'] += $done;
        $this->report[$src]['overheal'] += $over;
        $ks = $this->ks($h, 'overflow');
        $tide = $this->res($h, 'tide');
        $bloom = $this->power($h, 'everbloom') && $canCrit;
        unset($h, $t);
        if ($over > 0 && $ks) {
            $this->h[$w]['absorb'] += $over * 0.5;
        }
        if ($over > 0 && $tide) {
            $this->h[$this->lowestAlly() ?? $w]['absorb'] += $over * 0.2 * $tide;
        }
        if ($bloom) {
            $this->h[$w]['hots'][] = ['src' => $src, 'until' => $this->t + 6, 'tick' => $amount * 0.3 / 6];
        }
        foreach ($this->aliveEnemies() as $eid) {
            $this->e[$eid]['threat'][$src] = ($this->e[$eid]['threat'][$src] ?? 0) + $done * 0.3 / max(1, count($this->e));
        }
        if ($done > 0 || $crit) {
            $this->emit('heal', $src, $w, (int) round($done), $crit ? 1 : 0);
        }
    }

    private function damageHero(int $i, float $raw, array $o): void
    {
        $h = &$this->h[$i];
        if ($h['dead']) {
            return;
        }
        $s = $h['s'];
        $what = $o['what'] ?? 'an attack';
        if (!empty($o['melee']) && $this->r->getFloat(0, 1) < $s['dodge']) {
            $this->emit('dodge', -1, $i, 0, 0);
            if ($h['origin'] === 'fox') {
                $h['forceCrit'] = true;
            }
            if (!empty($o['big'])) {
                $this->report[$i]['mechanics']['busterDodged'] = ($this->report[$i]['mechanics']['busterDodged'] ?? 0) + 1;
            }

            return;
        }
        $dmg = $raw;
        $blocked = false;
        if (!empty($o['melee']) && $this->r->getFloat(0, 1) < $s['block']) {
            $dmg *= 0.5;
            $blocked = true;
            if (!empty($o['big'])) {
                $this->report[$i]['mechanics']['busterBlocked'] = ($this->report[$i]['mechanics']['busterBlocked'] ?? 0) + 1;
            }
        }
        $dmg *= (1 - $s['dr'] * (!empty($o['magic']) ? 0.5 : 1)) * ($s['taken'] ?? 1);
        $wall = 0.0;
        $h['walls'] = array_values(array_filter($h['walls'], fn ($w) => $w[1] > $this->t));
        foreach ($h['walls'] as $w) {
            $wall = max($wall, $w[0]);
        }
        $dmg *= 1 - $wall;
        if (!empty($o['fire']) && $h['race'] === 'draka') {
            $dmg *= 0.5;
        }
        foreach ($this->h as $x) {
            if (!$x['dead'] && $x['role'] === 'tank' && $this->ks($x, 'rallyingWall')) {
                $dmg *= 0.95;
                break;
            }
        }
        $absorbed = min($h['absorb'], $dmg);
        $h['absorb'] -= $absorbed;
        $dmg -= $absorbed;
        $h['hp'] -= $dmg;
        $this->report[$i]['taken'] += $dmg + $absorbed;
        $this->report[$i]['absorbed'] += $absorbed;
        if ($s['resource'] === 'rage') {
            $h['res'] = min($s['resMax'], $h['res'] + $s['rageGain']);
        }
        $this->emit('hurt', $o['src'] ?? -1, $i, (int) round($dmg + $absorbed), ($blocked ? 1 : 0) | (!empty($o['big']) ? 2 : 0) | (!empty($o['fire']) ? 4 : 0));
        $thorn = $this->res($h, 'thorn');
        $spiked = $blocked && $this->ks($h, 'spikedGuard');
        $stone = $blocked ? $this->res($h, 'stone') : 0;
        if ($h['role'] === 'tank' && $this->ks($h, 'secondWind') && !$h['secondWind'] && $h['hp'] > 0 && $h['hp'] < $s['maxHp'] * 0.3) {
            $h['secondWind'] = true;
            $h['absorb'] += $s['maxHp'] * 0.2;
        }
        if ($h['hp'] <= 0) {
            $this->onLethal($i, $what);
        }
        unset($h);
        $src = $o['src'] ?? null;
        if ($src && isset($this->e[$src]) && !empty($o['melee']) && ($thorn || $spiked)) {
            $this->hit($i, $src, 0.15 * $thorn + ($spiked ? 0.4 : 0), $this->h[$i]['school'], ['chain' => true]);
        }
        if ($stone && ($low = $this->lowestAlly()) !== null) {
            $this->h[$low]['absorb'] += $this->h[$low]['s']['maxHp'] * 0.04 * $stone;
        }
    }

    private function onLethal(int $i, string $what): void
    {
        $h = &$this->h[$i];
        if ($h['race'] === 'felkin' && !$h['nineLives']) {
            $h['nineLives'] = true;
            $h['hp'] = 1;
            $this->emit('mech', -1, $i, 0, 1, ['name' => 'Nine Lives']);

            return;
        }
        foreach ($this->h as $k => $x) {
            if (!$x['dead'] && $k !== $i && $x['passive'] === 'lastRite' && !$this->h[$k]['lastRite']) {
                $this->h[$k]['lastRite'] = true;
                $h['hp'] = $h['s']['maxHp'] * 0.2;
                $this->emit('mech', $k, $i, 0, 1, ['name' => 'Last Rite']);

                return;
            }
        }
        if ($this->power($h, 'phoenixRite') && !$h['phoenix']) {
            $h['phoenix'] = true;
            $h['hp'] = $h['s']['maxHp'] * 0.5;
            $this->emit('mech', -1, $i, 0, 1, ['name' => 'Phoenix Rite']);

            return;
        }
        $h['dead'] = true;
        $h['hp'] = 0;
        $h['hots'] = [];
        $h['absorb'] = 0;
        $this->report[$i]['deaths']++;
        $pulled = false;
        if ($h['role'] !== 'tank') {
            foreach ($this->e as $e) {
                if ($e['hp'] > 0 && $this->enemyTarget($e['id']) === $i && $e['kind'] === 'boss') {
                    foreach ($this->h as $x) {
                        if ($x['role'] === 'tank' && !$x['dead']) {
                            $pulled = true;
                        }
                    }
                }
            }
        }
        $this->lastDeath[] = ['i' => $i, 'role' => $h['role'], 'what' => $what, 't' => $this->t, 'clear' => $this->clear, 'pulled' => $pulled, 'phase' => $this->phase];
        $this->emit('death', -1, $i, 0, 0, ['what' => $what]);
    }

    private function tickHots(): void
    {
        foreach ($this->h as $w => $x) {
            if ($x['dead']) {
                continue;
            }
            if ($x['curse'] && $x['curse']['until'] > $this->t) {
                $this->h[$w]['hp'] -= $x['curse']['dps'];
                $this->report[$w]['taken'] += $x['curse']['dps'];
                if ($this->h[$w]['hp'] <= 0) {
                    $this->onLethal($w, $this->mechName('curse'));
                }
            }
            $hots = array_values(array_filter($this->h[$w]['hots'], fn ($o) => $o['until'] > $this->t));
            $this->h[$w]['hots'] = $hots;
            foreach ($hots as $o) {
                if ($o['tick'] > 0 && !$this->h[$o['src']]['dead']) {
                    $this->heal($o['src'], $w, $o['tick'], false);
                }
            }
        }
    }

    private function tickDots(): void
    {
        foreach ($this->e as $eid => $e) {
            if ($e['hp'] <= 0) {
                continue;
            }
            foreach ($e['dots'] as $k => $d) {
                if ($d['until'] < $this->t) {
                    unset($this->e[$eid]['dots'][$k]);
                    continue;
                }
                $src = $d['src'] ?? $k;
                $this->e[$eid]['hp'] -= $d['tick'];
                $this->report[$src]['damage'] += $d['tick'];
                $this->e[$eid]['threat'][$src] = ($this->e[$eid]['threat'][$src] ?? 0) + $d['tick'];
                $this->emit('hit', $src, $eid, (int) round($d['tick']), 16);
            }
        }
    }

    // ------------------------------------------------------------------ helpers

    private function enemyTarget(int $eid): ?int
    {
        $e = $this->e[$eid];
        if ($e['taunt'] !== null && $e['tauntUntil'] > $this->t && !$this->h[$e['taunt']]['dead']) {
            return $e['taunt'];
        }
        $best = null;
        $top = -1.0;
        foreach ($e['threat'] as $i => $v) {
            if (!$this->h[$i]['dead'] && $v > $top) {
                $top = $v;
                $best = $i;
            }
        }

        return $best;
    }

    private function closeToPulling(int $i, int $eid): bool
    {
        $e = $this->e[$eid];
        $mine = $e['threat'][$i] ?? 0;
        foreach ($this->h as $k => $x) {
            if ($x['role'] === 'tank' && !$x['dead']) {
                return $mine > 0.9 * ($e['threat'][$k] ?? 0);
            }
        }

        return false;
    }

    private function aliveEnemies(): array
    {
        $out = [];
        foreach ($this->e as $id => $e) {
            if ($e['hp'] > 0) {
                $out[] = $id;
            }
        }

        return $out;
    }

    private function aliveHeroes(): array
    {
        return array_keys(array_filter($this->h, fn ($h) => !$h['dead']));
    }

    private function lowestAlly(): ?int
    {
        $best = null;
        foreach ($this->h as $i => $h) {
            if (!$h['dead'] && ($best === null || $h['hp'] / $h['s']['maxHp'] < $this->h[$best]['hp'] / $this->h[$best]['s']['maxHp'])) {
                $best = $i;
            }
        }

        return $best;
    }

    /** Timeline row: [time x10, type, source, target, amount, flags, extra?] */
    private function emit(string $type, int $src, int $dst, int $amount, int $flags, ?array $extra = null): void
    {
        $row = [(int) round($this->t * 10), $type, $src, $dst, $amount, $flags];
        if ($extra) {
            $row[] = $extra;
        }
        $this->ev[] = $row;
    }

    private function explain(): string
    {
        $w = $this->wipe;
        $clock = sprintf('%d:%02d', (int) ($w['t'] / 60), (int) $w['t'] % 60);
        $where = fn (int $c) => $this->d['plan'][$c][0] === 'boss' ? 'the '.Dungeons::label($this->d, $c) : 'a '.strtolower(Dungeons::label($this->d, $c)).' in wing '.($this->d['plan'][$c][2] + 1);
        $at = sprintf('%s at %s', $where($w['clear']), $clock);
        $name = fn ($i) => $this->h[$i]['name'];
        if (!empty($w['timeout'])) {
            return "The fight against $at ran too long: the group couldn't finish it.";
        }
        if ($w['enraged']) {
            return 'The '.Dungeons::label($this->d, $w['clear']).' enraged at '.$clock.": the group's damage was too low to kill it in time.";
        }
        foreach ($this->oomAt as $i => $o) {
            if ($this->h[$i]['role'] === 'healer' && $o['clear'] === $w['clear']) {
                return $name($i).' ran out of mana against '.$where($o['clear']).': more Wisdom or a mana affix would keep the heals going.';
            }
        }
        foreach ($this->lastDeath as $d) {
            if ($d['clear'] !== $w['clear']) {
                continue;
            }
            if ($d['pulled']) {
                return $name($d['i']).' pulled threat from the tank and died to '.$d['what'].' against '.$at.'.';
            }
            if ($d['role'] === 'tank') {
                return $name($d['i']).' (tank) died to '.$d['what'].' against '.$at.': more Vitality, Guard or a wall before the big hits.';
            }
            if ($d['role'] === 'healer') {
                return $name($d['i']).' (healer) died to '.$d['what'].' against '.$at.', and nobody could keep the group up after that.';
            }
        }
        $d = $this->lastDeath[0] ?? null;

        return $d ? $name($d['i']).' died first, to '.$d['what'].", and the group fell apart against $at." : "The group wiped against $at.";
    }
}

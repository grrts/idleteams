<?php

namespace App\Service;

use App\Entity\Guild;
use App\Entity\Hero;
use App\Entity\Raid;
use App\Game\Items;
use App\Game\Modes;
use App\Game\Raids;
use App\Game\Simulator;
use Doctrine\ORM\EntityManagerInterface;
use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * The raid planner and the raid itself. Officers plan a night, members sign up, officers put them into squads and
 * fronts (or fill them automatically) and start it. Each squad fights its front; squads that take their front fight
 * the king. One raid per guild per week; every raider is paid and may find an item.
 */
class RaidActions
{
    public function __construct(private EntityManagerInterface $em, private Game $game)
    {
    }

    /** The guild's raid this week: one being planned, or the one fought. */
    public function current(Guild $g): ?Raid
    {
        return $this->em->getRepository(Raid::class)->findOneBy(['guild' => $g, 'week' => Modes::week(time())], ['id' => 'DESC']);
    }

    public function plan(Hero $h, string $raidId, int $startsAt): Raid
    {
        $g = $this->officer($h);
        Raids::get($raidId) ?? throw new GameError('No such raid.');
        if ($this->current($g)) {
            throw new GameError('Your guild already has a raid this week. A new one can be planned from Monday.');
        }
        $r = new Raid();
        $r->guild = $g;
        $r->raid = $raidId;
        $r->startsAt = max(time(), $startsAt);
        $r->week = Modes::week(time());
        $r->createdAt = time();
        $this->em->persist($r);
        $this->game->post('guild:'.$g->id, sprintf('%s planned a raid on %s. Sign up on the guild page.', $h->name, Raids::get($raidId)['name']));

        return $r;
    }

    public function signup(Hero $h, Raid $r, bool $on): void
    {
        $this->open($h, $r);
        if ($on && $h->level < Raids::get($r->raid)['level']) {
            throw new GameError(sprintf('The raid needs level %d.', Raids::get($r->raid)['level']));
        }
        $s = $r->signups;
        if ($on) {
            $s[(string) $h->id] = $h->role();
        } else {
            unset($s[(string) $h->id]);
            $r->squads = array_map(fn ($sq) => array_values(array_diff($sq, [$h->id])), $r->squads);
        }
        $r->signups = $s;
    }

    /**
     * The planner: squads of signed-up heroes and the front for each.
     *
     * @param list<list<int>> $squads
     * @param list<int>       $fronts
     */
    public function arrange(Hero $h, Raid $r, array $squads, array $fronts): void
    {
        $this->officer($h);
        $this->open($h, $r);
        $raid = Raids::get($r->raid);
        if (count($squads) > Raids::SQUADS) {
            throw new GameError('At most '.Raids::SQUADS.' squads.');
        }
        $seen = [];
        foreach ($squads as $k => $sq) {
            if (count($sq) > Raids::SQUAD_SIZE) {
                throw new GameError('A squad holds '.Raids::SQUAD_SIZE.' heroes.');
            }
            foreach ($sq as $id) {
                if (!isset($r->signups[(string) $id]) || isset($seen[$id])) {
                    throw new GameError('Put each signed-up hero in one squad.');
                }
                $seen[$id] = true;
            }
            $f = $fronts[$k] ?? 0;
            if (!is_int($f) || !isset($raid['fronts'][$f])) {
                throw new GameError('Pick a front for every squad.');
            }
        }
        $r->squads = array_map(fn ($sq) => array_map('intval', array_values($sq)), array_values($squads));
        $r->fronts = array_map('intval', array_slice(array_values($fronts), 0, count($squads)));
    }

    public function autoFill(Hero $h, Raid $r): void
    {
        $this->officer($h);
        $this->open($h, $r);
        $fill = Raids::autoFill($r->signups, count(Raids::get($r->raid)['fronts']));
        $r->squads = $fill['squads'];
        $r->fronts = $fill['fronts'];
    }

    public function cancel(Hero $h, Raid $r): void
    {
        $this->officer($h);
        $this->open($h, $r);
        $this->em->remove($r);
    }

    /** Fights the raid: every squad on its front, then the throne. */
    public function start(Hero $h, Raid $r): void
    {
        $g = $this->officer($h);
        $this->open($h, $r);
        $raid = Raids::get($r->raid);
        $squads = [];
        foreach ($r->squads as $k => $ids) {
            $heroes = array_values(array_filter(array_map(fn ($id) => $this->em->find(Hero::class, $id), $ids), fn ($x) => $x && $x->guild === $g));
            if ($heroes) {
                $squads[$k] = $heroes;
            }
        }
        if (count($squads) < 2) {
            throw new GameError('A raid needs at least two squads.');
        }
        $all = array_merge(...array_values($squads));
        $level = Raids::level($raid, array_map(fn (Hero $x) => $x->level, $all));
        $seed = random_int(1, 2_000_000_000);
        $report = ['raid' => $raid['name'], 'level' => $level, 'fronts' => [], 'final' => null, 'won' => false, 'rewards' => []];
        foreach ($raid['fronts'] as $f => $front) {
            $report['fronts'][$f] = ['name' => $front['name'], 'taken' => false, 'squads' => []];
        }
        $finalists = [];
        foreach ($squads as $k => $heroes) {
            $f = $r->fronts[$k] ?? 0;
            $res = $this->fight($heroes, $level, $seed + $k, $raid['fronts'][$f], Raids::mods($raid));
            $report['fronts'][$f]['squads'][] = $res + ['squad' => $k];
            if (!$res['wiped']) {
                $report['fronts'][$f]['taken'] = true;
                $finalists[$k] = $heroes;
            }
        }
        $taken = count(array_filter($report['fronts'], fn ($x) => $x['taken']));
        $clears = 0;
        if ($taken >= Raids::FRONTS_NEEDED) {
            $lost = count($raid['fronts']) - $taken;
            $report['final'] = ['name' => $raid['final']['name'], 'lost' => $lost, 'squads' => []];
            foreach ($finalists as $k => $heroes) {
                $res = $this->fight($heroes, $level, $seed + 100 + $k, $raid['final'], Raids::mods($raid, $lost));
                $report['final']['squads'][] = $res + ['squad' => $k];
                $clears += $res['wiped'] ? 0 : 1;
            }
            $report['won'] = Raids::won(count($finalists), $clears);
        }
        $report['rewards'] = $this->reward($g, $all, $level, $report['won'], $taken, $seed);
        $r->report = $report;
        $r->state = 'done';
        if ($report['won']) {
            $g->xp += 200;
            $t = ($g->trophies ?? []) + ['heroic' => 0, 'bosses' => 0, 'goals' => 0, 'bestMythic' => null];
            $t['raids'] = ($t['raids'] ?? 0) + 1;
            $g->trophies = $t;
        }
        $this->game->post('guild:'.$g->id, $report['won']
            ? sprintf('%s has fallen! %d heroes took %d of %d fronts and brought down %s.', $raid['name'], count($all), $taken, count($raid['fronts']), $raid['final']['bosses']['king']['name'] ?? 'the king')
            : sprintf('The raid on %s failed: %d of %d fronts taken%s.', $raid['name'], $taken, count($raid['fronts']), $report['final'] ? ', but the throne held' : ''));
    }

    /** One squad through one front (or the throne): the summary the planner shows. */
    private function fight(array $heroes, int $level, int $seed, array $dungeon, array $mods): array
    {
        $combatants = $this->game->lineUp($heroes, $level);
        $res = (new Simulator())->run($combatants, $level, $seed, $dungeon, $mods)['report'];
        $top = $res['heroes'];
        usort($top, fn ($a, $b) => $b['damage'] <=> $a['damage']);

        return [
            'heroes' => array_map(fn (Hero $x) => ['id' => $x->id, 'name' => $x->name, 'cls' => $x->cls, 'role' => $x->role()], $heroes),
            'wiped' => $res['wiped'], 'bossesKilled' => $res['bossesKilled'], 'encountersDone' => $res['encountersDone'], 'cause' => $res['cause'],
            'length' => $res['length'], 'top' => $top[0]['name'] ?? null, 'damage' => array_sum(array_column($res['heroes'], 'damage')),
        ];
    }

    /** Every raider is paid once a week; a won raid pays more and drops more. Items go straight to the bags. */
    private function reward(Guild $g, array $heroes, int $level, bool $won, int $taken, int $seed): array
    {
        $rand = new Randomizer(new Mt19937($seed ^ 0x2c1b3c6d));
        $out = [];
        foreach ($heroes as $h) {
            $c = $h->career;
            if (($c['raidWeek'] ?? -1) === Modes::week(time())) {
                $out[] = ['hero' => $h->name, 'repeat' => true];
                continue;
            }
            $c['raidWeek'] = Modes::week(time());
            $c['raids'] = ($c['raids'] ?? 0) + 1;
            $c['raidWins'] = ($c['raidWins'] ?? 0) + ($won ? 1 : 0);
            $h->career = $c;
            $units = 4 + 2 * $taken + ($won ? 10 : 0);
            $gold = (int) round(5 * 1.045 ** (2 * $level) * $units);
            $mats = (int) round((3 + 0.5 * $units) * (1 + $level / 10));
            $h->gold = (string) ((int) $h->gold + $gold);
            $h->materials += $mats;
            $row = ['hero' => $h->name, 'gold' => $gold, 'materials' => $mats, 'item' => null];
            if ($rand->getFloat(0, 1) < ($won ? 0.8 : 0.25 + 0.1 * $taken)) {
                $item = Items::fromSpec(Items::generate($rand, 2 * $level + ($won ? 16 : 8), Items::rollRarity($rand, $won ? 0.25 : 0.1), null, null, [], \App\Game\Seasons::current()['id'] ?? null));
                $item->owner = $h;
                $item->createdAt = time();
                $this->em->persist($item);
                $row['item'] = Items::name(Items::spec($item)).' ('.$item->rarity.')';
            }
            $out[] = $row;
        }

        return $out;
    }

    private function officer(Hero $h): Guild
    {
        $g = $h->guild ?? throw new GameError('You are not in a guild.');
        if ($h->guildRank === 'member') {
            throw new GameError('Only the leader and officers plan and start raids.');
        }

        return $g;
    }

    private function open(Hero $h, Raid $r): void
    {
        if ($r->guild !== $h->guild) {
            throw new GameError('That raid belongs to another guild.');
        }
        if ($r->state !== 'planning') {
            throw new GameError('That raid has been fought.');
        }
    }
}

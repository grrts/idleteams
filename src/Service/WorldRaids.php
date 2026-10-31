<?php

namespace App\Service;

use App\Entity\Hero;
use App\Entity\Party;
use App\Entity\WorldRaid;
use App\Game\Items;
use App\Game\Modes;
use App\Game\Raids;
use App\Game\Seasons;
use App\Game\Simulator;
use Doctrine\ORM\EntityManagerInterface;
use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * The season's world raid: once a week (the season file says which day and hour, UTC), up to fifty groups meet one
 * boss at the same time. Each group fights it as a squad; what each squad takes off is added up, and the boss falls if
 * the squads together take off `needed` of a boss each on average. No single group can do it alone, and every group
 * that came is paid, more on a win. The cron tick (app:tick) fights it when it is due.
 */
class WorldRaids
{
    public function __construct(private EntityManagerInterface $em, private Game $game, private Notifier $notifier)
    {
    }

    /** This week's world raid of the running season, made on first ask; null when no season has one. */
    public function current(?int $now = null): ?WorldRaid
    {
        $now ??= time();
        $s = Seasons::current($now);
        if (!$s || !$s['worldRaid']) {
            return null;
        }
        $week = Modes::week($now);
        $r = $this->em->getRepository(WorldRaid::class)->findOneBy(['season' => $s['id'], 'week' => $week]);
        if (!$r) {
            $r = new WorldRaid();
            $r->season = $s['id'];
            $r->week = $week;
            $r->startsAt = self::startsAt($s['worldRaid'], $week);
            $this->em->persist($r);
            // made at once, so a second ask in the same request finds it
            $this->em->flush();
        }

        return $r;
    }

    public static function startsAt(array $w, int $week): int
    {
        return 345600 + 604800 * $week + 86400 * ($w['day'] - 1) + 3600 * $w['hour'];
    }

    public static function def(WorldRaid $r): array
    {
        return Seasons::get($r->season)['worldRaid'] ?? throw new \RuntimeException('No world raid in season '.$r->season);
    }

    /** The group leader signs the whole group up as one squad. */
    public function signup(Hero $h, ?int $now = null): WorldRaid
    {
        $now ??= time();
        $r = $this->current($now) ?? throw new GameError('There is no world raid this season.');
        $w = self::def($r);
        $p = $h->party ?? throw new GameError('Join a group first: the world raid takes whole groups.');
        if ($p->leader !== $h) {
            throw new GameError('The group leader signs the group up.');
        }
        if ($r->state !== 'open' || $now >= $r->startsAt) {
            throw new GameError('This week\'s world raid has started. Sign up for next week\'s from Monday.');
        }
        if (isset($r->squads[(string) $p->id])) {
            throw new GameError('Your group is signed up.');
        }
        if (count($r->squads) >= $w['squads']) {
            throw new GameError(sprintf('All %d places are taken this week.', $w['squads']));
        }
        $members = $p->members->toArray();
        if (count($members) < 3) {
            throw new GameError('A squad needs at least three heroes.');
        }
        foreach ($members as $m) {
            if ($m->level < $w['level']) {
                throw new GameError(sprintf('%s is below level %d.', $m->name, $w['level']));
            }
        }
        $sq = $r->squads;
        $sq[(string) $p->id] = array_map(fn (Hero $m) => $m->id, $members);
        $r->squads = $sq;
        $this->game->post('party:'.$p->id, sprintf('%s signed the group up for %s.', $h->name, $w['name']));

        return $r;
    }

    public function leave(Hero $h, ?int $now = null): void
    {
        $r = $this->current($now) ?? throw new GameError('There is no world raid this season.');
        $p = $h->party;
        if (!$p || $p->leader !== $h || !isset($r->squads[(string) $p->id])) {
            throw new GameError('Your group is not signed up.');
        }
        if ($r->state !== 'open') {
            throw new GameError('It has been fought.');
        }
        $sq = $r->squads;
        unset($sq[(string) $p->id]);
        $r->squads = $sq;
    }

    /** Fights every world raid that is due. Returns how many were fought. */
    public function due(?int $now = null): int
    {
        $now ??= time();
        $n = 0;
        foreach ($this->em->createQuery('SELECT r FROM App\Entity\WorldRaid r WHERE r.state = :s AND r.startsAt <= :t')->setParameters(['s' => 'open', 't' => $now])->getResult() as $r) {
            $this->fight($r, $now);
            ++$n;
        }

        return $n;
    }

    public function fight(WorldRaid $r, ?int $now = null): void
    {
        $now ??= time();
        $w = self::def($r);
        $squads = [];
        foreach ($r->squads as $pid => $ids) {
            $heroes = array_values(array_filter(array_map(fn ($id) => $this->em->find(Hero::class, $id), $ids), fn ($x) => $x && $x->level >= $w['level']));
            if ($heroes) {
                $squads[(int) $pid] = $heroes;
            }
        }
        $r->state = 'done';
        $all = $squads ? array_merge(...array_values($squads)) : [];
        $level = Raids::level($w, array_map(fn (Hero $x) => $x->level, $all));
        $seed = random_int(1, 2_000_000_000);
        $rows = [];
        $total = 0.0;
        foreach ($squads as $pid => $heroes) {
            $res = (new Simulator())->run($this->game->lineUp($heroes, $level), $level, $seed + $pid, $w['fight'], ['pack' => [1.0, 1.0], 'boss' => [(float) $w['health'], (float) $w['damage']], 'affixes' => []])['report'];
            $top = $res['heroes'];
            usort($top, fn ($a, $b) => $b['damage'] <=> $a['damage']);
            $party = $this->em->find(Party::class, $pid);
            $rows[] = ['party' => $party?->name ?? 'A group', 'heroes' => array_map(fn (Hero $x) => $x->name, $heroes), 'share' => $res['bossShare'], 'damage' => array_sum(array_column($res['heroes'], 'damage')), 'top' => $top[0]['name'] ?? null];
            $total += $res['bossShare'];
        }
        usort($rows, fn ($a, $b) => $b['share'] <=> $a['share']);
        $needed = round($w['needed'] * count($squads), 2);
        $won = count($squads) >= 2 && $total >= $needed;
        $r->report = ['name' => $w['name'], 'level' => $level, 'squads' => $rows, 'heroes' => count($all), 'total' => round($total, 2), 'needed' => $needed, 'won' => $won, 'at' => $now];
        $this->reward($r, $all, $level, $won, $seed, $now);
        $this->game->post('tavern', count($squads) === 0 ? sprintf('%s walked the field and nobody came.', $w['name'])
            : ($won ? sprintf('%s has fallen! %d heroes in %d groups brought it down.', $w['name'], count($all), count($squads))
                : sprintf('%s walked away with %d%% of its strength left. %d heroes in %d groups fought it.', $w['name'], (int) round(100 * max(0, 1 - $total / max(0.01, $needed))), count($all), count($squads))));
    }

    /** Everyone who came: gold, materials and track points; on a win also the season's world raid look and a chance at an item. */
    private function reward(WorldRaid $r, array $heroes, int $level, bool $won, int $seed, int $now): void
    {
        $w = self::def($r);
        $rand = new Randomizer(new Mt19937($seed ^ 0x4f1bbcdc));
        foreach ($heroes as $h) {
            $units = $won ? 18 : 8;
            $h->gold = (string) ((int) $h->gold + (int) round(5 * 1.045 ** (2 * $level) * $units));
            $h->materials += (int) round((3 + 0.5 * $units) * (1 + $level / 10));
            $this->game->trackPoints($h->user, $won ? 80 : 40, $now);
            $item = null;
            if ($won && $w['reward']) {
                (new Roster($this->em))->grant($h->user, [$w['reward']]);
            }
            if ($rand->getFloat(0, 1) < ($won ? 0.6 : 0.2)) {
                $i = Items::fromSpec(Items::generate($rand, 2 * $level + ($won ? 16 : 8), Items::rollRarity($rand, $won ? 0.2 : 0.08), null, null, [], $r->season));
                $i->owner = $h;
                $i->createdAt = $now;
                $this->em->persist($i);
                $item = Items::name(Items::spec($i));
            }
            $this->notifier->notify($h, 'world', $won ? $w['name'].' has fallen' : $w['name'].' walked away', ($won ? 'You were there. ' : 'Better luck next week. ').($item ? 'You found '.$item.'.' : 'Gold and materials are in your bags.'), '#/group');
        }
    }
}

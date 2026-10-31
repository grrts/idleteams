<?php

namespace App\Service;

use App\Entity\Guild;
use App\Entity\Hero;
use App\Entity\Item;
use App\Game\GuildHall;
use App\Game\Items;
use Doctrine\ORM\EntityManagerInterface;

/** The guild hall: the bank, the notice board and ranks. Weekly goals fill from runs in Game::finish. */
class GuildActions
{
    public function __construct(private EntityManagerInterface $em, private Game $game)
    {
    }

    public function deposit(Hero $h, Item $i): void
    {
        $g = $this->guild($h);
        if ($i->owner !== $h) {
            throw new GameError('That is not yours.');
        }
        if ($this->bankItems($g) >= GuildHall::bankSize(GuildHall::level($g->xp))) {
            throw new GameError('The bank is full. It grows with the guild\'s level.');
        }
        $i->equipped = null;
        $i->price = null;
        $i->owner = null;
        $i->bank = $g;
        $this->log($g, $h, 'in', Items::name(Items::spec($i)));
    }

    public function withdraw(Hero $h, Item $i): void
    {
        $g = $this->guild($h);
        if ($i->bank !== $g) {
            throw new GameError('That is not in your guild\'s bank.');
        }
        if ($h->guildRank === 'member' && $this->takenToday($g, $h) >= GuildHall::MEMBER_WITHDRAWALS) {
            throw new GameError(sprintf('Members may take %d items a day; officers and the leader have no limit.', GuildHall::MEMBER_WITHDRAWALS));
        }
        $i->bank = null;
        $i->owner = $h;
        $this->log($g, $h, 'out', Items::name(Items::spec($i)));
    }

    public function depositGold(Hero $h, int $gold): void
    {
        $g = $this->guild($h);
        if ($gold < 1 || (int) $h->gold < $gold) {
            throw new GameError('You do not have that much gold.');
        }
        $h->gold = (string) ((int) $h->gold - $gold);
        $g->bankGold = (string) ((int) $g->bankGold + $gold);
        $this->log($g, $h, 'goldIn', (string) $gold);
    }

    public function withdrawGold(Hero $h, int $gold): void
    {
        $g = $this->guild($h);
        $this->officer($h);
        if ($gold < 1 || (int) $g->bankGold < $gold) {
            throw new GameError('The bank does not hold that much gold.');
        }
        $g->bankGold = (string) ((int) $g->bankGold - $gold);
        $h->gold = (string) ((int) $h->gold + $gold);
        $this->log($g, $h, 'goldOut', (string) $gold);
    }

    public function notice(Hero $h, string $text): void
    {
        $g = $this->guild($h);
        $this->officer($h);
        if (!in_array('notice', GuildHall::opened(GuildHall::level($g->xp)), true)) {
            throw new GameError('The notice board opens at guild level 2.');
        }
        $g->notice = mb_substr(trim($text), 0, 400);
    }

    /** The leader names officers, steps them back down, or hands over the lead. */
    public function rank(Hero $leader, Hero $who, string $rank): void
    {
        $g = $this->guild($leader);
        if ($leader->guildRank !== 'leader') {
            throw new GameError('Only the leader changes ranks.');
        }
        if ($who->guild !== $g || $who === $leader) {
            throw new GameError('Pick another member of your guild.');
        }
        if (!in_array($rank, GuildHall::RANKS, true)) {
            throw new GameError('Ranks are leader, officer and member.');
        }
        $who->guildRank = $rank;
        if ($rank === 'leader') {
            $leader->guildRank = 'officer';
        }
        $this->game->post('guild:'.$g->id, sprintf('%s is now %s.', $who->name, $rank === 'leader' ? 'the guild leader' : 'a'.($rank === 'officer' ? 'n officer' : ' member')));
    }

    /** @return Item[] */
    public function bank(Guild $g): array
    {
        return $this->em->getRepository(Item::class)->findBy(['bank' => $g], ['id' => 'DESC']);
    }

    /** When the last member leaves, the bank goes with them rather than vanishing. */
    public function emptyInto(Guild $g, Hero $h): void
    {
        foreach ($this->bank($g) as $i) {
            $i->bank = null;
            $i->owner = $h;
        }
        $h->gold = (string) ((int) $h->gold + (int) $g->bankGold);
        $g->bankGold = '0';
    }

    private function bankItems(Guild $g): int
    {
        return $this->em->getRepository(Item::class)->count(['bank' => $g]);
    }

    private function takenToday(Guild $g, Hero $h): int
    {
        $since = time() - 86400;

        return count(array_filter($g->bankLog ?? [], fn ($e) => $e[0] >= $since && $e[2] === $h->id && $e[3] === 'out'));
    }

    private function log(Guild $g, Hero $h, string $what, string $detail): void
    {
        $g->bankLog = array_slice([[time(), $h->name, $h->id, $what, $detail], ...($g->bankLog ?? [])], 0, GuildHall::LOG_SIZE);
    }

    private function guild(Hero $h): Guild
    {
        return $h->guild ?? throw new GameError('You are not in a guild.');
    }

    private function officer(Hero $h): void
    {
        if ($h->guildRank === 'member') {
            throw new GameError('Only the leader and officers can do that.');
        }
    }
}

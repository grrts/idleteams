<?php

namespace App\Service;

use App\Entity\Battle;
use App\Entity\ChatMessage;
use App\Entity\Guild;
use App\Entity\Hero;
use App\Entity\Party;
use App\Entity\PartyRequest;
use App\Entity\TavernPost;
use App\Game\Dungeons;
use App\Game\Modes;
use App\Game\Rules;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Groups of five real players, the tavern board, guilds and chat. Nothing here needs both sides online:
 * invites and applications wait until the other player opens the game. Demo heroes answer right away.
 */
class Social
{
    public function __construct(private EntityManagerInterface $em, private Game $game, private Notifier $notifier)
    {
    }

    // ------------------------------------------------------------------ groups

    public function createParty(Hero $h, string $name): Party
    {
        if ($h->party) {
            throw new GameError('Leave your group first.');
        }
        $name = trim($name) ?: $h->name."'s group";
        $p = new Party();
        $p->name = mb_substr($name, 0, 40);
        $p->leader = $h;
        $p->createdAt = time();
        $this->em->persist($p);
        $this->em->flush();
        $this->join($h, $p, false);

        return $p;
    }

    private function join(Hero $h, Party $p, bool $answered = true): void
    {
        if ($p->members->count() >= Party::SIZE) {
            throw new GameError('That group is full.');
        }
        // Checked before the posts below are cleared: was this hero's role the scarcest in the group's tier?
        $tier = $this->game->dungeonFor($p)['id'];
        $scarce = $answered && ($this->scarcity()[$tier]['role'] ?? null) === $h->role() && time() - $h->scarceAt >= 86400;
        $h->party = $p;
        $p->members->add($h);
        foreach ($this->em->getRepository(PartyRequest::class)->findBy(['hero' => $h]) as $r) {
            $this->em->remove($r);
        }
        foreach ($this->em->getRepository(TavernPost::class)->findBy(['author' => $h, 'kind' => 'lfg']) as $t) {
            $this->em->remove($t);
        }
        if ($p->members->count() >= Party::SIZE) {
            foreach ($this->em->getRepository(TavernPost::class)->findBy(['party' => $p]) as $t) {
                $this->em->remove($t);
            }
            foreach ($this->em->getRepository(PartyRequest::class)->findBy(['party' => $p]) as $r) {
                $this->em->remove($r);
            }
        }
        $this->game->post('party:'.$p->id, sprintf('%s joined the group.', $h->name));
        if ($scarce) {
            $h->bonusRolls = Rules::SCARCE_ROLLS;
            $h->scarceAt = time();
            $this->game->post('party:'.$p->id, sprintf('%s answered the call as a scarce %s: they roll twice on their next %d chests.', $h->name, $h->role() === 'dps' ? 'damage dealer' : $h->role(), Rules::SCARCE_ROLLS));
        }
    }

    /**
     * The scarcest role in each dungeon tier on the tavern board: wanted by the most groups looking for members,
     * offered by the fewest heroes looking for a group. [dungeon id => ['role', 'wanted', 'offered']]; tiers with
     * no shortage are left out.
     */
    public function scarcity(): array
    {
        $wanted = [];
        $offered = [];
        foreach ($this->em->getRepository(TavernPost::class)->findAll() as $t) {
            if ($t->kind === 'lfm' && $t->party) {
                $tier = $this->game->dungeonFor($t->party)['id'];
                foreach ($t->roles as $r) {
                    $wanted[$tier][$r] = ($wanted[$tier][$r] ?? 0) + 1;
                }
            } elseif ($t->kind === 'lfg') {
                $tier = Dungeons::newest($t->author->level)['id'];
                $r = $t->author->role();
                $offered[$tier][$r] = ($offered[$tier][$r] ?? 0) + 1;
            }
        }
        $out = [];
        foreach ($wanted as $tier => $roles) {
            $best = null;
            foreach (['tank', 'healer', 'dps'] as $r) {
                $gap = ($roles[$r] ?? 0) - ($offered[$tier][$r] ?? 0);
                if ($gap > 0 && (!$best || $gap > $best[1])) {
                    $best = [$r, $gap];
                }
            }
            if ($best) {
                $out[$tier] = ['role' => $best[0], 'wanted' => $roles[$best[0]], 'offered' => $offered[$tier][$best[0]] ?? 0];
            }
        }

        return $out;
    }

    public function leave(Hero $h): void
    {
        $p = $h->party ?? throw new GameError('You are not in a group.');
        $p->members->removeElement($h);
        $h->party = null;
        if ($p->members->isEmpty()) {
            foreach ($this->em->getRepository(Battle::class)->findBy(['party' => $p]) as $b) {
                if ($b->state === 'chest') {
                    $this->game->settleChest($b, PHP_INT_MAX);
                }
            }
            $this->em->remove($p);

            return;
        }
        if ($p->leader === $h) {
            $p->leader = $p->members->first();
        }
        $this->game->post('party:'.$p->id, sprintf('%s left the group.', $h->name));
    }

    public function kick(Hero $leader, Hero $target): void
    {
        $p = $this->leading($leader);
        if ($target->party !== $p || $target === $leader) {
            throw new GameError('They are not in your group.');
        }
        $this->leave($target);
    }

    public function settings(Hero $leader, array $in): void
    {
        $p = $this->leading($leader);
        if (isset($in['dungeonOffset'])) {
            $p->dungeonOffset = max(-3, min(5, (int) $in['dungeonOffset']));
        }
        if (array_key_exists('dungeon', $in)) {
            $open = Dungeons::unlocked($this->game->medianLevel($p));
            $pick = $in['dungeon'] ?: null;
            if ($pick !== null && !isset($open[$pick])) {
                throw new GameError('Your group has not reached that dungeon yet.');
            }
            $p->dungeon = $pick;
        }
        if (isset($in['difficulty'])) {
            $mode = (string) $in['difficulty'];
            $median = $this->game->medianLevel($p);
            if (!in_array($mode, Modes::MODES, true)) {
                throw new GameError('Pick normal, heroic or mythic.');
            }
            if ($mode === 'heroic' && !Modes::heroicOpen($this->game->dungeonFor($p), $median)) {
                throw new GameError('Heroic opens once your group outgrows this dungeon (its top level).');
            }
            if ($mode === 'mythic' && !Modes::mythicOpen($median)) {
                throw new GameError('Mythic opens at level '.Modes::MYTHIC_LEVEL.'.');
            }
            $p->difficulty = $mode;
        }
        if (isset($in['mythicTier'])) {
            $tier = (int) $in['mythicTier'];
            if ($tier < 1 || $tier > $p->mythicBest + 1) {
                throw new GameError(sprintf('Pick a tier from 1 to %d: one above the best your group has cleared.', $p->mythicBest + 1));
            }
            $p->mythicTier = $tier;
        }
        if (isset($in['running'])) {
            $p->running = (bool) $in['running'];
        }
        if (isset($in['name']) && trim($in['name']) !== '') {
            $p->name = mb_substr(trim($in['name']), 0, 40);
        }
    }

    /** Any member can send a resting group back into the dungeon, for example after a wipe. */
    public function resume(Hero $h): void
    {
        if (!$h->party) {
            throw new GameError('You are not in a group.');
        }
        $h->party->running = true;
    }

    private function leading(Hero $h): Party
    {
        if (!$h->party || $h->party->leader !== $h) {
            throw new GameError('Only the group leader can do that.');
        }

        return $h->party;
    }

    public function apply(Hero $h, Party $p, string $message): PartyRequest
    {
        if ($h->party) {
            throw new GameError('Leave your group first.');
        }
        if ($p->members->count() >= Party::SIZE) {
            throw new GameError('That group is full.');
        }
        $r = $this->request($p, $h, 'application', $message);
        if ($p->leader?->user->demo) {
            $this->accept($p->leader, $r);
        } elseif ($p->leader) {
            $this->notifier->notify($p->leader, 'invite', $h->name.' wants to join', sprintf('Level %d %s. Open the group to answer.', $h->level, Rules::CLASSES[$h->cls]['name'] ?? $h->cls), '#/group');
        }

        return $r;
    }

    public function invite(Hero $leader, Hero $target, string $message): PartyRequest
    {
        $p = $this->leading($leader);
        if ($target->party) {
            throw new GameError($target->name.' is already in a group.');
        }
        if ($p->members->count() >= Party::SIZE) {
            throw new GameError('Your group is full.');
        }
        $r = $this->request($p, $target, 'invite', $message);
        if ($target->user->demo) {
            $this->accept($target, $r);
        } else {
            $this->notifier->notify($target, 'invite', $leader->name.' invited you', 'Open the tavern to answer.', '#/group');
        }

        return $r;
    }

    private function request(Party $p, Hero $h, string $kind, string $message): PartyRequest
    {
        $existing = $this->em->getRepository(PartyRequest::class)->findOneBy(['party' => $p, 'hero' => $h]);
        if ($existing) {
            return $existing;
        }
        $r = new PartyRequest();
        $r->party = $p;
        $r->hero = $h;
        $r->kind = $kind;
        $r->message = mb_substr(trim($message), 0, 200);
        $r->createdAt = time();
        $this->em->persist($r);

        return $r;
    }

    /** Invites are answered by the hero, applications by the group's leader. */
    public function accept(Hero $actor, PartyRequest $r): void
    {
        $this->mayAnswer($actor, $r);
        if ($r->hero->party) {
            $this->em->remove($r);
            throw new GameError($r->hero->name.' already joined another group.');
        }
        $this->em->remove($r);
        $this->join($r->hero, $r->party);
    }

    public function decline(Hero $actor, PartyRequest $r): void
    {
        if ($r->hero !== $actor) {
            $this->mayAnswer($actor, $r);
        }
        $this->em->remove($r);
    }

    private function mayAnswer(Hero $actor, PartyRequest $r): void
    {
        $ok = $r->kind === 'invite' ? $r->hero === $actor : $r->party->leader === $actor;
        if (!$ok) {
            throw new GameError('That request is not yours to answer.');
        }
    }

    // ------------------------------------------------------------------ tavern board

    public function postTavern(Hero $h, string $kind, string $text, array $roles): TavernPost
    {
        if ($kind === 'lfm') {
            $p = $this->leading($h);
            if ($p->members->count() >= Party::SIZE) {
                throw new GameError('Your group is full.');
            }
        } elseif ($kind === 'lfg') {
            if ($h->party) {
                throw new GameError('You are already in a group.');
            }
        } else {
            throw new GameError('Post as looking for group or looking for members.');
        }
        foreach ($this->em->getRepository(TavernPost::class)->findBy(['author' => $h]) as $old) {
            $this->em->remove($old);
        }
        $t = new TavernPost();
        $t->author = $h;
        $t->party = $kind === 'lfm' ? $h->party : null;
        $t->kind = $kind;
        $t->text = mb_substr(trim($text), 0, 200);
        $t->roles = array_values(array_intersect(['tank', 'healer', 'dps'], $roles)) ?: ($kind === 'lfg' ? [$h->role()] : ['tank', 'healer', 'dps']);
        $t->createdAt = time();
        $this->em->persist($t);

        return $t;
    }

    public function removeTavern(Hero $h, TavernPost $t): void
    {
        if ($t->author !== $h) {
            throw new GameError('That is not your post.');
        }
        $this->em->remove($t);
    }

    // ------------------------------------------------------------------ guilds

    public function createGuild(Hero $h, array $in): Guild
    {
        if ($h->guild) {
            throw new GameError('Leave your guild first.');
        }
        $name = trim((string) ($in['name'] ?? ''));
        $tag = strtoupper(trim((string) ($in['tag'] ?? '')));
        if (mb_strlen($name) < 3 || mb_strlen($name) > 32 || !preg_match('/^[A-Z0-9]{2,4}$/', $tag)) {
            throw new GameError('A guild needs a name of 3 to 32 characters and a tag of 2 to 4 letters or digits.');
        }
        if ($this->em->getRepository(Guild::class)->findOneBy(['name' => $name])) {
            throw new GameError('That guild name is taken.');
        }
        $cost = 100;
        if ((int) $h->gold < $cost) {
            throw new GameError("Founding a guild costs $cost gold.");
        }
        $h->gold = (string) ((int) $h->gold - $cost);
        $g = new Guild();
        $g->name = $name;
        $g->tag = $tag;
        $g->motto = mb_substr(trim((string) ($in['motto'] ?? '')), 0, 160);
        $g->createdAt = time();
        $this->em->persist($g);
        $h->guild = $g;
        $h->guildRank = 'leader';
        $g->members->add($h);
        $h->marks = array_values(array_unique([...$h->marks, 'founder', 'bannerBearer']));
        $this->game->post('tavern', sprintf('%s founded the guild %s [%s].', $h->name, $name, $tag));

        return $g;
    }

    public function joinGuild(Hero $h, Guild $g): void
    {
        if ($h->guild) {
            throw new GameError('Leave your guild first.');
        }
        if ($g->members->count() >= Guild::MAX_MEMBERS) {
            throw new GameError('That guild is full.');
        }
        $h->guild = $g;
        $h->guildRank = 'member';
        $g->members->add($h);
        $h->marks = array_values(array_unique([...$h->marks, 'bannerBearer']));
        $this->em->flush();
        $this->game->post('guild:'.$g->id, sprintf('%s joined the guild. Say hello!', $h->name));
    }

    public function leaveGuild(Hero $h): void
    {
        $g = $h->guild ?? throw new GameError('You are not in a guild.');
        $g->members->removeElement($h);
        $h->guild = null;
        if ($h->guildRank === 'leader' && !$g->members->isEmpty()) {
            $next = $g->members->first();
            $next->guildRank = 'leader';
        }
        $h->guildRank = 'member';
        if ($g->members->isEmpty()) {
            $this->em->remove($g);
        } else {
            $this->game->post('guild:'.$g->id, sprintf('%s left the guild.', $h->name));
        }
    }

    // ------------------------------------------------------------------ chat

    public function channels(Hero $h): array
    {
        $out = ['tavern' => 'Tavern'];
        if ($h->guild) {
            $out['guild:'.$h->guild->id] = 'Guild';
        }
        if ($h->party) {
            $out['party:'.$h->party->id] = 'Group';
        }

        return $out;
    }

    /** @return ChatMessage[] */
    public function read(Hero $h, string $channel, int $after = 0, int $limit = 60): array
    {
        if (!isset($this->channels($h)[$channel])) {
            throw new GameError('You cannot read that channel.');
        }
        $q = $this->em->getRepository(ChatMessage::class)->createQueryBuilder('m')
            ->where('m.channel = :c')->setParameter('c', $channel)
            ->orderBy('m.id', 'DESC')->setMaxResults($limit);
        if ($after > 0) {
            $q->andWhere('m.id > :a')->setParameter('a', $after);
        }

        if ($blocked = $h->user->blockedIds()) {
            $q->andWhere('m.author IS NULL OR m.author NOT IN (:b)')->setParameter('b', $blocked);
        }

        return array_reverse($q->getQuery()->getResult());
    }

    public function say(Hero $h, string $channel, string $body, ?array $card = null): ChatMessage
    {
        if (!isset($this->channels($h)[$channel])) {
            throw new GameError('You cannot write to that channel.');
        }
        if ($h->user->isMuted()) {
            throw new GameError(sprintf('You are muted in chat until %s UTC.', gmdate('j M H:i', $h->user->mutedUntil)));
        }
        $body = trim($body);
        if ($body === '' && !$card) {
            throw new GameError('Say something.');
        }

        return $this->game->post($channel, $body, $card, $h);
    }
}

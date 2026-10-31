<?php

namespace App\Service;

use App\Entity\Hero;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Alternate heroes: an account may keep up to MAX heroes and plays one at a time. They share the wardrobe (every look
 * any of them has worn) and the Codex (every legendary power any of them has learned), and heroes behind the account's
 * best get catch-up XP (Rules::catchUp). Each hero keeps its own group, gear, gold and story.
 */
class Roster
{
    public const MAX = 6;

    public function __construct(private EntityManagerInterface $em)
    {
    }

    /** @return Hero[] the account's heroes, oldest first */
    public function heroes(User $u): array
    {
        return $this->em->getRepository(Hero::class)->findBy(['user' => $u], ['id' => 'ASC']);
    }

    /** The hero the account is playing: the one it picked, else its first. */
    public function active(User $u): ?Hero
    {
        $all = $this->heroes($u);
        foreach ($all as $h) {
            if ($h->id === $u->activeHero) {
                return $h;
            }
        }

        return $all[0] ?? null;
    }

    public function switchTo(User $u, int $heroId): Hero
    {
        foreach ($this->heroes($u) as $h) {
            if ($h->id === $heroId) {
                $u->activeHero = $h->id;
                $this->share($u);

                return $h;
            }
        }
        throw new GameError('That is not one of your heroes.');
    }

    /** The highest level on the account. */
    public function best(User $u): int
    {
        return max([1, ...array_map(fn (Hero $h) => $h->level, $this->heroes($u))]);
    }

    /** Every hero on the account gets every look and every Codex power any of them has. */
    public function share(User $u): void
    {
        $all = $this->heroes($u);
        if (count($all) < 2) {
            return;
        }
        $looks = array_values(array_unique(array_merge(...array_map(fn (Hero $h) => $h->wardrobe ?? [], $all))));
        $codex = array_values(array_unique(array_merge(...array_map(fn (Hero $h) => $h->codex, $all))));
        foreach ($all as $h) {
            if (count($h->wardrobe ?? []) !== count($looks)) {
                $h->wardrobe = $looks;
            }
            if (count($h->codex) !== count($codex)) {
                $h->codex = $codex;
            }
        }
    }
}

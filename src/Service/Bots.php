<?php

namespace App\Service;

use App\Entity\Hero;
use App\Entity\Item;
use App\Game\Combatants;
use App\Game\Items;
use App\Game\Rules;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Plays the demo heroes so one person can try a full group of five. They spend points the suggested way,
 * pick a Path and Keystones, wear upgrades and roll on loot by their loot setting. Real players never see
 * a bot outside the demo seed.
 */
class Bots
{
    private const LINES = [
        'gg everyone', 'that golem hits hard', 'anyone need a ring? got a spare', 'tank, you are a hero',
        'nice heals', 'I got a new glyph, going for Ember Resonance', 'one more level and I can pick my Keystone',
        'who wants to push the dungeon level up?', 'brb, making tea', 'loot was kind today',
    ];

    public function __construct(private EntityManagerInterface $em, private HeroActions $heroes, private GearActions $gear, private Present $present, private Game $game)
    {
    }

    /** @return Hero[] */
    public function demoHeroes(): array
    {
        return $this->em->getRepository(Hero::class)->createQueryBuilder('h')
            ->join('h.user', 'u')->where('u.demo = true')->getQuery()->getResult();
    }

    public function think(Hero $h): void
    {
        if (!$h->user->demo) {
            return;
        }
        $this->heroes->autoSpend($h);
        $paths = array_keys(Rules::CLASSES[$h->cls]['paths']);
        if (!$h->path && $h->level >= Rules::PATH_LEVEL && !$h->oathTaken) {
            $h->path = $paths[$h->id % count($paths)];
        }
        $options = array_keys(Rules::KEYSTONES[$h->role()]);
        foreach ($this->present->keystoneLevels($h->level) as $lvl) {
            if (!isset($h->keystones[$lvl])) {
                $free = array_values(array_diff($options, $h->keystones));
                $ks = $h->keystones;
                $ks[$lvl] = $free[($h->id + $lvl) % count($free)];
                $h->keystones = $ks;
            }
        }
        $h->loadout = Combatants::defaultLoadout($h->cls, $h->level, $h->path);
        $i = 0;
        while ($h->skillPoints() > 0 && $i++ < 200) {
            $skill = $h->loadout[$i % count($h->loadout)];
            if (($h->skillRanks[$skill] ?? 1) < HeroActions::MAX_RANK) {
                $this->heroes->rankUp($h, $skill);
            }
        }
        foreach ($this->heroes->bag($h) as $item) {
            if ($item->slot === 'glyph') {
                $this->socketGlyph($h, $item);
            } elseif ($this->game->isUpgrade($h, Items::spec($item))) {
                $this->gear->equip($h, $item);
                $this->em->flush();
            }
        }
    }

    private function socketGlyph(Hero $h, Item $glyph): void
    {
        foreach ($this->game->equipped($h) as $worn) {
            foreach (range(0, max(0, $worn->sockets - 1)) as $s) {
                if ($worn->sockets > 0 && empty($worn->glyphs[$s])) {
                    $this->gear->socket($h, $worn, $glyph, $s);
                    $this->em->flush();

                    return;
                }
            }
        }
    }

    /** Now and then a demo hero says something in their guild, so the chat does not feel empty. */
    public function chatter(): void
    {
        if (random_int(1, 100) > 4) {
            return;
        }
        $demo = array_values(array_filter($this->demoHeroes(), fn (Hero $h) => $h->guild !== null));
        if ($demo) {
            $h = $demo[array_rand($demo)];
            $this->game->post('guild:'.$h->guild->id, self::LINES[array_rand(self::LINES)], null, $h);
        }
    }
}

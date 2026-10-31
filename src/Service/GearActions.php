<?php

namespace App\Service;

use App\Entity\Hero;
use App\Entity\Item;
use App\Game\Art;
use App\Game\Items;
use App\Game\Rules;
use Doctrine\ORM\EntityManagerInterface;
use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * Open gear: nothing binds, nothing has requirements. Items can be worn, tempered, socketed with glyphs,
 * imprinted with Codex powers, reforged, salvaged, crafted, given away and sold.
 */
class GearActions
{
    public const MAX_TEMPER = 15;

    public function __construct(private EntityManagerInterface $em, private Game $game)
    {
    }

    public function own(Hero $h, int $id): Item
    {
        $i = $this->em->find(Item::class, $id);
        if (!$i || $i->owner !== $h) {
            throw new GameError('That item is not yours.');
        }

        return $i;
    }

    public function equip(Hero $h, Item $i, ?string $target = null): void
    {
        if ($i->slot === 'glyph') {
            throw new GameError('Glyphs go into sockets, not slots.');
        }
        if ($i->price !== null) {
            throw new GameError('Take the item off the market first.');
        }
        $target ??= $i->slot;
        if ($i->slot === 'ring1') {
            if (!in_array($target, ['ring1', 'ring2'], true)) {
                $target = 'ring1';
            }
            if ($target === 'ring1' && $this->worn($h, 'ring1') && !$this->worn($h, 'ring2')) {
                $target = 'ring2';
            }
        } elseif ($target !== $i->slot) {
            throw new GameError('That item does not fit there.');
        }
        if ($old = $this->worn($h, $target)) {
            $old->equipped = null;
        }
        $i->equipped = $target;
        $this->game->collectLook($h, $i);
    }

    /** Dye a worn-slot item: [cloth, trim, metal] from the dye and metal lists, or null to undo. */
    public function dye(Hero $h, Item $i, ?array $dye): void
    {
        if (!(Rules::SLOTS[$i->slot][1] ?? null)) {
            throw new GameError('Only things you can see can be dyed.');
        }
        if ($dye !== null) {
            $dye = array_values($dye);
            if (count($dye) !== 3 || !in_array($dye[0], Rules::DYES, true) || !in_array($dye[1], Rules::DYES, true) || !in_array($dye[2], Rules::METALS, true)) {
                throw new GameError('Pick two dyes and a metal from the dye table.');
            }
            if ($h->materials < Rules::DYE_COST) {
                throw new GameError(sprintf('Dyeing costs %d materials.', Rules::DYE_COST));
            }
            $h->materials -= Rules::DYE_COST;
        }
        $i->dye = $dye;
        $this->game->collectLook($h, $i);
    }

    /** Show a wardrobe look in a slot instead of the worn item, 'hidden' for head or back, or null for the item. */
    public function outfit(Hero $h, string $slot, ?string $key): void
    {
        if (!(Rules::SLOTS[$slot][1] ?? null)) {
            throw new GameError('That slot has no look.');
        }
        $out = $h->outfit ?? [];
        if ($key === null || $key === '') {
            unset($out[$slot]);
        } elseif ($key === 'hidden') {
            if (!in_array($slot, ['head', 'cape'], true)) {
                throw new GameError('Only the head and back can be hidden.');
            }
            $out[$slot] = 'hidden';
        } else {
            if (!in_array($key, $h->wardrobe ?? [], true) || explode('|', $key)[0] !== $slot) {
                throw new GameError('That look is not in your wardrobe for this slot.');
            }
            $out[$slot] = $key;
        }
        $h->outfit = $out;
    }

    public function unequip(Item $i): void
    {
        $i->equipped = null;
    }

    private function worn(Hero $h, string $slot): ?Item
    {
        return $this->em->getRepository(Item::class)->findOneBy(['owner' => $h, 'equipped' => $slot]);
    }

    public function temper(Hero $h, Item $i): void
    {
        if ($i->slot === 'glyph') {
            throw new GameError('Glyphs cannot be tempered.');
        }
        if ($i->temper >= self::MAX_TEMPER) {
            throw new GameError('That item is fully tempered.');
        }
        $cost = Items::temperCost(Items::spec($i), $h->origin === 'anvil');
        $this->pay($h, $cost['gold'], $cost['materials']);
        ++$i->temper;
    }

    public function socket(Hero $h, Item $i, Item $glyph, int $socket): void
    {
        if ($glyph->slot !== 'glyph') {
            throw new GameError('That is not a glyph.');
        }
        if ($socket < 0 || $socket >= $i->sockets) {
            throw new GameError('That socket does not exist.');
        }
        $glyphs = $i->glyphs;
        if (!empty($glyphs[$socket])) {
            $this->unsocket($h, $i, $socket);
            $glyphs = $i->glyphs;
        }
        $glyphs[$socket] = [$glyph->base, (int) ($glyph->affixes[0][1] ?? 3)];
        $i->glyphs = $glyphs;
        $this->em->remove($glyph);
    }

    /** Glyphs come out whole, so trying a different Resonance never costs you the glyph. */
    public function unsocket(Hero $h, Item $i, int $socket): void
    {
        $gl = $i->glyphs[$socket] ?? null;
        if (!$gl) {
            throw new GameError('That socket is empty.');
        }
        $g = new Item();
        $g->owner = $h;
        $g->slot = 'glyph';
        $g->base = $gl[0];
        $g->rarity = 'rare';
        $g->ilvl = $i->ilvl;
        $g->affixes = [[Rules::GLYPHS[$gl[0]][1], $gl[1]]];
        $g->seed = random_int(1, 999999);
        $g->createdAt = time();
        $this->em->persist($g);
        $glyphs = $i->glyphs;
        $glyphs[$socket] = null;
        $i->glyphs = $glyphs;
    }

    /** Copy a power from the Codex onto any item. One imprint per item; it can be overwritten. */
    public function imprint(Hero $h, Item $i, string $power): void
    {
        if (!in_array($power, $h->codex, true)) {
            throw new GameError('That power is not in your Codex yet.');
        }
        if ($i->slot === 'glyph') {
            throw new GameError('Glyphs cannot hold a power.');
        }
        $this->pay($h, 0, 0, 20);
        $i->imprint = $power;
    }

    /** From level 50: reroll one affix into an attribute of your choice. */
    public function reforge(Hero $h, Item $i, int $affix, string $attr): void
    {
        if ($h->level < Rules::REFORGE_LEVEL) {
            throw new GameError('Reforging opens at level '.Rules::REFORGE_LEVEL.'.');
        }
        if (!isset($i->affixes[$affix]) || !isset(Rules::ATTRIBUTES[$attr]) || $i->slot === 'glyph') {
            throw new GameError('Pick an affix and an attribute.');
        }
        foreach ($i->affixes as $k => [$a]) {
            if ($a === $attr && $k !== $affix) {
                throw new GameError('The item already has that attribute.');
            }
        }
        $this->pay($h, 50 * $i->ilvl, 0, 10);
        $affixes = $i->affixes;
        $affixes[$affix] = [$attr, Items::affixValue($i->ilvl, (new Randomizer())->getFloat(0, 1))];
        $i->affixes = $affixes;
    }

    public function salvage(Hero $h, Item $i): array
    {
        if ($i->equipped) {
            throw new GameError('Take the item off first.');
        }
        $gain = ['essence' => Items::salvageValue(Items::spec($i)), 'materials' => 1 + intdiv($i->ilvl, 10)];
        $h->essence += $gain['essence'];
        $h->materials += $gain['materials'];
        // Socketed glyphs come back.
        foreach ($i->glyphs as $k => $gl) {
            if ($gl) {
                $this->unsocket($h, $i, $k);
            }
        }
        $this->em->remove($i);

        return $gain;
    }

    /** Crafting: a fresh item at your level for materials and gold. Mostly commons, sometimes better. */
    public function craft(Hero $h, string $slot, ?string $base): Item
    {
        if (!isset(Art::bases()[$slot]) || $slot === 'ring2') {
            throw new GameError('Pick a slot.');
        }
        if ($base !== null && !isset(Art::dropBases()[$slot][$base])) {
            throw new GameError('Pick a style for that slot.');
        }
        $cost = self::craftCost($h->level);
        $this->pay($h, $cost['gold'], $cost['materials']);
        $r = new Randomizer();
        $roll = $r->getFloat(0, 1);
        $rarity = $roll < 0.03 ? 'epic' : ($roll < 0.25 ? 'rare' : 'common');
        $item = Items::fromSpec(Items::generate($r, 2 * $h->level, $rarity, $slot, $base));
        $item->owner = $h;
        $this->em->persist($item);

        return $item;
    }

    public static function craftCost(int $level): array
    {
        return ['gold' => (int) round(20 * 1.045 ** (2 * $level)), 'materials' => 4 + intdiv($level, 4)];
    }

    public function give(Hero $from, Item $i, Hero $to): void
    {
        if ($to === $from) {
            throw new GameError('That is you.');
        }
        $i->equipped = null;
        $i->price = null;
        $i->owner = $to;
        $this->game->post($from->party && $from->party === $to->party ? 'party:'.$from->party->id : 'tavern', sprintf('%s gave %s to %s.', $from->name, Items::name(Items::spec($i)), $to->name), ['type' => 'item', 'spec' => Items::spec($i)]);
    }

    public function sell(Item $i, int $price): void
    {
        if ($price < 1 || $price > 10_000_000) {
            throw new GameError('Set a price between 1 and 10,000,000 gold.');
        }
        $i->equipped = null;
        $i->price = (string) $price;
    }

    public function unlist(Item $i): void
    {
        $i->price = null;
    }

    public function buy(Hero $buyer, int $id): Item
    {
        $i = $this->em->find(Item::class, $id);
        if (!$i || $i->price === null || !$i->owner) {
            throw new GameError('That listing is gone.');
        }
        if ($i->owner === $buyer) {
            throw new GameError('That is your own listing.');
        }
        $price = (int) $i->price;
        $this->pay($buyer, $price, 0);
        $seller = $i->owner;
        $seller->gold = (string) ((int) $seller->gold + $price);
        $i->owner = $buyer;
        $i->price = null;

        return $i;
    }

    private function pay(Hero $h, int $gold, int $materials, int $essence = 0): void
    {
        if ((int) $h->gold < $gold) {
            throw new GameError("That costs $gold gold.");
        }
        if ($h->materials < $materials) {
            throw new GameError("That needs $materials materials.");
        }
        if ($h->essence < $essence) {
            throw new GameError("That needs $essence essence.");
        }
        $h->gold = (string) ((int) $h->gold - $gold);
        $h->materials -= $materials;
        $h->essence -= $essence;
    }
}

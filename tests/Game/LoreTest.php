<?php

namespace App\Tests\Game;

use App\Game\Lore;
use PHPUnit\Framework\TestCase;

class LoreTest extends TestCase
{
    public function testTheBaseBookCoversEveryChoiceAndEveryLinkResolves(): void
    {
        $this->assertSame([], Lore::problems());
        $book = Lore::book();
        $this->assertArrayHasKey('base', $book['packs']);
        // Every life story answer has a note, so the creator can show lore beside every answer.
        $this->assertNotEmpty(Lore::entry(Lore::key('answer', 'dwarf', 'birth', 2))['summary']);
        $this->assertSame('Brewhall', Lore::entry('culture:dwarf.brewhall')['title']);
    }

    public function testExpansionsGrowEntriesWithoutTouchingTheBasePack(): void
    {
        $book = Lore::book(dirname(__DIR__).'/fixtures/lore');
        $this->assertSame(['core', 'frostfall'], array_keys($book['packs']), 'disabled packs stay out');
        $dwarf = $book['entries']['race:dwarf'];
        $this->assertSame('Dwarves', $dwarf['title'], 'a pack that leaves a field out keeps the old one');
        $this->assertSame('Short, stubborn and now cold.', $dwarf['summary']);
        $this->assertSame(['core', 'frostfall'], array_column($dwarf['sections'], 'pack'));
        $this->assertSame([['Lifespan', '300 years'], ['Northern holds', 'Three']], $dwarf['facts']);
        $this->assertSame(['place:hold', 'region:frostfall'], $dwarf['see']);
        $this->assertSame(['core', 'frostfall'], $dwarf['packs']);
        $this->assertSame('The Old Hold', $book['entries']['place:hold']['title']);
        $this->assertArrayNotHasKey('sections', array_filter($book['entries']['place:hold']));
        $this->assertArrayHasKey('region', $book['shelves'], 'packs can add shelves');
        $this->assertSame(['region:frostfall: links to missing place:nowhere'], Lore::problems($book, false));
    }

    public function testLinksAreFoundInText(): void
    {
        $this->assertSame(['place:hold', 'race:dwarf'], Lore::links('See [[place:hold|the hold]] and [[race:dwarf]].'));
    }
}

<?php

namespace App\Game;

/**
 * A hero's life story, written at creation: seventeen questions in five chapters, worded differently for every race,
 * with four answers each (or the race's cultures and backstories for "home" and "youth"). The answers become a
 * biography on the hero sheet and feed Heritage: where the hero was raised sets the culture, what they were known
 * for sets the backstory (see Heritage::BACKSTORIES), and the life as a whole leans toward the three attributes it
 * names most, +2 each.
 */
final class LifeStory
{
    /** chapter => [title, question ids]. */
    public const CHAPTERS = [
        'family' => ['Family', ['grandparents', 'parents', 'siblings', 'birth']],
        'childhood' => ['Childhood', ['home', 'youth', 'friend', 'play']],
        'age' => ['Coming of age', ['teen', 'firstfight', 'mentor']],
        'setting' => ['Setting out', ['leaving', 'deed', 'loss']],
        'self' => ['Who you are', ['fear', 'keepsake', 'drive']],
    ];

    /** How many attributes the story leans to, and by how much. */
    public const LEAN_ATTRS = 3;
    public const LEAN_POINTS = 2;

    /** Free words of the player's own at the end of the story. */
    public const NOTES_MAX = 600;

    /** race => [home question, youth question, question id => [question, [[answer, sentence, attribute] x 4]]]. */
    public const QUESTIONS = 
    [
        'human' => [
            'home' => 'Where were you raised?',
            'youth' => 'What were you known for as a child?',
            'grandparents' => [
                'Who were your grandparents?',
                [
                    ['Knights of the old realm', '{name}\'s grandparents rode under the old kingdom\'s banners, and their rusted helms still hang above the family hearth.', 'command'],
                    ['Farmers who fed a famine', '{name}\'s grandparents kept a farm through the Hungry Years and fed half the valley from it.', 'vitality'],
                    ['Sailors lost at sea', '{name}\'s grandparents sailed out of port one spring and never came back; only their logbook did.', 'swiftness'],
                    ['Hedge-wizards', '{name}\'s grandparents were hedge-wizards, distrusted by the priests and sought out by everyone else.', 'arcana'],
                ],
            ],
            'parents' => [
                'What did your parents do?',
                [
                    ['Ran an inn', '{name}\'s parents ran a crossroads inn where every traveller\'s story ended up at the bar.', 'presence'],
                    ['Served the lord', '{name}\'s parents served a minor lord, one as steward and one as guard captain.', 'guard'],
                    ['Peddled wares', '{name}\'s parents were peddlers who knew the price of everything on three roads.', 'fortune'],
                    ['Never knew them', '{name} never knew their parents and was raised by a temple orphanage that taught discipline before letters.', 'resolve'],
                ],
            ],
            'siblings' => [
                'Who did you grow up with?',
                [
                    ['Six brothers and sisters', '{name} was the middle of seven children and learned early to shout, share and bargain.', 'command'],
                    ['A twin', '{name} had a twin, and the two of them were never apart until the day they had to be.', 'focus'],
                    ['No one', '{name} grew up an only child, with too many books and too much quiet.', 'insight'],
                    ['A cousin taken in', '{name} grew up beside an orphaned cousin who became closer than any sibling.', 'recovery'],
                ],
            ],
            'birth' => [
                'What happened the day you were born?',
                [
                    ['A comet in the sky', 'On the night {name} was born, a comet hung over the city and the priests argued about it for a year.', 'arcana'],
                    ['A great harvest', '{name} was born on the last day of the best harvest anyone could remember.', 'vitality'],
                    ['A town fire', '{name} was born while half the town burned, carried out through the smoke in a laundry basket.', 'tenacity'],
                    ['The king passed by', '{name} was born the day the king\'s procession passed the door, and was named for one of his knights.', 'presence'],
                ],
            ],
            'friend' => [
                'Who ran the streets with you as a child?',
                [
                    ['The stablehand\'s kid', '{name}\'s best friend was the stablehand\'s child, who taught them to ride bareback and lie to grown-ups.', 'agility'],
                    ['An old dog', '{name}\'s best friend was a three-legged dog that followed them everywhere for twelve years.', 'recovery'],
                    ['A rich merchant\'s heir', '{name}\'s best friend was a merchant\'s heir, which opened doors and caused trouble in equal measure.', 'fortune'],
                    ['A rival', '{name}\'s best friend started as a rival, and they still argue about who won the race by the mill.', 'ferocity'],
                ],
            ],
            'play' => [
                'What did you spend your childhood summers on?',
                [
                    ['Mock tournaments', 'As a child {name} staged mock tournaments with broomstick lances and pot-lid shields.', 'might'],
                    ['Market days', 'As a child {name} lived for market days, the noise, the smells and the haggling.', 'thrift'],
                    ['The chapel choir', 'As a child {name} sang in the chapel choir and was caught stealing candles only once.', 'spirit'],
                    ['Climbing the walls', 'As a child {name} climbed every wall in town, including several they were told not to.', 'swiftness'],
                ],
            ],
            'teen' => [
                'What were your teenage years like?',
                [
                    ['Squired for a knight', 'As a teenager {name} squired for a tired knight who taught more about patience than swords.', 'guard'],
                    ['Ran with a gang', 'As a teenager {name} ran with a street gang and still knows every alley by heart.', 'precision'],
                    ['Apprenticed to a scholar', 'As a teenager {name} copied manuscripts for a scholar who paid in books instead of coin.', 'lore'],
                    ['Worked the fields', 'As a teenager {name} worked the fields from dawn to dusk and grew strong doing it.', 'stamina'],
                ],
            ],
            'firstfight' => [
                'When did you first have to fight for real?',
                [
                    ['Defended a stranger', '{name}\'s first real fight was against three thugs bothering a stranger, and they won, barely.', 'vitality'],
                    ['Lost a duel', '{name}\'s first real fight was a duel over an insult, lost badly, and the scar is still there.', 'tenacity'],
                    ['Talked down', '{name}\'s first real fight never happened: they talked a drunk mercenary out of it.', 'presence'],
                    ['Bandits on the road', '{name}\'s first real fight was against bandits on the north road, with a borrowed spear.', 'ferocity'],
                ],
            ],
            'mentor' => [
                'Who shaped you most before you came of age?',
                [
                    ['A retired sergeant', '{name} learned the most from a retired sergeant who drilled them in the square every morning.', 'command'],
                    ['A village priest', '{name} learned the most from a village priest who believed in second chances.', 'spirit'],
                    ['A traveling bard', '{name} learned the most from a traveling bard who knew a song for every road.', 'lore'],
                    ['Hard lessons', '{name} learned the most from hard lessons and the bruises that came with them.', 'resolve'],
                ],
            ],
            'leaving' => [
                'Why did you leave your town?',
                [
                    ['To earn a name', '{name} left home to earn a name of their own instead of their family\'s.', 'ferocity'],
                    ['To pay a debt', '{name} left home to pay off a family debt to a guild that does not forgive.', 'thrift'],
                    ['Called to arms', '{name} left home when the muster bell rang and never quite went back.', 'might'],
                    ['Following a friend', '{name} left home because their best friend did, and someone had to watch their back.', 'command'],
                ],
            ],
            'deed' => [
                'What deed would you tell a stranger at the bar?',
                [
                    ['Saved a village', '{name}\'s proudest moment is holding a burning bridge until a village got across.', 'vitality'],
                    ['Won the harvest games', '{name}\'s proudest moment is winning the archery at the harvest games against a lord\'s huntsman.', 'precision'],
                    ['Built something', '{name}\'s proudest moment is the bridge they helped build, still standing over the Greywater.', 'guard'],
                    ['Made a fortune', '{name}\'s proudest moment is turning one silver coin into a cart of goods in a single summer.', 'fortune'],
                ],
            ],
            'loss' => [
                'What has life on the road cost you?',
                [
                    ['A friend', 'Along the way {name} lost a friend to a fever no healer could break.', 'tenacity'],
                    ['A home', 'Along the way {name} lost the family home to a lord\'s greed.', 'hunger'],
                    ['A love', 'Along the way {name} lost a love to a choice neither of them could take back.', 'spirit'],
                    ['Nothing yet', 'So far {name} has lost nothing that matters, and knows how lucky that is.', 'insight'],
                ],
            ],
            'fear' => [
                'What keeps you awake at night?',
                [
                    ['Being forgotten', '{name}\'s deepest fear is dying with no song to remember them.', 'lore'],
                    ['Losing control', '{name}\'s deepest fear is the temper they inherited from their father\'s side.', 'focus'],
                    ['Failing others', '{name}\'s deepest fear is the day someone counts on them and they are not enough.', 'command'],
                    ['Deep water', '{name}\'s deepest fear is deep water, ever since the river nearly took them.', 'stamina'],
                ],
            ],
            'keepsake' => [
                'What is in your pocket that you would never sell?',
                [
                    ['A signet ring', '{name} always carries their grandparents\' signet ring on a cord around their neck.', 'fortune'],
                    ['A letter never sent', '{name} always carries a letter they wrote and never sent.', 'wisdom'],
                    ['A whetstone', '{name} always carries a whetstone worn smooth by three generations of hands.', 'might'],
                    ['A pressed flower', '{name} always carries a pressed flower from the meadow behind home.', 'recovery'],
                ],
            ],
            'drive' => [
                'What gets you on the road each morning?',
                [
                    ['Family honor', 'What drives {name} now is restoring their family\'s honor.', 'vitality'],
                    ['Gold and land', 'What drives {name} now is a plot of land and a roof that is their own.', 'fortune'],
                    ['The unknown', 'What drives {name} now is everything beyond the edge of the map.', 'insight'],
                    ['Justice', 'What drives {name} now is justice for those who cannot fight for it.', 'resolve'],
                ],
            ],
        ],
        'elf' => [
            'home' => 'Which elven realm raised you?',
            'youth' => 'What were you known for in your first century?',
            'grandparents' => [
                'Who were your grandparents, in the long centuries before you?',
                [
                    ['Witnesses of the Sundering', '{name}\'s grandparents saw the Sundering of the old forests a thousand years ago and never spoke of it above a whisper.', 'lore'],
                    ['Starweavers', '{name}\'s grandparents wove starlight into the wards of the white towers, and some still hold.', 'arcana'],
                    ['Wardens who walked away', '{name}\'s grandparents were wardens who one day laid down their bows and walked into the deep wood, never to return.', 'agility'],
                    ['Ambassadors to the short-lived', '{name}\'s grandparents spent three centuries as envoys to human kings, burying friend after friend.', 'presence'],
                ],
            ],
            'parents' => [
                'What were your parents devoted to?',
                [
                    ['Tending a sacred tree', '{name}\'s parents tended a single sacred tree for two hundred years and called it family.', 'recovery'],
                    ['Composing a song', '{name}\'s parents spent a century composing one song, and it is still unfinished.', 'focus'],
                    ['Guarding a border', '{name}\'s parents guarded a forest border no one has crossed in living memory, which is the point.', 'guard'],
                    ['Chasing a lost star', '{name}\'s parents charted the path of a star that vanished, certain it will return.', 'insight'],
                ],
            ],
            'siblings' => [
                'Elves have few children. Who did you grow up beside?',
                [
                    ['A sibling three centuries older', '{name}\'s only sibling was born three hundred years before them and treats them as a curious pet.', 'wisdom'],
                    ['Children of the whole grove', '{name} was raised among every child of the grove, since there were only five of them.', 'command'],
                    ['A human foundling', '{name} grew up beside a human foundling who grew old while {name} was still young.', 'spirit'],
                    ['The trees themselves', '{name} grew up alone, and learned to talk to the trees because no one else was around.', 'recovery'],
                ],
            ],
            'birth' => [
                'What sign marked your birth?',
                [
                    ['The first snow in a century', '{name} was born under the first snow to fall on the silver forest in a hundred years.', 'tenacity'],
                    ['A falling star', '{name} was born as a star fell into the lake, and the water glowed for nine nights.', 'arcana'],
                    ['Silence of the birds', 'On the morning {name} was born every bird in the forest fell silent, and no seer would say why.', 'focus'],
                    ['A bloom out of season', '{name} was born on the day the old moonflower bloomed out of season.', 'spirit'],
                ],
            ],
            'friend' => [
                'Who was your dearest companion as a child?',
                [
                    ['A white stag', '{name}\'s dearest companion was a white stag who let only them come close.', 'swiftness'],
                    ['An ancient owl', '{name}\'s dearest companion was an owl older than the village, who answered questions with questions.', 'wisdom'],
                    ['A dryad', '{name}\'s dearest companion was a shy dryad who taught them every name of every leaf.', 'recovery'],
                    ['A rival archer', '{name}\'s dearest companion was a rival archer, and their contests are still remembered.', 'precision'],
                ],
            ],
            'play' => [
                'What filled your first fifty years?',
                [
                    ['Archery in the canopy', 'In their first fifty years {name} practiced archery in the high canopy until they could split a falling leaf.', 'precision'],
                    ['Reading star charts', 'In their first fifty years {name} read every star chart in the library twice.', 'lore'],
                    ['Dancing at moonfeasts', 'In their first fifty years {name} danced at every moonfeast and learned grace before strength.', 'agility'],
                    ['Running the forest paths', 'In their first fifty years {name} ran the forest paths from dusk to dawn.', 'swiftness'],
                ],
            ],
            'teen' => [
                'How did your restless century go?',
                [
                    ['Ran off with traders', 'In their restless century {name} ran off with a human caravan and learned the taste of salt and coin.', 'thrift'],
                    ['Studied in the towers', 'In their restless century {name} studied in the white towers and slept on the library floor.', 'arcana'],
                    ['Hunted shadow-beasts', 'In their restless century {name} hunted the shadow-beasts that creep in from the wastes.', 'ferocity'],
                    ['Kept a silent vow', 'In their restless century {name} kept a vow of silence for forty years.', 'resolve'],
                ],
            ],
            'firstfight' => [
                'When did you first draw blood?',
                [
                    ['Against orc raiders', '{name} first drew blood against orc raiders at the forest\'s edge, from a branch ninety feet up.', 'precision'],
                    ['To protect a sapling', '{name} first drew blood defending a sacred sapling from woodcutters who did not listen.', 'guard'],
                    ['Never, willingly', '{name} has never drawn blood willingly and hopes the day stays far off.', 'spirit'],
                    ['A duel of honor', '{name} first drew blood in a duel of honor with a cousin over a broken promise.', 'ferocity'],
                ],
            ],
            'mentor' => [
                'Which teacher shaped your long years?',
                [
                    ['A blind archer', '{name} learned the most from a blind archer who could hit a coin by its sound.', 'precision'],
                    ['A tower archmage', '{name} learned the most from an archmage who answered every question with a harder one.', 'insight'],
                    ['A human healer', '{name} learned the most from a human healer who lived only sixty years and wasted none of them.', 'spirit'],
                    ['The forest', '{name} learned the most from the forest itself, slowly, the way it teaches everything.', 'wisdom'],
                ],
            ],
            'leaving' => [
                'Why did you leave the forest?',
                [
                    ['A prophecy', '{name} left the forest because a seer named them in a prophecy, and staying felt like hiding.', 'insight'],
                    ['Boredom of eternity', '{name} left the forest because one more peaceful century would have been unbearable.', 'swiftness'],
                    ['Exile', '{name} left the forest in exile, for a crime they still say was the right thing to do.', 'resolve'],
                    ['To bring someone home', '{name} left the forest to find a sibling who walked away a decade ago.', 'command'],
                ],
            ],
            'deed' => [
                'What deed do the elders already sing of?',
                [
                    ['Healed a dying grove', '{name}\'s proudest deed is bringing a dying grove back from blight, one root at a time.', 'recovery'],
                    ['Mapped a new star', '{name}\'s proudest deed is charting a star no elf had ever named.', 'lore'],
                    ['Held a pass alone', '{name}\'s proudest deed is holding a forest pass alone for a night and a day.', 'tenacity'],
                    ['A perfect arrow', '{name}\'s proudest deed is the arrow that ended a wyvern at four hundred paces.', 'precision'],
                ],
            ],
            'loss' => [
                'What has the long life cost you already?',
                [
                    ['A mortal friend', 'Already {name} has outlived a mortal friend, and visits the grave each spring.', 'spirit'],
                    ['A grove burned', 'Already {name} has watched the grove of their birth burn.', 'hunger'],
                    ['Their name', 'Already {name} has lost their birth name, stripped by the elders; this one they chose.', 'resolve'],
                    ['Nothing, yet', 'So far the long life has cost {name} nothing, and that frightens them a little.', 'insight'],
                ],
            ],
            'fear' => [
                'What darkness troubles your long sleep?',
                [
                    ['Fading', '{name}\'s deepest fear is the slow fading that takes the oldest elves.', 'vitality'],
                    ['Iron and fire', '{name}\'s deepest fear is the smell of iron and smoke together.', 'agility'],
                    ['Forgetting', '{name}\'s deepest fear is forgetting the faces of the short-lived friends they loved.', 'lore'],
                    ['Haste', '{name}\'s deepest fear is acting in haste and regretting it for a thousand years.', 'focus'],
                ],
            ],
            'keepsake' => [
                'What have you carried for a hundred years?',
                [
                    ['A silver leaf', '{name} always carries a silver leaf from the tree they were born under.', 'recovery'],
                    ['A bowstring of moonsilk', '{name} always carries a spare bowstring spun from moonsilk by their mother.', 'precision'],
                    ['A human coin', '{name} always carries a copper coin from a human friend, worn smooth.', 'fortune'],
                    ['A crystal of starlight', '{name} always carries a crystal that holds one night\'s starlight.', 'arcana'],
                ],
            ],
            'drive' => [
                'What calls you onward, now that you have left?',
                [
                    ['To learn what is out there', 'What drives {name} now is a world that changes faster than any elf can learn it.', 'insight'],
                    ['To protect the forests', 'What drives {name} now is keeping the old forests standing for another thousand years.', 'guard'],
                    ['To be remembered by mortals', 'What drives {name} now is doing something mortals will still sing of when {name} is old.', 'presence'],
                    ['To mend what was broken', 'What drives {name} now is mending the rift between elves and the short-lived.', 'spirit'],
                ],
            ],
        ],
        'dwarf' => [
            'home' => 'Which dwarven hold raised you?',
            'youth' => 'What were you known for before your beard came in?',
            'grandparents' => [
                'Whose names are carved above your clan door?',
                [
                    ['A forge-master', 'Above {name}\'s clan door is carved the name of a grandparent who forged the gates of a mountain hold.', 'guard'],
                    ['An oathbreaker', 'Above {name}\'s clan door a grandparent\'s name is chiselled out: an oathbreaker, and the clan has not forgotten.', 'resolve'],
                    ['A tunnel-finder', 'Above {name}\'s clan door is carved the name of a grandparent who found the Long Road under the mountains.', 'stamina'],
                    ['A brewmaster', 'Above {name}\'s clan door is carved the name of a grandparent whose ale is still served at weddings.', 'recovery'],
                ],
            ],
            'parents' => [
                'What was your parents\' trade?',
                [
                    ['Miners', '{name}\'s parents were miners who came home every night with grey dust in their beards.', 'stamina'],
                    ['Shieldwrights', '{name}\'s parents made shields, and tested each one by hitting it with a hammer while the other held it.', 'guard'],
                    ['Gem-cutters', '{name}\'s parents cut gems for the hold\'s treasury and counted every carat twice.', 'fortune'],
                    ['Lorekeepers', '{name}\'s parents kept the clan\'s book of grudges and the book of debts, which are the same book.', 'lore'],
                ],
            ],
            'siblings' => [
                'Who filled your clan hall growing up?',
                [
                    ['A dozen cousins', '{name} grew up in a hall with a dozen cousins, one bathtub and a lot of shouting.', 'command'],
                    ['An elder sibling in the guard', '{name} grew up idolising an elder sibling in the hold guard.', 'might'],
                    ['A grumpy great-uncle', '{name} grew up mostly with a grumpy great-uncle who complained about everything and taught them everything.', 'wisdom'],
                    ['A fostered human', '{name} grew up beside a fostered human child who had to stoop in every doorway.', 'presence'],
                ],
            ],
            'birth' => [
                'What happened in the hold the day you were born?',
                [
                    ['A cave-in', '{name} was born the day of the Fifth Gallery cave-in, while every hand was digging.', 'tenacity'],
                    ['A vein of mithril', '{name} was born the day the miners struck a vein of true mithril.', 'fortune'],
                    ['The great forge relit', '{name} was born the day the great forge was relit after a hundred years cold.', 'fury'],
                    ['An earthquake', '{name} was born as the mountain shook, and the midwife swore the baby laughed.', 'vitality'],
                ],
            ],
            'friend' => [
                'Who shared your tunnels as a child?',
                [
                    ['A mine pony', '{name}\'s best friend was a stubborn mine pony called Pebble.', 'stamina'],
                    ['A gnome tinker', '{name}\'s best friend was a gnome tinker whose inventions exploded about half the time.', 'insight'],
                    ['Your shield-twin', '{name}\'s best friend was their shield-twin, born the same day and sworn to the same line.', 'guard'],
                    ['A cave spider', '{name}\'s best friend was a cave spider the size of a cat, which their parents never found out about.', 'agility'],
                ],
            ],
            'play' => [
                'What did you get up to as a wee dwarf?',
                [
                    ['Hammering anything', 'As a child {name} hammered anything that would ring, and some things that would not.', 'might'],
                    ['Exploring old tunnels', 'As a child {name} explored abandoned tunnels with a candle stub and no permission.', 'swiftness'],
                    ['Listening to sagas', 'As a child {name} sat by the fire every night for the old sagas.', 'lore'],
                    ['Counting coins', 'As a child {name} counted the family\'s coins until they could tell real gold by the ring.', 'thrift'],
                ],
            ],
            'teen' => [
                'How did your beardling years go?',
                [
                    ['Apprenticed at the forge', 'As a beardling {name} apprenticed at the forge and lost their eyebrows twice.', 'fury'],
                    ['Ran the brewery', 'As a beardling {name} ran deliveries for the brewery and tasted more than they should.', 'recovery'],
                    ['Tunnel patrol', 'As a beardling {name} walked tunnel patrol, where the darkness bites back.', 'tenacity'],
                    ['Studied runes', 'As a beardling {name} studied runes with the priests and carved their first ward.', 'arcana'],
                ],
            ],
            'firstfight' => [
                'When did you first swing in anger?',
                [
                    ['Goblins in the deep', '{name}\'s first real fight was against goblins in the deep halls, with a pick for a weapon.', 'ferocity'],
                    ['A tavern brawl', '{name}\'s first real fight was a tavern brawl over the honor of an ale.', 'vitality'],
                    ['A troll at the gate', '{name}\'s first real fight was holding a shield against a troll at the gate while others struck.', 'guard'],
                    ['A grudge duel', '{name}\'s first real fight was a grudge duel with a rival clan\'s heir, still unresolved.', 'resolve'],
                ],
            ],
            'mentor' => [
                'Which elder put the steel in your spine?',
                [
                    ['An old shieldmaster', '{name} learned the most from an old shieldmaster who taught that the wall matters more than the dwarf.', 'guard'],
                    ['A runepriest', '{name} learned the most from a runepriest who could read the stone\'s moods.', 'spirit'],
                    ['A brewer', '{name} learned the most from a brewer who said patience is just thirst with discipline.', 'focus'],
                    ['A merchant', '{name} learned the most from a merchant who traded with the surface folk and never lost a deal.', 'fortune'],
                ],
            ],
            'leaving' => [
                'Why did you leave the hold?',
                [
                    ['To settle a grudge', '{name} left the mountain to settle a grudge written in the clan book two hundred years ago.', 'hunger'],
                    ['To find new ore', '{name} left the mountain to find ore the hold has never seen.', 'stamina'],
                    ['To restore the clan name', '{name} left the mountain to wash the oathbreaker\'s shame off the clan name.', 'resolve'],
                    ['To see the sky', '{name} left the mountain simply to see the sky, and still cannot get used to it.', 'insight'],
                ],
            ],
            'deed' => [
                'What deed belongs in the clan book?',
                [
                    ['Forged a masterwork', '{name}\'s proudest deed is a masterwork blade that a king now carries.', 'might'],
                    ['Dug out survivors', '{name}\'s proudest deed is digging six miners out alive after a collapse.', 'stamina'],
                    ['Won the drinking contest', '{name}\'s proudest deed is winning the Brewhall drinking contest three years running.', 'vitality'],
                    ['Recovered a lost relic', '{name}\'s proudest deed is recovering the clan\'s lost relic from a flooded hall.', 'lore'],
                ],
            ],
            'loss' => [
                'What is written in your own book of grudges?',
                [
                    ['A shield-twin', 'Along the way {name} lost their shield-twin, and fights with an empty space at their side.', 'tenacity'],
                    ['A hold', 'Along the way {name} lost their home hold to something that crawled up from below.', 'hunger'],
                    ['A fortune', 'Along the way {name} lost a fortune to a bad deal with a smiling elf.', 'thrift'],
                    ['Nothing that matters', 'So far {name} has lost nothing that a good ale cannot fix.', 'recovery'],
                ],
            ],
            'fear' => [
                'What makes even your beard bristle?',
                [
                    ['Open sky', '{name}\'s deepest fear is the open sky, which seems ready to fall at any moment.', 'focus'],
                    ['Dishonor', '{name}\'s deepest fear is a name chiselled from above the clan door.', 'resolve'],
                    ['What lies below', '{name}\'s deepest fear is what sleeps beneath the deepest halls.', 'tenacity'],
                    ['Running dry', '{name}\'s deepest fear is an empty tankard and an empty purse on the same day.', 'fortune'],
                ],
            ],
            'keepsake' => [
                'What heirloom hangs from your belt?',
                [
                    ['A grandparent\'s hammer', '{name} always carries a grandparent\'s forge hammer, more chip than head.', 'might'],
                    ['A rune-stone', '{name} always carries a rune-stone that warms when danger is near.', 'arcana'],
                    ['A beard bead', '{name} always carries a gold beard bead from their clan\'s first hoard.', 'fortune'],
                    ['A flask of home brew', '{name} always carries a flask of Brewhall stout for emergencies.', 'recovery'],
                ],
            ],
            'drive' => [
                'What keeps your forge lit now?',
                [
                    ['The clan\'s honor', 'What drives {name} now is the honor of the clan, measured in deeds and grudges settled.', 'resolve'],
                    ['Gold', 'What drives {name} now is gold, honestly earned and loudly counted.', 'fortune'],
                    ['The perfect craft', 'What drives {name} now is making one thing that will outlast the mountain.', 'focus'],
                    ['A home for the lost', 'What drives {name} now is building a new hold for dwarves who lost theirs.', 'command'],
                ],
            ],
        ],
        'orc' => [
            'home' => 'Which clan raised you?',
            'youth' => 'What were you known for in the clan?',
            'grandparents' => [
                'What deeds do the drums still beat for your grandparents?',
                [
                    ['A warchief', 'The drums still beat for {name}\'s grandparent, a warchief who united nine clans for one summer.', 'command'],
                    ['A shaman who saw the end', 'The drums still beat for {name}\'s grandparent, a shaman who foresaw the burning of the steppe.', 'spirit'],
                    ['A peacemaker', 'The drums still beat, quietly, for {name}\'s grandparents, who made peace with the humans and were called cowards for it.', 'resolve'],
                    ['Beast-riders', 'The drums still beat for {name}\'s grandparents, who rode wolves into battle and never lost one.', 'swiftness'],
                ],
            ],
            'parents' => [
                'How did your parents serve the clan?',
                [
                    ['Hunters', '{name}\'s parents were hunters who brought back meat when no one else could.', 'precision'],
                    ['Smiths of black iron', '{name}\'s parents worked black iron at the clan forge, sparks in their tusks.', 'might'],
                    ['Storytellers', '{name}\'s parents carried the clan\'s story from fire to fire.', 'lore'],
                    ['Fallen in battle', '{name}\'s parents fell in battle before {name} could walk; the whole clan raised the child.', 'tenacity'],
                ],
            ],
            'siblings' => [
                'Who shared your tent growing up?',
                [
                    ['A litter of rivals', '{name} grew up in a litter of five, fighting for every scrap and every scrap of praise.', 'ferocity'],
                    ['A sickly sibling', '{name} grew up protecting a sickly sibling who was smarter than the whole clan.', 'guard'],
                    ['The war-pups', '{name} grew up with the clan\'s war-pups, the orphans of every battle.', 'command'],
                    ['A tame boar', '{name} grew up mostly with a tame boar, who was better company than most orcs.', 'vitality'],
                ],
            ],
            'birth' => [
                'What omen came with your birth?',
                [
                    ['A blood moon', '{name} was born under a blood moon, and the elders made the sign against bad luck.', 'fury'],
                    ['Thunder without rain', '{name} was born to thunder without rain, and the shamans took notice.', 'arcana'],
                    ['A wolf howling', 'On the night {name} was born a lone wolf sat outside the tent and howled until dawn.', 'swiftness'],
                    ['Ash falling', '{name} was born as ash fell like snow from the burning hills.', 'tenacity'],
                ],
            ],
            'friend' => [
                'Who did you trust most as a whelp?',
                [
                    ['A wolf cub', '{name}\'s best friend was a wolf cub that grew into a mount the size of a pony.', 'swiftness'],
                    ['A captured human', '{name}\'s best friend was a captured human child who taught them letters in secret.', 'insight'],
                    ['The shaman\'s apprentice', '{name}\'s best friend was the shaman\'s apprentice, who spoke to spirits and was afraid of the dark.', 'spirit'],
                    ['A sworn enemy', '{name}\'s best friend was the child of a rival clan, met at a truce and never told anyone.', 'presence'],
                ],
            ],
            'play' => [
                'How did you spend your whelp years?',
                [
                    ['Wrestling', 'As a child {name} wrestled everyone who would stand still long enough.', 'might'],
                    ['Drumming', 'As a child {name} drummed on every hollow thing until the elders gave them a real drum.', 'fury'],
                    ['Tracking', 'As a child {name} tracked rabbits, then deer, then once a very surprised bear.', 'precision'],
                    ['Racing the wind', 'As a child {name} raced the steppe winds and sometimes won.', 'stamina'],
                ],
            ],
            'teen' => [
                'How did your blood-trial years go?',
                [
                    ['Passed the trial early', '{name} passed the blood trial a year early and has the scars to prove it.', 'ferocity'],
                    ['Failed, then passed', '{name} failed the blood trial once, came back the next year and passed it twice over.', 'resolve'],
                    ['Chose the shaman\'s path', '{name} turned from the blood trial to learn the shaman\'s path instead.', 'spirit'],
                    ['Ran with outcasts', '{name} ran with clanless outcasts for a wild year and came back changed.', 'hunger'],
                ],
            ],
            'firstfight' => [
                'Tell of your first blood.',
                [
                    ['Against a human patrol', '{name}\'s first real fight was against a human patrol that came too far onto the steppe.', 'might'],
                    ['Against a sand-wyrm', '{name}\'s first real fight was against a sand-wyrm that ate the clan\'s goats.', 'vitality'],
                    ['Against a clanmate', '{name}\'s first real fight was against a clanmate who mocked their mother, and it is still talked about.', 'fury'],
                    ['Saved a rival', '{name}\'s first real fight was saving a rival from raiders, which neither of them mentions.', 'guard'],
                ],
            ],
            'mentor' => [
                'Who hardened you most?',
                [
                    ['A one-eyed veteran', '{name} learned the most from a one-eyed veteran who said a scar is a lesson you can wear.', 'tenacity'],
                    ['The clan shaman', '{name} learned the most from the clan shaman, who smelled of smoke and spoke in riddles.', 'wisdom'],
                    ['A human prisoner', '{name} learned the most from a human prisoner who taught them about the world beyond the steppe.', 'insight'],
                    ['Hunger', '{name} learned the most from hunger, the oldest teacher on the steppe.', 'hunger'],
                ],
            ],
            'leaving' => [
                'Why did you leave the clan?',
                [
                    ['Exiled for mercy', '{name} left the clan in exile, for sparing an enemy the chief wanted dead.', 'resolve'],
                    ['To earn a war-name', '{name} left the clan to earn a war-name worth bringing home.', 'ferocity'],
                    ['Sent as an envoy', '{name} left the clan as an envoy to the cities, and stayed longer than anyone planned.', 'presence'],
                    ['The steppe burned', '{name} left when the steppe burned and there was no clan left to stay with.', 'tenacity'],
                ],
            ],
            'deed' => [
                'What deed should the drums beat for?',
                [
                    ['Slew a great beast', '{name}\'s proudest deed is slaying the great boar that killed three hunters.', 'might'],
                    ['Ended a feud', '{name}\'s proudest deed is ending a blood feud that had lasted four generations.', 'command'],
                    ['Called the rain', '{name}\'s proudest deed is the night the rain came after they danced until dawn.', 'spirit'],
                    ['Won the great race', '{name}\'s proudest deed is winning the great wolf race across the red steppe.', 'swiftness'],
                ],
            ],
            'loss' => [
                'What did the steppe take from you?',
                [
                    ['A war-brother', 'Along the way {name} lost a war-brother, and carries one of their tusks.', 'hunger'],
                    ['The clan', 'Along the way {name} lost the clan itself, scattered to the winds.', 'tenacity'],
                    ['Their temper\'s victim', 'Along the way {name} lost a friend to their own temper, and has not forgiven themself.', 'focus'],
                    ['Nothing yet', 'So far {name} has lost nothing, and the shaman says that is the most dangerous luck.', 'insight'],
                ],
            ],
            'fear' => [
                'What makes even an orc go quiet?',
                [
                    ['Dying old', '{name}\'s deepest fear is dying old in a bed, far from any fight.', 'ferocity'],
                    ['The ancestors\' silence', '{name}\'s deepest fear is calling on the ancestors and hearing nothing.', 'spirit'],
                    ['Their own rage', '{name}\'s deepest fear is the red rage, and what it did once.', 'focus'],
                    ['Being caged', '{name}\'s deepest fear is walls and chains, ever since the human prison.', 'agility'],
                ],
            ],
            'keepsake' => [
                'What trophy do you never take off?',
                [
                    ['A tusk on a cord', '{name} always carries a fallen friend\'s tusk on a cord around their neck.', 'fury'],
                    ['A clan drum', '{name} always carries a small clan drum, beaten at every victory.', 'command'],
                    ['A spirit fetish', '{name} always carries a fetish of bone and feathers that the shaman blessed.', 'spirit'],
                    ['A human book', '{name} always carries a human book they still cannot fully read.', 'lore'],
                ],
            ],
            'drive' => [
                'What hunger drives you now?',
                [
                    ['Glory', 'What drives {name} now is glory, the kind the drums beat for.', 'ferocity'],
                    ['A new home for the clan', 'What drives {name} now is finding land where the clan can live again.', 'command'],
                    ['Proving the old ways wrong', 'What drives {name} now is proving an orc can be more than a warrior.', 'insight'],
                    ['Vengeance', 'What drives {name} now is a name, and the day they meet its owner.', 'hunger'],
                ],
            ],
        ],
        'felkin' => [
            'home' => 'Which pride raised you?',
            'youth' => 'What were you known for as a kit?',
            'grandparents' => [
                'What tales does the family purr about your grandparents?',
                [
                    ['Cat-burglars of legend', 'The family still purrs about {name}\'s grandparents, who stole the Sultan\'s sapphire and returned it for a bet.', 'agility'],
                    ['Caravan masters', 'The family still purrs about {name}\'s grandparents, who led caravans across the Endless Dunes forty times.', 'stamina'],
                    ['Temple guardians', 'The family still purrs about {name}\'s grandparents, who guarded the Sun Temple\'s sacred cats, who were not amused.', 'guard'],
                    ['Nine-lived adventurers', 'The family still purrs about {name}\'s grandparent who used up eight lives and retired very carefully on the ninth.', 'tenacity'],
                ],
            ],
            'parents' => [
                'How did your parents fill the family bowl?',
                [
                    ['Spice traders', '{name}\'s parents traded spices, and {name} grew up sneezing in a cloud of saffron.', 'thrift'],
                    ['Night watch', '{name}\'s parents walked the village night watch, eyes glowing on the rooftops.', 'precision'],
                    ['Herbalists', '{name}\'s parents grew herbs in window boxes on every sill of the village.', 'recovery'],
                    ['Acrobats', '{name}\'s parents were traveling acrobats who could land on their feet from any height, mostly.', 'agility'],
                ],
            ],
            'siblings' => [
                'Who was in your litter?',
                [
                    ['Five littermates', '{name} was one of a litter of five, and still sleeps best in a pile.', 'command'],
                    ['The runt', '{name} was the runt of the litter and learned to be quicker than anyone bigger.', 'swiftness'],
                    ['A littermate who left', '{name}\'s favorite littermate left to join the Moonclaw and never wrote back.', 'focus'],
                    ['A single kit', '{name} was a single kit, spoiled rotten, and only slightly ashamed of it.', 'presence'],
                ],
            ],
            'birth' => [
                'What happened the night you were born?',
                [
                    ['A full moon', '{name} was born under a full moon, which the Moonclaw say makes a hunter.', 'ferocity'],
                    ['A sandstorm', '{name} was born in a sandstorm that buried half the camp.', 'tenacity'],
                    ['Nine stars aligned', '{name} was born as nine stars aligned, and the elders spent nine days arguing what it meant.', 'arcana'],
                    ['Stolen at birth', '{name} was stolen from the cradle by a jealous neighbor and returned the next day with a gift.', 'fortune'],
                ],
            ],
            'friend' => [
                'Who was your best friend as a kit?',
                [
                    ['A fennec fox', '{name}\'s best friend was a fennec fox with ears bigger than its sense.', 'agility'],
                    ['A sand-lizard', '{name}\'s best friend was a sand-lizard that liked to sleep on their head.', 'stamina'],
                    ['The healer\'s grandchild', '{name}\'s best friend was the healer\'s grandchild, who patched up every scraped knee.', 'spirit'],
                    ['A human trader\'s kid', '{name}\'s best friend was a human trader\'s kid who could never keep up on the rooftops.', 'presence'],
                ],
            ],
            'play' => [
                'What did you love most as a kit?',
                [
                    ['Rooftop chases', 'As a kit {name} chased anything across the rooftops, mostly birds, sometimes guards.', 'swiftness'],
                    ['Napping in the sun', 'As a kit {name} perfected the art of the sunlit nap, which is harder than it looks.', 'recovery'],
                    ['Shiny things', 'As a kit {name} collected anything shiny and kept it in a hidden box.', 'fortune'],
                    ['Hunting games', 'As a kit {name} played hunting games until even the dogs were nervous.', 'precision'],
                ],
            ],
            'teen' => [
                'How were your young-claw years?',
                [
                    ['Picked pockets', 'As a young claw {name} picked pockets in the bazaar, and gave most of it back. Most.', 'precision'],
                    ['Ran with a caravan', 'As a young claw {name} ran with a caravan across the dunes and learned every star by name.', 'stamina'],
                    ['Learned to heal', 'As a young claw {name} learned healing at the village hearth.', 'spirit'],
                    ['Fell in love', 'As a young claw {name} fell in love with a moon-dancer and wrote very bad poetry about it.', 'presence'],
                ],
            ],
            'firstfight' => [
                'When did you first show your claws?',
                [
                    ['A sand-scorpion', '{name}\'s first real fight was against a sand-scorpion the size of a cart.', 'agility'],
                    ['A gang of thieves', '{name}\'s first real fight was against a thieves\' gang that tried to take their turf.', 'ferocity'],
                    ['Protecting kits', '{name}\'s first real fight was standing over a nest of kits while slavers came.', 'guard'],
                    ['Pounced and fled', '{name}\'s first real fight was one pounce, one scratch and a very fast exit.', 'swiftness'],
                ],
            ],
            'mentor' => [
                'Who taught you to land on your feet?',
                [
                    ['An old cat-burglar', '{name} learned the most from a retired cat-burglar who taught that silence is a skill.', 'agility'],
                    ['A sand-priestess', '{name} learned the most from a sand-priestess who read fortunes in the dunes.', 'wisdom'],
                    ['The village healer', '{name} learned the most from the village healer, who never hurried and never stopped.', 'recovery'],
                    ['A caravan master', '{name} learned the most from a caravan master who could smell a bad deal at a mile.', 'thrift'],
                ],
            ],
            'leaving' => [
                'Why did you leave the pride?',
                [
                    ['Curiosity', '{name} left home out of curiosity, which everyone warned them about.', 'insight'],
                    ['A debt to repay', '{name} left home to repay a debt to a caravan master who saved the family.', 'thrift'],
                    ['Following the moon', '{name} left home following a dream of the moon that came nine nights in a row.', 'arcana'],
                    ['Chased out', '{name} left home after a prank went too far and the elders suggested a long journey.', 'swiftness'],
                ],
            ],
            'deed' => [
                'Which tale do you tell to win a free drink?',
                [
                    ['Stole back a relic', '{name}\'s proudest deed is stealing back the village\'s sacred bell from a bandit lord.', 'agility'],
                    ['Crossed the Endless Dunes', '{name}\'s proudest deed is crossing the Endless Dunes alone in nine days.', 'stamina'],
                    ['Saved a plague village', '{name}\'s proudest deed is nursing a whole village through the sand plague.', 'spirit'],
                    ['Hunted a ghost-cat', '{name}\'s proudest deed is tracking the ghost-cat of the high roofs and living to tell it.', 'precision'],
                ],
            ],
            'loss' => [
                'Which life did you already use up?',
                [
                    ['A fall', '{name} already used one life on a fall from the temple roof, and still twitches at heights.', 'tenacity'],
                    ['A fever', '{name} already used one life on a desert fever, nursed back by a stranger.', 'recovery'],
                    ['A duel', '{name} already used one life in a duel they should have walked away from.', 'focus'],
                    ['None yet', '{name} has all nine lives left, and spends them carelessly.', 'ferocity'],
                ],
            ],
            'fear' => [
                'What makes your fur stand on end?',
                [
                    ['Water', '{name}\'s deepest fear is deep water, which is a very sensible fear.', 'agility'],
                    ['Being caged', '{name}\'s deepest fear is a cage, ever since the slavers.', 'resolve'],
                    ['Boredom', '{name}\'s deepest fear is a long, quiet, boring life.', 'swiftness'],
                    ['The last life', '{name}\'s deepest fear is not knowing which life is the last one.', 'tenacity'],
                ],
            ],
            'keepsake' => [
                'What shiny thing do you never let go of?',
                [
                    ['A bell collar', '{name} always carries a little bell from their first collar, wrapped so it never rings.', 'agility'],
                    ['A box of shinies', '{name} always carries a box of shiny trinkets, each with a story.', 'fortune'],
                    ['A healer\'s pouch', '{name} always carries the village healer\'s herb pouch.', 'recovery'],
                    ['A moon-charm', '{name} always carries a silver moon-charm that glows faintly at night.', 'arcana'],
                ],
            ],
            'drive' => [
                'What are you chasing now?',
                [
                    ['Adventure', 'What drives {name} now is the next adventure, and the one after that.', 'swiftness'],
                    ['Treasure', 'What drives {name} now is treasure, preferably shiny.', 'fortune'],
                    ['Protecting the village', 'What drives {name} now is keeping the village fire burning.', 'guard'],
                    ['Knowing everything', 'What drives {name} now is curiosity, which has not killed them yet.', 'insight'],
                ],
            ],
        ],
        'draka' => [
            'home' => 'Which flight raised you?',
            'youth' => 'What were you known for as a hatchling?',
            'grandparents' => [
                'What do the ember-songs say of your grandparents?',
                [
                    ['Dragon-speakers', 'The ember-songs say {name}\'s grandparents spoke with the last true dragon before it slept.', 'lore'],
                    ['Volcano-divers', 'The ember-songs say {name}\'s grandparents dove into the volcano\'s heart and came back with fire in their eyes.', 'fury'],
                    ['Forge-founders', 'The ember-songs say {name}\'s grandparents laid the first stone of the great forge.', 'guard'],
                    ['Sky-wanderers', 'The ember-songs say {name}\'s grandparents flew beyond the clouds and saw the world\'s curve.', 'swiftness'],
                ],
            ],
            'parents' => [
                'What duty did your parents hold in the flight?',
                [
                    ['Forge-tenders', '{name}\'s parents tended the great forge and slept beside it on cold nights.', 'vitality'],
                    ['Flame-speakers', '{name}\'s parents spoke for the clan at the fire councils.', 'presence'],
                    ['Egg-wardens', '{name}\'s parents guarded the clan\'s egg chamber, the most honored duty of all.', 'guard'],
                    ['Sky-hunters', '{name}\'s parents hunted mountain goats from the air.', 'precision'],
                ],
            ],
            'siblings' => [
                'Who hatched in your clutch?',
                [
                    ['A clutch of seven', '{name} hatched from a clutch of seven, and was the last one out of the shell.', 'tenacity'],
                    ['The first to hatch', '{name} was the first of the clutch to hatch, and never let the others forget it.', 'command'],
                    ['A cold egg', '{name} hatched from an egg everyone thought had gone cold.', 'resolve'],
                    ['Twin hatchlings', '{name} hatched from the same egg as a twin, scales of different colors.', 'focus'],
                ],
            ],
            'birth' => [
                'What happened the day you hatched?',
                [
                    ['An eruption', '{name} hatched the day the volcano erupted, and the egg was found in warm ash.', 'fury'],
                    ['A dragon\'s roar', '{name} hatched as a roar shook the mountain, though no dragon has woken in a thousand years.', 'arcana'],
                    ['A snowstorm', '{name} hatched in a snowstorm, the coldest day of the century.', 'vitality'],
                    ['A visitor from the sky', '{name} hatched as an old sky-rider landed with news no one remembers.', 'swiftness'],
                ],
            ],
            'friend' => [
                'Who was your best friend as a hatchling?',
                [
                    ['A fire-salamander', '{name}\'s best friend was a fire-salamander that lived in the hearth.', 'recovery'],
                    ['A clutch-sibling', '{name}\'s best friend was a clutch-sibling who dared them into everything.', 'ferocity'],
                    ['A mountain hawk', '{name}\'s best friend was a mountain hawk that taught them to ride the wind.', 'swiftness'],
                    ['An old forge-keeper', '{name}\'s best friend was an old forge-keeper who talked to the flames.', 'wisdom'],
                ],
            ],
            'play' => [
                'What did you love most as a hatchling?',
                [
                    ['Breathing sparks', 'As a hatchling {name} practiced breathing sparks and set the curtains alight more than once.', 'arcana'],
                    ['Gliding off cliffs', 'As a hatchling {name} glided off cliffs long before their wings were ready.', 'agility'],
                    ['Sitting in the forge', 'As a hatchling {name} sat in the forge\'s warmth for hours, watching metal glow.', 'focus'],
                    ['Hoarding', 'As a hatchling {name} kept a small hoard of coins, buttons and one stolen spoon.', 'fortune'],
                ],
            ],
            'teen' => [
                'How did your molting years go?',
                [
                    ['First flight', 'During their molting years {name} made their first true flight, right into a storm.', 'swiftness'],
                    ['Forge apprentice', 'During their molting years {name} apprenticed at the great forge.', 'might'],
                    ['Ember-mending', 'During their molting years {name} learned to mend wounds with gentle flame.', 'spirit'],
                    ['Got into fights', 'During their molting years {name} got into fights with every clutch-mate who looked at them wrong.', 'fury'],
                ],
            ],
            'firstfight' => [
                'When did your fire first burn in anger?',
                [
                    ['A wyvern', '{name}\'s first real fight was against a wyvern that raided the goat pens.', 'ferocity'],
                    ['Egg-thieves', '{name}\'s first real fight was against egg-thieves in the nesting caves.', 'guard'],
                    ['A rival in the air', '{name}\'s first real fight was an aerial duel with a rival, won with a dive.', 'agility'],
                    ['Lost control', '{name}\'s first real fight ended when their fire went wild and burned both sides.', 'arcana'],
                ],
            ],
            'mentor' => [
                'Who taught you to master your flame?',
                [
                    ['A scarred sky-rider', '{name} learned the most from a scarred sky-rider who flew one-winged.', 'tenacity'],
                    ['The forge-master', '{name} learned the most from the forge-master, who said heat is just patience made visible.', 'focus'],
                    ['A flame-speaker', '{name} learned the most from an old flame-speaker who healed with warmth.', 'spirit'],
                    ['A human scholar', '{name} learned the most from a human scholar who studied dragons and survived the experience.', 'lore'],
                ],
            ],
            'leaving' => [
                'Why did you leave the peaks?',
                [
                    ['To find the dragons', '{name} left the mountain to find out whether any true dragons still sleep.', 'lore'],
                    ['Exiled for a fire', '{name} left the mountain after a fire they started burned the egg-warden\'s hall.', 'resolve'],
                    ['To bring back fire', '{name} left the mountain because the great forge is cooling and someone must find why.', 'insight'],
                    ['Too big for the nest', '{name} left the mountain because they simply did not fit anymore.', 'vitality'],
                ],
            ],
            'deed' => [
                'Which deed belongs in the ember-songs?',
                [
                    ['Relit a dying forge', '{name}\'s proudest deed is relighting a dying forge with their own breath.', 'fury'],
                    ['Rescued a clutch', '{name}\'s proudest deed is carrying a whole clutch of eggs out of a collapsing cave.', 'guard'],
                    ['Flew the Great Updraft', '{name}\'s proudest deed is riding the Great Updraft to the top of the sky.', 'swiftness'],
                    ['Healed a burned village', '{name}\'s proudest deed is tending a burned human village back to health.', 'spirit'],
                ],
            ],
            'loss' => [
                'What has the world beyond the peaks taken from you?',
                [
                    ['A wing-friend', 'Along the way {name} lost a wing-friend in a storm over the peaks.', 'tenacity'],
                    ['Their hoard', 'Along the way {name} lost their hoard to a clever thief, and has not stopped looking.', 'hunger'],
                    ['The forge\'s trust', 'Along the way {name} lost the forge-master\'s trust, and wants it back.', 'resolve'],
                    ['Nothing yet', 'So far {name} has lost nothing, and guards that luck like a hoard.', 'fortune'],
                ],
            ],
            'fear' => [
                'What could cool even your fire?',
                [
                    ['Going cold', '{name}\'s deepest fear is the inner fire going cold.', 'vitality'],
                    ['Their own flame', '{name}\'s deepest fear is their own flame, since the day it ran wild.', 'focus'],
                    ['Grounded', '{name}\'s deepest fear is broken wings and a life on the ground.', 'agility'],
                    ['Water', '{name}\'s deepest fear is deep cold water that puts out every fire.', 'tenacity'],
                ],
            ],
            'keepsake' => [
                'What lies at the bottom of your hoard pouch?',
                [
                    ['An eggshell shard', '{name} always carries a shard of the egg they hatched from.', 'resolve'],
                    ['A forge-coal', '{name} always carries a forge coal that never quite goes out.', 'fury'],
                    ['A dragon scale', '{name} always carries a scale they swear came from a true dragon.', 'arcana'],
                    ['A small hoard', '{name} always carries a small hoard in a pouch, counted every night.', 'fortune'],
                ],
            ],
            'drive' => [
                'What do you fly toward now?',
                [
                    ['Waking the dragons', 'What drives {name} now is the dream of waking the dragons.', 'lore'],
                    ['A greater hoard', 'What drives {name} now is a hoard big enough to sleep on.', 'fortune'],
                    ['Keeping the fire', 'What drives {name} now is keeping the great forge burning for the next clutch.', 'guard'],
                    ['The open sky', 'What drives {name} now is the open sky and everything under it.', 'swiftness'],
                ],
            ],
        ],
    ];

    public static function ids(): array
    {
        return array_merge(...array_column(self::CHAPTERS, 1));
    }

    /**
     * Checks a story from the creator and returns it cleaned: [answers => [qid => index | culture | backstory], notes].
     * Throws GameError-friendly messages through \InvalidArgumentException.
     */
    public static function clean(string $race, mixed $story): array
    {
        $q = self::QUESTIONS[$race] ?? null;
        $answers = is_array($story) && is_array($story['answers'] ?? null) ? $story['answers'] : [];
        if ($q === null) {
            throw new \InvalidArgumentException('Pick a race.');
        }
        $out = [];
        foreach (self::ids() as $id) {
            $a = $answers[$id] ?? null;
            if ($id === 'home') {
                if (!is_string($a) || !isset(Heritage::TREES[$race]['cultures'][$a])) {
                    throw new \InvalidArgumentException('Tell your story: '.$q['home']);
                }
            } elseif ($id === 'youth') {
                $b = is_string($a) ? (Heritage::backstories($race)[$a] ?? null) : null;
                if ($b === null || $b[1] !== ($out['home'] ?? null)) {
                    throw new \InvalidArgumentException('Tell your story: '.$q['youth']);
                }
            } elseif (!is_int($a) || !isset($q[$id][1][$a])) {
                throw new \InvalidArgumentException('Tell your story: '.$q[$id][0]);
            }
            $out[$id] = $a;
        }
        $notes = is_array($story) && is_string($story['notes'] ?? null) ? $story['notes'] : '';
        $notes = trim(preg_replace('/\s+/u', ' ', strip_tags($notes)) ?? '');

        return ['answers' => $out, 'notes' => mb_substr($notes, 0, self::NOTES_MAX)];
    }

    /** The attributes a story leans to: the three it names most (earliest first on a tie), +2 each. */
    public static function lean(string $race, array $story): array
    {
        $count = [];
        foreach ($story['answers'] ?? [] as $id => $a) {
            $attr = is_int($a) ? (self::QUESTIONS[$race][$id][1][$a][2] ?? null) : null;
            if ($attr !== null) {
                $count[$attr] = ($count[$attr] ?? 0) + 1;
            }
        }
        $order = array_flip(array_keys($count));
        uksort($count, fn ($a, $b) => [$count[$b], $order[$a]] <=> [$count[$a], $order[$b]]);

        return array_fill_keys(array_slice(array_keys($count), 0, self::LEAN_ATTRS), self::LEAN_POINTS);
    }

    /** The story as prose: [[chapter title, paragraph], ...]. */
    public static function biography(string $race, string $name, array $story): array
    {
        $q = self::QUESTIONS[$race];
        $out = [];
        foreach (self::CHAPTERS as [$title, $ids]) {
            $lines = [];
            foreach ($ids as $id) {
                $a = $story['answers'][$id] ?? null;
                if ($id === 'home' && is_string($a) && isset(Heritage::TREES[$race]['cultures'][$a])) {
                    [$cname, $theme] = Heritage::TREES[$race]['cultures'][$a];
                    $lines[] = sprintf('%s was raised among the %s: %s.', $name, $cname, lcfirst($theme));
                } elseif ($id === 'youth' && is_string($a) && ($b = Heritage::backstories($race)[$a] ?? null)) {
                    $lines[] = sprintf('Everyone in %s knew %s as the %s. %s', Heritage::TREES[$race]['cultures'][$b[1]][0], $name, $b[0], $b[3]);
                } elseif (is_int($a) && isset($q[$id][1][$a])) {
                    $lines[] = str_replace('{name}', $name, $q[$id][1][$a][1]);
                }
            }
            if ($lines) {
                $out[] = [$title, implode(' ', $lines)];
            }
        }
        if (($story['notes'] ?? '') !== '') {
            $out[] = ['In their own words', $story['notes']];
        }

        return $out;
    }

    /** A complete story for demo heroes and tests: the given backstory, and answers picked by a seed. */
    public static function example(string $race, string $backstory, int $seed = 0): array
    {
        $answers = [];
        foreach (self::ids() as $i => $id) {
            $answers[$id] = match ($id) {
                'home' => Heritage::backstories($race)[$backstory][1],
                'youth' => $backstory,
                default => ($seed + $i * 3) % 4,
            };
        }

        return ['answers' => $answers, 'notes' => ''];
    }
}

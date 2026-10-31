<?php

namespace App\Command;

use Doctrine\DBAL\Schema\Column;
use Doctrine\DBAL\Schema\Schema;
use Doctrine\DBAL\Schema\Table;
use Doctrine\DBAL\Types\Type;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * Writes the next migration in Doctrine's schema API instead of SQL, so one file works on SQLite, MySQL and Postgres.
 * It replays every migration in migrations/ on an empty schema, compares that with the entity mapping and writes the
 * difference: new tables, columns, indexes and foreign keys, changed columns, and dropped columns and tables.
 * Read the generated file before committing it: a rename shows up as a drop plus an add. A NOT NULL column added to a
 * table that already has rows needs a default in its mapping (options: ['default' => ...]); the command refuses
 * otherwise, since Postgres and SQLite cannot add it.
 */
#[AsCommand(name: 'app:migration', description: 'Write a database-neutral migration for the entity changes')]
class PortableMigrationCommand extends Command
{
    public function __construct(private EntityManagerInterface $em)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('description', InputArgument::REQUIRED, 'One line saying what the migration does');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $dir = dirname(__DIR__, 2).'/migrations';
        $base = new Schema();
        $files = glob($dir.'/Version*.php') ?: [];
        sort($files);
        foreach ($files as $file) {
            require_once $file;
            $class = 'DoctrineMigrations\\'.basename($file, '.php');
            (new \ReflectionClass($class))->newInstanceWithoutConstructor()->up($base);
        }
        $want = (new SchemaTool($this->em))->getSchemaFromMetadata($this->em->getMetadataFactory()->getAllMetadata());

        [$up, $down] = $this->diff($base, $want);
        if (!$up) {
            $output->writeln('The migrations already match the entities.');

            return Command::SUCCESS;
        }
        $version = 'Version'.gmdate('YmdHis');
        $code = "<?php\n\ndeclare(strict_types=1);\n\nnamespace DoctrineMigrations;\n\nuse Doctrine\\DBAL\\Schema\\Schema;\nuse Doctrine\\Migrations\\AbstractMigration;\n\n/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */\nfinal class $version extends AbstractMigration\n{\n    public function getDescription(): string\n    {\n        return ".self::ex((string) $input->getArgument('description')).";\n    }\n\n    public function up(Schema \$schema): void\n    {\n".implode("\n", $up)."\n    }\n\n    public function down(Schema \$schema): void\n    {\n".implode("\n", $down)."\n    }\n}\n";
        file_put_contents("$dir/$version.php", $code);
        $output->writeln("Wrote migrations/$version.php. Read it, then run doctrine:migrations:migrate.");

        return Command::SUCCESS;
    }

    /** @return array{string[], string[]} lines of up() and down() */
    private function diff(Schema $from, Schema $to): array
    {
        $up = $down = $fks = $downFks = [];
        $tables = $to->getTables();
        usort($tables, fn ($a, $b) => strcmp($a->getName(), $b->getName()));
        foreach ($tables as $t) {
            $n = $t->getName();
            if (!$from->hasTable($n)) {
                $up[] = '        $t = $schema->createTable('.self::ex($n).');';
                foreach ($t->getColumns() as $c) {
                    $up[] = '        $t->addColumn('.self::ex($c->getName()).', '.self::ex(Type::lookupName($c->getType())).self::opts($c).');';
                }
                foreach ($t->getIndexes() as $i) {
                    $up[] = '        '.self::index('$t', $i);
                }
                foreach ($t->getForeignKeys() as $fk) {
                    $fks[] = self::fk($n, $fk);
                }
                $down[] = '        $schema->dropTable('.self::ex($n).');';
                continue;
            }
            $old = $from->getTable($n);
            $tv = '$schema->getTable('.self::ex($n).')';
            foreach ($t->getColumns() as $c) {
                $cn = $c->getName();
                if (!$old->hasColumn($cn)) {
                    if ($c->getNotnull() && $c->getDefault() === null) {
                        throw new \RuntimeException("Column $n.$cn is NOT NULL without a default. Give it options: ['default' => ...] in the entity, or make it nullable.");
                    }
                    $up[] = "        {$tv}->addColumn(".self::ex($cn).', '.self::ex(Type::lookupName($c->getType())).self::opts($c).');';
                    $down[] = "        {$tv}->dropColumn(".self::ex($cn).');';
                } elseif (self::sig($old->getColumn($cn)) !== self::sig($c)) {
                    $up[] = "        {$tv}->modifyColumn(".self::ex($cn).', '.self::ex(['type' => Type::getType(Type::lookupName($c->getType()))] + self::optArray($c)).');';
                    $o = $old->getColumn($cn);
                    $down[] = "        {$tv}->modifyColumn(".self::ex($cn).', '.self::ex(['type' => Type::getType(Type::lookupName($o->getType()))] + self::optArray($o)).');';
                }
            }
            foreach ($old->getColumns() as $c) {
                if (!$t->hasColumn($c->getName())) {
                    $up[] = "        {$tv}->dropColumn(".self::ex($c->getName()).');';
                    $down[] = "        {$tv}->addColumn(".self::ex($c->getName()).', '.self::ex(Type::lookupName($c->getType())).self::opts($c).');';
                }
            }
            foreach ($t->getIndexes() as $i) {
                if (!$i->isPrimary() && !$old->hasIndex($i->getName())) {
                    $up[] = '        '.self::index($tv, $i);
                    $down[] = "        {$tv}->dropIndex(".self::ex($i->getName()).');';
                }
            }
            foreach ($t->getForeignKeys() as $fk) {
                if (!$old->hasForeignKey($fk->getName())) {
                    $fks[] = self::fk($n, $fk);
                    $downFks[] = "        {$tv}->removeForeignKey(".self::ex($fk->getName()).');';
                }
            }
        }
        foreach ($from->getTables() as $t) {
            if (!$to->hasTable($t->getName())) {
                $up[] = '        $schema->dropTable('.self::ex($t->getName()).');';
                $down[] = '        // Table '.$t->getName().' was dropped; recreate it by hand if you need to roll back.';
            }
        }

        return [[...$up, ...$fks], [...$downFks, ...array_reverse($down)]];
    }

    private static function sig(Column $c): string
    {
        return Type::lookupName($c->getType()).json_encode(self::optArray($c));
    }

    private static function optArray(Column $c): array
    {
        $o = [];
        if (!$c->getNotnull()) {
            $o['notnull'] = false;
        }
        if ($c->getLength() !== null) {
            $o['length'] = $c->getLength();
        }
        if (Type::lookupName($c->getType()) === 'decimal') {
            $o['precision'] = $c->getPrecision();
            $o['scale'] = $c->getScale();
        }
        if ($c->getDefault() !== null) {
            $o['default'] = $c->getDefault();
        }
        if ($c->getAutoincrement()) {
            $o['autoincrement'] = true;
        }
        if ($c->getUnsigned()) {
            $o['unsigned'] = true;
        }
        if ($c->getFixed()) {
            $o['fixed'] = true;
        }

        return $o;
    }

    private static function opts(Column $c): string
    {
        $o = self::optArray($c);

        return $o ? ', '.self::ex($o) : '';
    }

    private static function index(string $tv, \Doctrine\DBAL\Schema\Index $i): string
    {
        $cols = self::ex($i->getColumns());

        return match (true) {
            $i->isPrimary() => "{$tv}->setPrimaryKey($cols);",
            $i->isUnique() => "{$tv}->addUniqueIndex($cols, ".self::ex($i->getName()).');',
            default => "{$tv}->addIndex($cols, ".self::ex($i->getName()).');',
        };
    }

    private static function fk(string $table, \Doctrine\DBAL\Schema\ForeignKeyConstraint $fk): string
    {
        $o = $fk->getOptions();
        $opts = isset($o['onDelete']) ? ['onDelete' => $o['onDelete']] : [];

        return '        $schema->getTable('.self::ex($table).')->addForeignKeyConstraint('.self::ex($fk->getForeignTableName()).', '.self::ex($fk->getLocalColumns()).', '.self::ex($fk->getForeignColumns()).', '.self::ex($opts).', '.self::ex($fk->getName()).');';
    }

    private static function ex(mixed $v): string
    {
        if ($v instanceof Type) {
            return '\\Doctrine\\DBAL\\Types\\Type::getType('.var_export(Type::lookupName($v), true).')';
        }
        if (!is_array($v)) {
            return var_export($v, true);
        }
        $list = array_is_list($v);

        return '['.implode(', ', array_map(fn ($k) => ($list ? '' : var_export($k, true).' => ').self::ex($v[$k]), array_keys($v))).']';
    }
}

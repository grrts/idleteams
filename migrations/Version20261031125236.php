<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031125236 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Heroic and Mythic: party difficulty and tiers, battle mode';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('battle')->addColumn('mode', 'string', ['length' => 10, 'default' => 'normal']);
        $schema->getTable('battle')->addColumn('tier', 'integer', ['default' => 0]);
        $schema->getTable('battle')->addColumn('affixes', 'json', ['notnull' => false]);
        $schema->getTable('party')->addColumn('difficulty', 'string', ['length' => 10, 'default' => 'normal']);
        $schema->getTable('party')->addColumn('mythic_tier', 'integer', ['default' => 1]);
        $schema->getTable('party')->addColumn('mythic_best', 'integer', ['default' => 0]);
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('party')->dropColumn('mythic_best');
        $schema->getTable('party')->dropColumn('mythic_tier');
        $schema->getTable('party')->dropColumn('difficulty');
        $schema->getTable('battle')->dropColumn('affixes');
        $schema->getTable('battle')->dropColumn('tier');
        $schema->getTable('battle')->dropColumn('mode');
    }
}

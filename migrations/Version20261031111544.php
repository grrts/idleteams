<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031111544 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Battle remembers its dungeon';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('battle')->addColumn('dungeon', 'string', ['length' => 40, 'default' => 'ember-hollow']);
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('battle')->dropColumn('dungeon');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031133753 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Season world raids';
    }

    public function up(Schema $schema): void
    {
        $t = $schema->createTable('world_raid');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('season', 'string', ['length' => 20]);
        $t->addColumn('week', 'integer');
        $t->addColumn('starts_at', 'integer');
        $t->addColumn('state', 'string', ['length' => 10]);
        $t->addColumn('squads', 'json');
        $t->addColumn('report', 'json', ['notnull' => false]);
        $t->setPrimaryKey(['id']);
        $t->addUniqueIndex(['season', 'week'], 'UNIQ_8943A167F0E45BA95B5A69C0');
    }

    public function down(Schema $schema): void
    {
        $schema->dropTable('world_raid');
    }
}

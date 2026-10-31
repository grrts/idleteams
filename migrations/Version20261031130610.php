<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031130610 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Guild raids: the raid planner and results';
    }

    public function up(Schema $schema): void
    {
        $t = $schema->createTable('raid');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('raid', 'string', ['length' => 40]);
        $t->addColumn('state', 'string', ['length' => 10]);
        $t->addColumn('starts_at', 'integer');
        $t->addColumn('signups', 'json');
        $t->addColumn('squads', 'json');
        $t->addColumn('fronts', 'json');
        $t->addColumn('report', 'json', ['notnull' => false]);
        $t->addColumn('week', 'integer');
        $t->addColumn('created_at', 'integer');
        $t->addColumn('guild_id', 'integer');
        $t->setPrimaryKey(['id']);
        $t->addIndex(['guild_id', 'state'], 'IDX_578763B35F2131EFA393D2FB');
        $t->addIndex(['guild_id'], 'IDX_578763B35F2131EF');
        $schema->getTable('raid')->addForeignKeyConstraint('guild', ['guild_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_578763B35F2131EF');
    }

    public function down(Schema $schema): void
    {
        $schema->dropTable('raid');
    }
}

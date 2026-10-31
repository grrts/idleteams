<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031125859 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Guild hall: notice, bank, weekly goals, trophies; items in a guild bank';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('guild')->addColumn('notice', 'string', ['length' => 400, 'default' => '']);
        $schema->getTable('guild')->addColumn('bank_gold', 'bigint', ['default' => 0]);
        $schema->getTable('guild')->addColumn('bank_log', 'json', ['notnull' => false]);
        $schema->getTable('guild')->addColumn('week', 'integer', ['default' => 0]);
        $schema->getTable('guild')->addColumn('goals', 'json', ['notnull' => false]);
        $schema->getTable('guild')->addColumn('helpers', 'json', ['notnull' => false]);
        $schema->getTable('guild')->addColumn('trophies', 'json', ['notnull' => false]);
        $schema->getTable('item')->addColumn('bank_id', 'integer', ['notnull' => false]);
        $schema->getTable('item')->addIndex(['bank_id'], 'IDX_1F1B251E11C8FB41');
        $schema->getTable('item')->addForeignKeyConstraint('guild', ['bank_id'], ['id'], ['onDelete' => 'SET NULL'], 'FK_1F1B251E11C8FB41');
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('item')->removeForeignKey('FK_1F1B251E11C8FB41');
        $schema->getTable('item')->dropIndex('IDX_1F1B251E11C8FB41');
        $schema->getTable('item')->dropColumn('bank_id');
        $schema->getTable('guild')->dropColumn('trophies');
        $schema->getTable('guild')->dropColumn('helpers');
        $schema->getTable('guild')->dropColumn('goals');
        $schema->getTable('guild')->dropColumn('week');
        $schema->getTable('guild')->dropColumn('bank_log');
        $schema->getTable('guild')->dropColumn('bank_gold');
        $schema->getTable('guild')->dropColumn('notice');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031110806 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Push subscriptions and notices';
    }

    public function up(Schema $schema): void
    {
        $t = $schema->createTable('notice');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('kind', 'string', ['length' => 16]);
        $t->addColumn('title', 'string', ['length' => 80]);
        $t->addColumn('body', 'string', ['length' => 200]);
        $t->addColumn('url', 'string', ['length' => 80]);
        $t->addColumn('created_at', 'integer');
        $t->addColumn('pushed_at', 'integer', ['default' => 0]);
        $t->addColumn('shown_at', 'integer', ['default' => 0]);
        $t->addColumn('user_id', 'integer');
        $t->setPrimaryKey(['id']);
        $t->addIndex(['pushed_at', 'id'], 'IDX_480D45C262C51129BF396750');
        $t->addIndex(['user_id'], 'IDX_480D45C2A76ED395');
        $t = $schema->createTable('push_subscription');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('endpoint', 'string', ['length' => 500]);
        $t->addColumn('created_at', 'integer');
        $t->addColumn('failures', 'integer', ['default' => 0]);
        $t->addColumn('user_id', 'integer');
        $t->addUniqueIndex(['endpoint'], 'UNIQ_562830F3C4420F7B');
        $t->setPrimaryKey(['id']);
        $t->addIndex(['user_id'], 'IDX_562830F3A76ED395');
        $schema->getTable('notice')->addForeignKeyConstraint('app_user', ['user_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_480D45C2A76ED395');
        $schema->getTable('push_subscription')->addForeignKeyConstraint('app_user', ['user_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_562830F3A76ED395');
    }

    public function down(Schema $schema): void
    {
        $schema->dropTable('push_subscription');
        $schema->dropTable('notice');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031132428 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Shop purchases, supporters and the season track';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('app_user')->addColumn('supporter_until', 'integer', ['default' => 0]);
        $schema->getTable('app_user')->addColumn('season_points', 'json', ['notnull' => false]);
        $schema->getTable('app_user')->addColumn('season_premium', 'json', ['notnull' => false]);
        $t = $schema->createTable('purchase');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('offer', 'string', ['length' => 40]);
        $t->addColumn('season', 'string', ['notnull' => false, 'length' => 20]);
        $t->addColumn('amount', 'integer');
        $t->addColumn('currency', 'string', ['length' => 3]);
        $t->addColumn('state', 'string', ['length' => 10]);
        $t->addColumn('checkout_session', 'string', ['notnull' => false, 'length' => 255]);
        $t->addColumn('payment_intent', 'string', ['notnull' => false, 'length' => 255]);
        $t->addColumn('waived_withdrawal_at', 'integer', ['default' => 0]);
        $t->addColumn('created_at', 'integer');
        $t->addColumn('paid_at', 'integer', ['default' => 0]);
        $t->addColumn('user_id', 'integer', ['notnull' => false]);
        $t->addUniqueIndex(['checkout_session'], 'UNIQ_6117D13B2C2F31AD');
        $t->setPrimaryKey(['id']);
        $t->addIndex(['payment_intent'], 'IDX_6117D13B9B546087');
        $t->addIndex(['user_id'], 'IDX_6117D13BA76ED395');
        $schema->getTable('purchase')->addForeignKeyConstraint('app_user', ['user_id'], ['id'], ['onDelete' => 'SET NULL'], 'FK_6117D13BA76ED395');
    }

    public function down(Schema $schema): void
    {
        $schema->dropTable('purchase');
        $schema->getTable('app_user')->dropColumn('season_premium');
        $schema->getTable('app_user')->dropColumn('season_points');
        $schema->getTable('app_user')->dropColumn('supporter_until');
    }
}

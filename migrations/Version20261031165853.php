<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031165853 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Store-neutral purchases, Steam link and app tokens';
    }

    public function up(Schema $schema): void
    {
        $t = $schema->createTable('api_token');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('hash', 'string', ['length' => 64]);
        $t->addColumn('platform', 'string', ['length' => 12]);
        $t->addColumn('created_at', 'integer');
        $t->addColumn('last_used_at', 'integer');
        $t->addColumn('user_id', 'integer');
        $t->addUniqueIndex(['hash'], 'UNIQ_7BA2F5EBD1B862B8');
        $t->setPrimaryKey(['id']);
        $t->addIndex(['user_id'], 'IDX_7BA2F5EBA76ED395');
        $schema->getTable('app_user')->addColumn('billing_id', 'string', ['notnull' => false, 'length' => 36]);
        $schema->getTable('app_user')->addColumn('steam_id', 'string', ['notnull' => false, 'length' => 20]);
        $schema->getTable('app_user')->addUniqueIndex(['billing_id'], 'UNIQ_88BDF3E93B025C87');
        $schema->getTable('app_user')->addUniqueIndex(['steam_id'], 'UNIQ_88BDF3E9F3FD4ECA');
        $schema->getTable('purchase')->addColumn('store', 'string', ['notnull' => false, 'length' => 20]);
        $schema->getTable('purchase')->addColumn('product', 'string', ['length' => 80, 'default' => '']);
        $schema->getTable('purchase')->addColumn('transaction_id', 'string', ['notnull' => false, 'length' => 255]);
        $schema->getTable('purchase')->addColumn('sandbox', 'boolean', ['default' => false]);
        $schema->getTable('purchase')->dropIndex('UNIQ_6117D13B2C2F31AD');
        $schema->getTable('purchase')->dropIndex('IDX_6117D13B9B546087');
        $schema->getTable('purchase')->dropColumn('checkout_session');
        $schema->getTable('purchase')->dropColumn('payment_intent');
        $schema->getTable('purchase')->addUniqueIndex(['transaction_id'], 'UNIQ_6117D13B2FC0CB0F');
        $schema->getTable('api_token')->addForeignKeyConstraint('app_user', ['user_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_7BA2F5EBA76ED395');
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('purchase')->dropIndex('UNIQ_6117D13B2FC0CB0F');
        $schema->getTable('purchase')->addColumn('payment_intent', 'string', ['notnull' => false, 'length' => 255]);
        $schema->getTable('purchase')->addColumn('checkout_session', 'string', ['notnull' => false, 'length' => 255]);
        $schema->getTable('purchase')->dropColumn('sandbox');
        $schema->getTable('purchase')->dropColumn('transaction_id');
        $schema->getTable('purchase')->dropColumn('product');
        $schema->getTable('purchase')->dropColumn('store');
        $schema->getTable('app_user')->dropIndex('UNIQ_88BDF3E9F3FD4ECA');
        $schema->getTable('app_user')->dropIndex('UNIQ_88BDF3E93B025C87');
        $schema->getTable('app_user')->dropColumn('steam_id');
        $schema->getTable('app_user')->dropColumn('billing_id');
        $schema->dropTable('api_token');
    }
}

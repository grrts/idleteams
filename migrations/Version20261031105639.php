<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031105639 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Accounts get email, moderation and blocking; chat reports';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('app_user')->addColumn('email', 'string', ['notnull' => false, 'length' => 180]);
        $schema->getTable('app_user')->addColumn('email_verified', 'boolean', ['default' => false]);
        $schema->getTable('app_user')->addColumn('token_kind', 'string', ['notnull' => false, 'length' => 8]);
        $schema->getTable('app_user')->addColumn('token_hash', 'string', ['notnull' => false, 'length' => 64]);
        $schema->getTable('app_user')->addColumn('token_expires_at', 'integer', ['default' => 0]);
        $schema->getTable('app_user')->addColumn('admin', 'boolean', ['default' => false]);
        $schema->getTable('app_user')->addColumn('muted_until', 'integer', ['default' => 0]);
        $schema->getTable('app_user')->addColumn('blocked', 'json', ['notnull' => false]);
        $schema->getTable('app_user')->addUniqueIndex(['email'], 'UNIQ_88BDF3E9E7927C74');
        $t = $schema->createTable('chat_report');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('body', 'string', ['length' => 500]);
        $t->addColumn('reason', 'string', ['length' => 200]);
        $t->addColumn('created_at', 'integer');
        $t->addColumn('resolved_at', 'integer');
        $t->addColumn('outcome', 'string', ['notnull' => false, 'length' => 16]);
        $t->addColumn('message_id', 'integer');
        $t->addColumn('reporter_id', 'integer');
        $t->addColumn('target_id', 'integer');
        $t->setPrimaryKey(['id']);
        $t->addIndex(['resolved_at', 'id'], 'IDX_A3F340A52770E87BF396750');
        $t->addUniqueIndex(['message_id', 'reporter_id'], 'UNIQ_A3F340A5537A1329E1CFE6F5');
        $t->addIndex(['message_id'], 'IDX_A3F340A5537A1329');
        $t->addIndex(['reporter_id'], 'IDX_A3F340A5E1CFE6F5');
        $t->addIndex(['target_id'], 'IDX_A3F340A5158E0B66');
        $schema->getTable('chat_report')->addForeignKeyConstraint('chat_message', ['message_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_A3F340A5537A1329');
        $schema->getTable('chat_report')->addForeignKeyConstraint('app_user', ['reporter_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_A3F340A5E1CFE6F5');
        $schema->getTable('chat_report')->addForeignKeyConstraint('app_user', ['target_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_A3F340A5158E0B66');
    }

    public function down(Schema $schema): void
    {
        $schema->dropTable('chat_report');
        $schema->getTable('app_user')->dropIndex('UNIQ_88BDF3E9E7927C74');
        $schema->getTable('app_user')->dropColumn('blocked');
        $schema->getTable('app_user')->dropColumn('muted_until');
        $schema->getTable('app_user')->dropColumn('admin');
        $schema->getTable('app_user')->dropColumn('token_expires_at');
        $schema->getTable('app_user')->dropColumn('token_hash');
        $schema->getTable('app_user')->dropColumn('token_kind');
        $schema->getTable('app_user')->dropColumn('email_verified');
        $schema->getTable('app_user')->dropColumn('email');
    }
}

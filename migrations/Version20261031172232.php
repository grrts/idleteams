<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031172232 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Push devices for the phone apps';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('push_subscription')->addColumn('platform', 'string', ['length' => 10, 'default' => 'web']);
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('push_subscription')->dropColumn('platform');
    }
}

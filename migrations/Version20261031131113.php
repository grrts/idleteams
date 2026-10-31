<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031131113 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Alternate heroes: the hero an account plays';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('app_user')->addColumn('active_hero', 'integer', ['notnull' => false]);
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('app_user')->dropColumn('active_hero');
    }
}

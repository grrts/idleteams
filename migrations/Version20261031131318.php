<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031131318 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'An account may hold several heroes: drop the one-hero rule';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('hero')->dropIndex('UNIQ_51CE6E86A76ED395');
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('hero')->addUniqueIndex(['user_id'], 'UNIQ_51CE6E86A76ED395');
    }
}

<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031131317 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'An account may hold several heroes';
    }

    public function up(Schema $schema): void
    {
        // A plain index first, in its own step: MySQL will not drop the unique one while the foreign key needs it.
        $schema->getTable('hero')->addIndex(['user_id'], 'IDX_51CE6E86A76ED395');
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('hero')->dropIndex('IDX_51CE6E86A76ED395');
    }
}

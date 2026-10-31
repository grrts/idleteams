<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031115902 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Scarce-role chest bonus';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('hero')->addColumn('bonus_rolls', 'integer', ['default' => 0]);
        $schema->getTable('hero')->addColumn('scarce_at', 'integer', ['default' => 0]);
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('hero')->dropColumn('scarce_at');
        $schema->getTable('hero')->dropColumn('bonus_rolls');
    }
}

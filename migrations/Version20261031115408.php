<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031115408 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Heroes remember the prologue';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('hero')->addColumn('prologue_done', 'boolean', ['default' => false]);
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('hero')->dropColumn('prologue_done');
    }
}

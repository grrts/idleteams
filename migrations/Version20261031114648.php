<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031114648 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Heroes take a Legend form';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('hero')->addColumn('legend', 'string', ['notnull' => false, 'length' => 30]);
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('hero')->dropColumn('legend');
    }
}

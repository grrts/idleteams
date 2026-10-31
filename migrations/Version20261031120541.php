<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031120541 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Item dyes and the wardrobe';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('hero')->addColumn('wardrobe', 'json', ['notnull' => false]);
        $schema->getTable('hero')->addColumn('outfit', 'json', ['notnull' => false]);
        $schema->getTable('item')->addColumn('dye', 'json', ['notnull' => false]);
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('item')->dropColumn('dye');
        $schema->getTable('hero')->dropColumn('outfit');
        $schema->getTable('hero')->dropColumn('wardrobe');
    }
}

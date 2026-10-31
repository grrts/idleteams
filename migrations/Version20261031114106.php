<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031114106 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Signature skill';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('hero')->addColumn('signature', 'string', ['notnull' => false, 'length' => 40]);
        $schema->getTable('hero')->addColumn('signature_name', 'string', ['notnull' => false, 'length' => 30]);
        $schema->getTable('hero')->addColumn('signature_xp', 'integer', ['default' => 0]);
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('hero')->dropColumn('signature_xp');
        $schema->getTable('hero')->dropColumn('signature_name');
        $schema->getTable('hero')->dropColumn('signature');
    }
}

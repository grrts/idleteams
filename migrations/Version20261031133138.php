<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/** Written by app:migration with the schema API, so it runs on SQLite, MySQL and Postgres. */
final class Version20261031133138 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'First-day funnel steps on the account';
    }

    public function up(Schema $schema): void
    {
        $schema->getTable('app_user')->addColumn('funnel', 'json', ['notnull' => false]);
    }

    public function down(Schema $schema): void
    {
        $schema->getTable('app_user')->dropColumn('funnel');
    }
}

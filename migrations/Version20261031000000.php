<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

/**
 * Baseline: the whole schema as of the proof of concept.
 *
 * Written with the schema API instead of raw SQL, so the same migration builds the tables on SQLite, MySQL and
 * Postgres. Later migrations can be generated with doctrine:migrations:diff against the production database.
 */
final class Version20261031000000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Baseline schema: users, heroes, items, parties, battles, guilds, chat and the tavern board';
    }

    public function up(Schema $schema): void
    {
        $t = $schema->createTable('app_user');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('username', 'string', ['length' => 40]);
        $t->addColumn('password', 'string', ['length' => 255]);
        $t->addColumn('demo', 'boolean');
        $t->addColumn('created_at', 'integer');
        $t->addColumn('last_seen_at', 'integer');
        $t->addUniqueIndex(['username'], 'UNIQ_88BDF3E9F85E0677');
        $t->setPrimaryKey(['id']);
        $t = $schema->createTable('battle');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('state', 'string', ['length' => 8]);
        $t->addColumn('seed', 'integer');
        $t->addColumn('dungeon_level', 'integer');
        $t->addColumn('started_at', 'integer');
        $t->addColumn('ends_at', 'integer');
        $t->addColumn('chest_closes_at', 'integer');
        $t->addColumn('roster', 'json');
        $t->addColumn('timeline', 'json', ['notnull' => false]);
        $t->addColumn('report', 'json');
        $t->addColumn('chest', 'json');
        $t->addColumn('party_id', 'integer');
        $t->setPrimaryKey(['id']);
        $t->addIndex(['state', 'ends_at'], 'IDX_13991734A393D2FB2F4A8AA7');
        $t->addIndex(['party_id'], 'IDX_13991734213C1059');
        $t = $schema->createTable('chat_message');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('channel', 'string', ['length' => 24]);
        $t->addColumn('body', 'string', ['length' => 500]);
        $t->addColumn('card', 'json', ['notnull' => false]);
        $t->addColumn('created_at', 'integer');
        $t->addColumn('author_id', 'integer', ['notnull' => false]);
        $t->setPrimaryKey(['id']);
        $t->addIndex(['channel', 'id'], 'IDX_FAB3FC16A2F98E47BF396750');
        $t->addIndex(['author_id'], 'IDX_FAB3FC16F675F31B');
        $t = $schema->createTable('guild');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('name', 'string', ['length' => 32]);
        $t->addColumn('tag', 'string', ['length' => 4]);
        $t->addColumn('motto', 'string', ['length' => 160]);
        $t->addColumn('xp', 'integer');
        $t->addColumn('created_at', 'integer');
        $t->addUniqueIndex(['name'], 'UNIQ_75407DAB5E237E06');
        $t->setPrimaryKey(['id']);
        $t = $schema->createTable('hero');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('name', 'string', ['length' => 24]);
        $t->addColumn('race', 'string', ['length' => 16]);
        $t->addColumn('cls', 'string', ['length' => 16]);
        $t->addColumn('origin', 'string', ['length' => 16]);
        $t->addColumn('path', 'string', ['notnull' => false, 'length' => 16]);
        $t->addColumn('oath_taken', 'boolean');
        $t->addColumn('look', 'json');
        $t->addColumn('level', 'integer');
        $t->addColumn('xp', 'bigint');
        $t->addColumn('spent', 'json');
        $t->addColumn('carved', 'json');
        $t->addColumn('skill_ranks', 'json');
        $t->addColumn('loadout', 'json');
        $t->addColumn('keystones', 'json');
        $t->addColumn('talents', 'json');
        $t->addColumn('heritage', 'json');
        $t->addColumn('culture', 'string', ['notnull' => false, 'length' => 16]);
        $t->addColumn('backstory', 'string', ['notnull' => false, 'length' => 16]);
        $t->addColumn('story', 'json');
        $t->addColumn('renown', 'integer');
        $t->addColumn('codex', 'json');
        $t->addColumn('marks', 'json');
        $t->addColumn('career', 'json');
        $t->addColumn('gold', 'bigint');
        $t->addColumn('materials', 'integer');
        $t->addColumn('essence', 'integer');
        $t->addColumn('loot_policy', 'string', ['length' => 12]);
        $t->addColumn('guild_rank', 'string', ['length' => 12]);
        $t->addColumn('created_at', 'integer');
        $t->addColumn('user_id', 'integer');
        $t->addColumn('party_id', 'integer', ['notnull' => false]);
        $t->addColumn('guild_id', 'integer', ['notnull' => false]);
        $t->addUniqueIndex(['name'], 'UNIQ_51CE6E865E237E06');
        $t->addUniqueIndex(['user_id'], 'UNIQ_51CE6E86A76ED395');
        $t->setPrimaryKey(['id']);
        $t->addIndex(['party_id'], 'IDX_51CE6E86213C1059');
        $t->addIndex(['guild_id'], 'IDX_51CE6E865F2131EF');
        $t = $schema->createTable('item');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('slot', 'string', ['length' => 12]);
        $t->addColumn('base', 'string', ['length' => 16]);
        $t->addColumn('rarity', 'string', ['length' => 12]);
        $t->addColumn('ilvl', 'integer');
        $t->addColumn('affixes', 'json');
        $t->addColumn('sockets', 'integer');
        $t->addColumn('glyphs', 'json');
        $t->addColumn('power', 'string', ['notnull' => false, 'length' => 20]);
        $t->addColumn('imprint', 'string', ['notnull' => false, 'length' => 20]);
        $t->addColumn('temper', 'integer');
        $t->addColumn('seed', 'integer');
        $t->addColumn('equipped', 'string', ['notnull' => false, 'length' => 12]);
        $t->addColumn('price', 'bigint', ['notnull' => false]);
        $t->addColumn('created_at', 'integer');
        $t->addColumn('owner_id', 'integer', ['notnull' => false]);
        $t->setPrimaryKey(['id']);
        $t->addIndex(['price'], 'IDX_1F1B251ECAC822D9');
        $t->addIndex(['owner_id'], 'IDX_1F1B251E7E3C61F9');
        $t = $schema->createTable('party');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('name', 'string', ['length' => 40]);
        $t->addColumn('dungeon_offset', 'integer');
        $t->addColumn('running', 'boolean');
        $t->addColumn('battles_together', 'integer');
        $t->addColumn('created_at', 'integer');
        $t->addColumn('leader_id', 'integer', ['notnull' => false]);
        $t->setPrimaryKey(['id']);
        $t->addIndex(['leader_id'], 'IDX_89954EE073154ED4');
        $t = $schema->createTable('party_request');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('kind', 'string', ['length' => 12]);
        $t->addColumn('message', 'string', ['length' => 200]);
        $t->addColumn('created_at', 'integer');
        $t->addColumn('party_id', 'integer');
        $t->addColumn('hero_id', 'integer');
        $t->setPrimaryKey(['id']);
        $t->addIndex(['party_id'], 'IDX_296610B4213C1059');
        $t->addIndex(['hero_id'], 'IDX_296610B445B0BCD');
        $t = $schema->createTable('tavern_post');
        $t->addColumn('id', 'integer', ['autoincrement' => true]);
        $t->addColumn('kind', 'string', ['length' => 8]);
        $t->addColumn('text', 'string', ['length' => 200]);
        $t->addColumn('roles', 'json');
        $t->addColumn('created_at', 'integer');
        $t->addColumn('author_id', 'integer');
        $t->addColumn('party_id', 'integer', ['notnull' => false]);
        $t->setPrimaryKey(['id']);
        $t->addIndex(['author_id'], 'IDX_886FAFF0F675F31B');
        $t->addIndex(['party_id'], 'IDX_886FAFF0213C1059');
        $schema->getTable('battle')->addForeignKeyConstraint('party', ['party_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_13991734213C1059');
        $schema->getTable('chat_message')->addForeignKeyConstraint('hero', ['author_id'], ['id'], ['onDelete' => 'SET NULL'], 'FK_FAB3FC16F675F31B');
        $schema->getTable('hero')->addForeignKeyConstraint('app_user', ['user_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_51CE6E86A76ED395');
        $schema->getTable('hero')->addForeignKeyConstraint('party', ['party_id'], ['id'], ['onDelete' => 'SET NULL'], 'FK_51CE6E86213C1059');
        $schema->getTable('hero')->addForeignKeyConstraint('guild', ['guild_id'], ['id'], ['onDelete' => 'SET NULL'], 'FK_51CE6E865F2131EF');
        $schema->getTable('item')->addForeignKeyConstraint('hero', ['owner_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_1F1B251E7E3C61F9');
        $schema->getTable('party')->addForeignKeyConstraint('hero', ['leader_id'], ['id'], ['onDelete' => 'SET NULL'], 'FK_89954EE073154ED4');
        $schema->getTable('party_request')->addForeignKeyConstraint('party', ['party_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_296610B4213C1059');
        $schema->getTable('party_request')->addForeignKeyConstraint('hero', ['hero_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_296610B445B0BCD');
        $schema->getTable('tavern_post')->addForeignKeyConstraint('hero', ['author_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_886FAFF0F675F31B');
        $schema->getTable('tavern_post')->addForeignKeyConstraint('party', ['party_id'], ['id'], ['onDelete' => 'CASCADE'], 'FK_886FAFF0213C1059');
    }

    public function down(Schema $schema): void
    {
        $schema->dropTable('tavern_post');
        $schema->dropTable('party_request');
        $schema->dropTable('party');
        $schema->dropTable('item');
        $schema->dropTable('hero');
        $schema->dropTable('guild');
        $schema->dropTable('chat_message');
        $schema->dropTable('battle');
        $schema->dropTable('app_user');
    }
}

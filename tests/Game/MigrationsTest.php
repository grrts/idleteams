<?php

namespace App\Tests\Game;

use Doctrine\DBAL\Platforms\AbstractPlatform;
use Doctrine\DBAL\Platforms\MySQL80Platform;
use Doctrine\DBAL\Platforms\PostgreSQLPlatform;
use Doctrine\DBAL\Platforms\SQLitePlatform;
use Doctrine\DBAL\Schema\Comparator;
use Doctrine\DBAL\Schema\Schema;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Tools\SchemaTool;
use PHPUnit\Framework\Attributes\DataProvider;
use Symfony\Bundle\FrameworkBundle\Test\KernelTestCase;

/** Replays every migration on an empty schema: the result must equal the entity mapping on each database we support. */
class MigrationsTest extends KernelTestCase
{
    public static function platforms(): array
    {
        return ['mysql' => [new MySQL80Platform()], 'postgres' => [new PostgreSQLPlatform()], 'sqlite' => [new SQLitePlatform()]];
    }

    #[DataProvider('platforms')]
    public function testMigrationsMatchTheEntities(AbstractPlatform $platform): void
    {
        $em = static::getContainer()->get(EntityManagerInterface::class);
        $want = (new SchemaTool($em))->getSchemaFromMetadata($em->getMetadataFactory()->getAllMetadata());
        $got = new Schema();
        $files = glob(dirname(__DIR__, 2).'/migrations/Version*.php');
        sort($files);
        foreach ($files as $file) {
            require_once $file;
            (new \ReflectionClass('DoctrineMigrations\\'.basename($file, '.php')))->newInstanceWithoutConstructor()->up($got);
        }
        $sql = $platform->getAlterSchemaSQL((new Comparator($platform))->compareSchemas($got, $want));
        $this->assertSame([], $sql, 'The entities changed without a migration. Run: php bin/console app:migration "what changed"');
    }
}

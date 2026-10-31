<?php

namespace App\Command;

use Doctrine\DBAL\Connection;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Process\Process;

/**
 * A consistent copy of the database, gzipped, with old copies cleared. Cron it nightly and copy the folder off the
 * machine (see README). SQLite is copied with VACUUM INTO; MySQL and Postgres use mysqldump and pg_dump, which
 * must be installed.
 */
#[AsCommand('app:backup', 'Back up the database into var/backups (or --dir), keeping --keep days')]
final class BackupCommand extends Command
{
    public function __construct(private Connection $db, #[Autowire('%kernel.project_dir%')] private string $root)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addOption('dir', null, InputOption::VALUE_REQUIRED, 'Where backups go', 'var/backups')
            ->addOption('keep', null, InputOption::VALUE_REQUIRED, 'Days of backups to keep', '14');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $dir = $input->getOption('dir');
        $dir = str_starts_with($dir, '/') ? $dir : $this->root.'/'.$dir;
        if (!is_dir($dir) && !mkdir($dir, 0700, true)) {
            $output->writeln("<error>Cannot create $dir</error>");

            return Command::FAILURE;
        }
        $p = $this->db->getParams();
        $driver = $p['driver'] ?? '';
        $stamp = gmdate('Ymd-His');

        if (str_contains($driver, 'sqlite')) {
            $raw = "$dir/idleteams-$stamp.sqlite";
            $this->db->executeStatement('VACUUM INTO '.$this->db->quote($raw));
            $file = $this->gzip($raw);
        } elseif (str_contains($driver, 'mysql')) {
            $file = "$dir/idleteams-$stamp.sql.gz";
            $cmd = ['mysqldump', '--single-transaction', '--quick', '--no-tablespaces', '--default-character-set=utf8mb4',
                '-h', $p['host'] ?? '127.0.0.1', '-P', (string) ($p['port'] ?? 3306), '-u', $p['user'] ?? 'root', $p['dbname']];
            $this->dump($cmd, ['MYSQL_PWD' => $p['password'] ?? ''], $file);
        } elseif (str_contains($driver, 'pgsql')) {
            $file = "$dir/idleteams-$stamp.pgdump";
            $cmd = ['pg_dump', '-Fc', '--no-owner', '-h', $p['host'] ?? '127.0.0.1', '-p', (string) ($p['port'] ?? 5432), '-U', $p['user'] ?? 'postgres', '-f', $file, $p['dbname']];
            $proc = new Process($cmd, null, ['PGPASSWORD' => $p['password'] ?? ''], null, 3600);
            $proc->mustRun();
        } else {
            $output->writeln("<error>No backup for driver $driver</error>");

            return Command::FAILURE;
        }
        chmod($file, 0600);
        $removed = 0;
        foreach (glob("$dir/idleteams-*") ?: [] as $old) {
            if ($old !== $file && filemtime($old) < time() - 86400 * (int) $input->getOption('keep')) {
                unlink($old);
                ++$removed;
            }
        }
        $output->writeln(sprintf('Wrote %s (%s KB). Removed %d old backup(s).', $file, number_format(filesize($file) / 1024, 1), $removed));

        return Command::SUCCESS;
    }

    private function gzip(string $raw): string
    {
        $in = fopen($raw, 'rb');
        $out = gzopen($raw.'.gz', 'wb6');
        while (!feof($in)) {
            gzwrite($out, fread($in, 1 << 20));
        }
        fclose($in);
        gzclose($out);
        unlink($raw);

        return $raw.'.gz';
    }

    private function dump(array $cmd, array $env, string $file): void
    {
        $out = gzopen($file, 'wb6');
        $proc = new Process($cmd, null, $env, null, 3600);
        $proc->mustRun(function ($type, $chunk) use ($out) {
            if ($type === Process::OUT) {
                gzwrite($out, $chunk);
            }
        });
        gzclose($out);
    }
}

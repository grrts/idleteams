<?php

namespace App\Command;

use App\Controller\HealthController;
use App\Entity\User;
use App\Game\Seasons;
use App\Service\Fcm;
use App\Service\Shop;
use Doctrine\ORM\EntityManagerInterface;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;
use Symfony\Component\Console\Style\SymfonyStyle;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

/**
 * Everything the server needs before players and money arrive, checked in one go: php bin/console app:launch-check.
 * Each line says what is missing and where to fix it. Exits with 1 while something required is missing.
 */
#[AsCommand('app:launch-check', 'Check the server is ready to launch: keys, stores, legal pages, cron')]
final class LaunchCheckCommand extends Command
{
    private array $rows = [];
    private int $missing = 0;

    public function __construct(
        private EntityManagerInterface $em,
        private Fcm $fcm,
        #[Autowire(service: 'cache.app')] private CacheItemPoolInterface $cache,
        #[Autowire('%kernel.project_dir%')] private string $dir,
        #[Autowire('%kernel.environment%')] private string $env,
    ) {
        parent::__construct();
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $io = new SymfonyStyle($input, $output);
        $e = fn (string $k) => trim((string) ($_SERVER[$k] ?? $_ENV[$k] ?? getenv($k) ?: ''));

        $this->section('Server');
        $this->need($this->env === 'prod', 'APP_ENV is prod', 'Set APP_ENV=prod in .env.local, then composer dump-env prod.');
        $this->need(strlen($e('APP_SECRET')) >= 32 && $e('APP_SECRET') !== 'test-secret', 'APP_SECRET is a long random value', 'Set APP_SECRET to 32+ random characters.');
        $this->need(str_starts_with($e('APP_URL'), 'https://'), 'APP_URL is the https address', 'Set APP_URL=https://your-domain (mail links and the apps use it).');
        $this->want(!str_starts_with($e('DATABASE_URL'), 'sqlite'), 'MySQL or Postgres', 'SQLite works for a small test; use MySQL or Postgres for launch (README, Host it).');
        $this->need($e('MAILER_DSN') !== '' && !str_starts_with($e('MAILER_DSN'), 'null:'), 'Mail is set up', 'Set MAILER_DSN and MAILER_FROM: password reset needs mail.');
        $tick = $this->cache->getItem(HealthController::TICK_KEY);
        $this->need($tick->isHit() && time() - (int) $tick->get() < 300, 'The cron tick ran in the last five minutes', 'Add the app:tick line to cron (README, Host it, step 5).');
        $this->need((bool) $this->em->getRepository(User::class)->findOneBy(['admin' => true]), 'There is a moderator', 'Make one: php bin/console app:admin <username>.');
        $this->want($e('MERCURE_URL') !== '' && $e('MERCURE_PUBLIC_URL') !== '', 'Live updates (Mercure)', 'Optional: without a hub the game polls, which costs more requests.');
        $this->want($e('ERROR_WEBHOOK_URL') !== '', 'Server errors are reported', 'Optional: set ERROR_WEBHOOK_URL to hear about errors in Slack or Discord.');

        $this->section('Legal');
        foreach (['LEGAL_OPERATOR' => 'who runs the game', 'LEGAL_ADDRESS' => 'a postal address', 'LEGAL_CONTACT' => 'a contact email'] as $k => $what) {
            $this->need($e($k) !== '', "$k ($what)", "Set $k: /terms and /privacy show it, and the stores ask for these pages.");
        }
        $this->want(false, 'A lawyer read /terms and /privacy', 'Have them read before launch; this check cannot tell.');

        $this->section('Phone apps (RevenueCat, Firebase)');
        foreach (['RC_PUBLIC_IOS_KEY', 'RC_PUBLIC_ANDROID_KEY', 'RC_SECRET_KEY', 'RC_WEBHOOK_AUTH'] as $k) {
            $this->need($e($k) !== '', $k, 'From the RevenueCat dashboard (mobile/README.md).');
        }
        $this->need(!filter_var($e('RC_ALLOW_SANDBOX'), FILTER_VALIDATE_BOOL), 'RC_ALLOW_SANDBOX is off', 'Test purchases must not count in production.');
        $this->need($this->fcm->enabled(), 'FCM_SERVICE_ACCOUNT is a Firebase service account key', 'Firebase console > Project settings > Service accounts > Generate new private key.');
        $cap = json_decode((string) @file_get_contents($this->dir.'/mobile/capacitor.config.json'), true) ?? [];
        $this->want(($cap['appId'] ?? '') !== 'com.idleteams.app', 'The app id is yours', 'mobile/capacitor.config.json still has com.idleteams.app; fine if that is the id you registered.');

        $this->section('Steam');
        $this->need($e('STEAM_WEB_API_KEY') !== '' && $e('STEAM_APP_ID') !== '', 'STEAM_WEB_API_KEY and STEAM_APP_ID', 'A publisher Web API key and the app id (desktop/README.md).');
        $this->need(!filter_var($e('STEAM_SANDBOX'), FILTER_VALIDATE_BOOL), 'STEAM_SANDBOX is off', 'Sandbox purchases cost nothing; turn it off for launch.');
        $steam = json_decode((string) @file_get_contents($this->dir.'/desktop/steam.json'), true) ?? [];
        $this->need(($steam['appId'] ?? 480) !== 480 && (string) ($steam['appId'] ?? '') === $e('STEAM_APP_ID'), 'desktop/steam.json has the same app id', 'Put your app id in desktop/steam.json (480 is the test app of Valve).');
        $origins = array_map('trim', explode(',', $e('CORS_ORIGINS')));
        $this->need(!array_diff(['capacitor://localhost', 'https://localhost', 'app://idleteams'], $origins), 'CORS_ORIGINS lets the apps in', 'CORS_ORIGINS=capacitor://localhost,https://localhost,app://idleteams');

        $this->section('Shop');
        $products = [];
        foreach (Shop::offers() as $o) {
            if ($o['kind'] === 'track') {
                foreach (Seasons::all() as $s) {
                    if ($s['endsAt'] > time()) {
                        $products[] = Shop::product($o, $s['id']).' (non-consumable)';
                    }
                }
            } else {
                $products[] = $o['product'].($o['entitlement'] ? ' (monthly subscription, entitlement "'.$o['entitlement'].'")' : ' (non-consumable)');
            }
        }
        $this->want(false, 'The store products below exist', 'Make them in App Store Connect and the Play Console with these ids, and add them to RevenueCat.');
        $currencies = array_unique(array_merge(...array_map(fn ($o) => [$o['currency'], ...array_keys($o['prices'] ?? [])], array_values(Shop::offers()))));
        $this->want(false, 'Steam prices in: '.implode(', ', $currencies), 'Players whose Steam wallet is in another currency cannot buy yet; add it to "prices" in content/base/shop/launch.json.');

        $io->table(['', 'Check', 'To do'], $this->rows);
        $io->text('Store products (App Store, Google Play, RevenueCat):');
        $io->listing($products);
        if ($this->missing) {
            $io->error(sprintf('%d required item(s) missing.', $this->missing));

            return Command::FAILURE;
        }
        $io->success('Everything required is in place. Look over the notes marked "?".');

        return Command::SUCCESS;
    }

    private function section(string $name): void
    {
        $this->rows[] = ['', "<options=bold>$name</>", ''];
    }

    private function need(bool $ok, string $what, string $fix): void
    {
        $this->rows[] = [$ok ? '<info>ok</info>' : '<error>missing</error>', $what, $ok ? '' : $fix];
        $this->missing += $ok ? 0 : 1;
    }

    private function want(bool $ok, string $what, string $fix): void
    {
        $this->rows[] = [$ok ? '<info>ok</info>' : '<comment>?</comment>', $what, $ok ? '' : $fix];
    }
}

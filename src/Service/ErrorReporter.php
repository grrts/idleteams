<?php

namespace App\Service;

use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Psr\Cache\CacheItemPoolInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Error tracking without a vendor: every server error is logged, and with ERROR_WEBHOOK_URL set it is also posted
 * to a chat webhook (Slack, Discord, Mattermost or anything that takes {"text"} or {"content"}). The same error is
 * posted at most once per ERROR_WEBHOOK_QUIET seconds (default 600), with a count of how often it happened meanwhile.
 */
class ErrorReporter
{
    public function __construct(
        private LoggerInterface $logger,
        private HttpClientInterface $http,
        #[Autowire(service: 'cache.app')] private CacheItemPoolInterface $cache,
        #[Autowire('%env(default::ERROR_WEBHOOK_URL)%')] private ?string $webhook,
        #[Autowire('%env(default::APP_URL)%')] private ?string $appUrl,
        #[Autowire('%env(default::ERROR_WEBHOOK_QUIET)%')] ?string $quiet = null,
    ) {
        $this->quiet = (int) ($quiet ?: 600);
    }

    private int $quiet;

    /** @return bool whether a webhook post went out */
    public function report(\Throwable $e, string $where): bool
    {
        $this->logger->error(sprintf('%s: %s in %s:%d', $where, $e->getMessage(), $e->getFile(), $e->getLine()), ['exception' => $e]);
        if (!$this->webhook) {
            return false;
        }
        $item = $this->cache->getItem('err_'.md5($e::class.$e->getFile().$e->getLine()));
        $seen = $item->isHit() ? $item->get() : ['at' => 0, 'count' => 0];
        ++$seen['count'];
        $send = $seen['at'] < time() - $this->quiet;
        $repeats = $seen['count'] - 1;
        if ($send) {
            $seen = ['at' => time(), 'count' => 0];
        }
        $this->cache->save($item->set($seen)->expiresAfter(2 * $this->quiet));
        if (!$send) {
            return false;
        }
        $text = sprintf("Idle Teams error (%s) on %s\n%s: %s\nat %s:%d%s",
            $where, $this->appUrl ?: gethostname(), $e::class, mb_substr($e->getMessage(), 0, 300),
            str_replace(dirname(__DIR__, 2).'/', '', $e->getFile()), $e->getLine(),
            $repeats ? "\n(also $repeats more time(s) since the last report)" : '');
        try {
            $this->http->request('POST', $this->webhook, ['json' => ['text' => $text, 'content' => $text], 'timeout' => 3])->getStatusCode();

            return true;
        } catch (\Throwable $x) {
            $this->logger->warning('Error webhook failed: '.$x->getMessage());

            return false;
        }
    }
}

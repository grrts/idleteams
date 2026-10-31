<?php

namespace App\Service;

use App\Entity\Hero;
use App\Entity\User;
use Psr\Log\LoggerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Mercure\HubInterface;
use Symfony\Component\Mercure\ProtocolVersion;
use Symfony\Component\Mercure\Update;

/**
 * Live updates through a Mercure hub. Updates are pings with no game data ("the group changed", "a new line in
 * guild chat"); the client then reads what changed from the normal API, so the hub never sees anything private and
 * the API stays the only place that checks who may see what. Pings are collected during a request or tick and sent
 * once each after the response (LiveListener). Without MERCURE_URL nothing is sent and the client polls.
 *
 * Topics: /chat/<channel>, /party/<id>, /user/<id>. Updates are private; a player's cookie names the topics they may
 * hear (topicsFor), refreshed with every /api/state.
 */
class Live
{
    /** @var array<string, array> topic => ping */
    private array $pending = [];

    public function __construct(
        private HubInterface $hub,
        private LoggerInterface $logger,
        #[Autowire('%env(default::MERCURE_URL)%')] private ?string $url,
        #[Autowire('%env(default::MERCURE_PUBLIC_URL)%')] private ?string $publicUrl,
    ) {
    }

    public function enabled(): bool
    {
        return (bool) $this->url && (bool) $this->publicUrl;
    }

    public function publicUrl(): ?string
    {
        return $this->enabled() ? $this->publicUrl : null;
    }

    public function chat(string $channel): void
    {
        $this->pending['/chat/'.$channel] = ['t' => 'chat', 'channel' => $channel];
    }

    public function party(?int $id): void
    {
        if ($id) {
            $this->pending['/party/'.$id] = ['t' => 'party'];
        }
    }

    public function user(?int $id): void
    {
        if ($id) {
            $this->pending['/user/'.$id] = ['t' => 'user'];
        }
    }

    /** @return string[] */
    public function pending(): array
    {
        return array_keys($this->pending);
    }

    /** @return string[] what this player may listen to */
    public function topicsFor(User $u, ?Hero $h, array $channels): array
    {
        $out = ['/user/'.$u->id];
        if ($h?->party) {
            $out[] = '/party/'.$h->party->id;
        }
        foreach (array_keys($channels) as $c) {
            $out[] = '/chat/'.$c;
        }

        return $out;
    }

    /** The address a browser listens on for these topics, in the hub's protocol ("match" for 1.0, "topic" before). */
    public function subscribeUrl(array $topics): ?string
    {
        if (!$this->enabled()) {
            return null;
        }
        $param = $this->hub->getProtocolVersion() === ProtocolVersion::V1 ? 'match' : 'topic';

        return $this->publicUrl.(str_contains($this->publicUrl, '?') ? '&' : '?').implode('&', array_map(fn ($t) => $param.'='.rawurlencode($t), $topics));
    }

    /** @return int updates sent */
    public function flush(): int
    {
        $pending = $this->pending;
        $this->pending = [];
        if (!$pending || !$this->enabled()) {
            return 0;
        }
        $sent = 0;
        foreach ($pending as $topic => $data) {
            try {
                $this->hub->publish(new Update($topic, json_encode($data), true));
                ++$sent;
            } catch (\Throwable $e) {
                // A hub that is down must not break the game: clients fall back to polling.
                $this->logger->warning('Mercure publish failed: '.$e->getMessage());

                return $sent;
            }
        }

        return $sent;
    }
}

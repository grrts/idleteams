<?php

namespace App\Service;

use App\Entity\Purchase;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * The Steam build (desktop/) talks to Steam through Steamworks; this is the server's side, through the Steam Web API
 * with the publisher key (STEAM_WEB_API_KEY) for the app (STEAM_APP_ID):
 *
 *  - authenticate(): checks a session ticket from the Steam client and gives its SteamID, to log in or link an account.
 *  - start(): opens a Steam purchase (ISteamMicroTxn/InitTxn) for an offer. Steam shows the player its overlay; the
 *    client hears back (MicroTxnAuthorizationResponse_t) and calls finish().
 *  - finish(): settles it (FinalizeTxn) and only then pays it through Shop::record().
 *  - refunds(): reads Steam's sales report for refunds and chargebacks and takes those purchases back (app:steam-refunds).
 *
 * STEAM_SANDBOX=1 uses ISteamMicroTxnSandbox, where nothing is charged; purchases made there are marked sandbox.
 */
class Steam
{
    public const API = 'https://partner.steam-api.com/';

    public function __construct(
        private EntityManagerInterface $em,
        private HttpClientInterface $http,
        private Shop $shop,
        #[Autowire('%env(STEAM_WEB_API_KEY)%')] private string $key,
        #[Autowire('%env(STEAM_APP_ID)%')] private string $appId,
        #[Autowire('%env(bool:STEAM_SANDBOX)%')] private bool $sandbox,
    ) {
    }

    public function configured(): bool
    {
        return $this->key !== '' && $this->appId !== '';
    }

    /** The SteamID64 of the player whose client made this session ticket (hex, from GetAuthTicketForWebApi). */
    public function authenticate(string $ticket): string
    {
        $this->configured() || throw new GameError('Steam is not set up on this server.');
        preg_match('/^[0-9a-fA-F]{16,4096}$/', $ticket) || throw new GameError('Bad Steam ticket.');
        $r = $this->call('GET', 'ISteamUserAuth/AuthenticateUserTicket/v1/', ['ticket' => $ticket, 'identity' => 'idleteams']);
        $p = $r['response']['params'] ?? null;
        if (($p['result'] ?? '') !== 'OK' || !preg_match('/^\d{17}$/', (string) ($p['steamid'] ?? ''))) {
            throw new GameError('Steam did not accept the ticket.');
        }
        if (!empty($p['publisherbanned'])) {
            throw new GameError('This Steam account is banned.');
        }

        return (string) $p['steamid'];
    }

    /**
     * Opens a Steam purchase for an offer the player has consented to (Shop::consent made the pending row, whose id
     * is the order id). Steam then asks the player in its overlay.
     *
     * @return array{orderId: string}
     */
    public function start(User $u, int $purchaseId, string $language = 'en'): array
    {
        $this->configured() || throw new GameError('The shop is not open yet.');
        $u->steamId || throw new GameError('Log in with Steam first.');
        $p = $this->em->getRepository(Purchase::class)->find($purchaseId);
        if (!$p || $p->user !== $u || $p->state !== 'pending' || $p->transactionId) {
            throw new GameError('No such purchase.');
        }
        $o = Shop::offers()[$p->offer] ?? throw new GameError('No such offer.');

        $info = $this->call('GET', $this->microTxn().'/GetUserInfo/v2/', ['steamid' => $u->steamId])['response'] ?? [];
        if (($info['result'] ?? '') !== 'OK') {
            throw new GameError('Steam could not start the purchase. Try again in a moment.');
        }
        $currency = strtolower((string) ($info['params']['currency'] ?? 'eur'));
        $amount = $currency === strtolower($o['currency']) ? $o['price'] : ($o['prices'][$currency] ?? null);
        if ($amount === null) {
            throw new GameError('This is not on sale in your Steam currency yet.');
        }

        $r = $this->call('POST', $this->microTxn().'/InitTxn/v3/', [
            'orderid' => (string) $p->id, 'steamid' => $u->steamId, 'itemcount' => 1, 'language' => $language,
            'currency' => strtoupper($currency), 'usersession' => 'client',
            'itemid[0]' => Shop::steamItem($o, $p->season), 'qty[0]' => 1, 'amount[0]' => $amount, 'description[0]' => $o['name'],
        ])['response'] ?? [];
        if (($r['result'] ?? '') !== 'OK') {
            throw new GameError('Steam could not start the purchase: '.($r['error']['errordesc'] ?? 'unknown error').'.');
        }
        $p->store = 'steam';
        $p->amount = $amount;
        $p->currency = $currency;

        return ['orderId' => (string) $p->id];
    }

    /**
     * After the player said yes in the overlay: settles the order with Steam and pays it.
     *
     * @return string what happened
     */
    public function finish(User $u, string $orderId): string
    {
        $this->configured() || throw new GameError('The shop is not open yet.');
        $p = ctype_digit($orderId) ? $this->em->getRepository(Purchase::class)->find((int) $orderId) : null;
        if (!$p || $p->user !== $u || $p->store !== 'steam') {
            throw new GameError('No such purchase.');
        }
        if ($p->state !== 'pending') {
            return 'already '.$p->state;
        }
        $r = $this->call('POST', $this->microTxn().'/FinalizeTxn/v2/', ['orderid' => $orderId])['response'] ?? [];
        if (($r['result'] ?? '') !== 'OK') {
            // the player cancelled in the overlay, or Steam declined: the consent row simply stays unpaid
            throw new GameError('Steam did not complete the purchase.');
        }

        return $this->shop->record($u, $p->product, 'steam', 'steam:'.$orderId, $this->sandbox, $p->amount, $p->currency, $p);
    }

    /**
     * Takes back purchases Steam refunded or charged back since a time (GetReport).
     *
     * @return array{refunded: int, next: int} and the time to ask from next
     */
    public function refunds(int $since): array
    {
        $this->configured() || throw new GameError('Steam is not set up on this server.');
        $n = 0;
        $next = $since;
        foreach (['GAMESALES', 'CHARGEBACK'] as $type) {
            $from = $since;
            do {
                $r = $this->call('GET', $this->microTxn().'/GetReport/v5/', ['type' => $type, 'time' => gmdate('Y-m-d\TH:i:s\Z', $from), 'maxresults' => 1000])['response'] ?? [];
                if (($r['result'] ?? '') !== 'OK') {
                    throw new GameError('Steam report failed: '.($r['error']['errordesc'] ?? 'unknown error'));
                }
                $orders = $r['params']['orders'] ?? [];
                foreach ($orders as $o) {
                    $time = strtotime((string) ($o['timecreated'] ?? $o['time'] ?? '')) ?: $from;
                    $from = max($from, $time);
                    $next = max($next, $time);
                    if ($type === 'CHARGEBACK' || in_array($o['status'] ?? '', ['Refunded', 'PartialRefund', 'Chargedback', 'Chargeback'], true)) {
                        $p = $this->em->getRepository(Purchase::class)->findOneBy(['transactionId' => 'steam:'.$o['orderid']]);
                        if ($p && $this->shop->refund($p) === 'refunded') {
                            ++$n;
                        }
                    }
                }
            } while (count($orders) >= 1000);
        }

        return ['refunded' => $n, 'next' => $next];
    }

    private function microTxn(): string
    {
        return $this->sandbox ? 'ISteamMicroTxnSandbox' : 'ISteamMicroTxn';
    }

    private function call(string $method, string $path, array $params): array
    {
        $params = ['key' => $this->key, 'appid' => $this->appId] + $params;
        $res = $this->http->request($method, self::API.$path, $method === 'GET' ? ['query' => $params] : ['body' => $params]);
        if ($res->getStatusCode() >= 500) {
            throw new GameError('Steam could not be reached. Try again in a moment.');
        }

        return $res->toArray(false);
    }
}

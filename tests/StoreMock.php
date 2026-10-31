<?php

namespace App\Tests;

use Symfony\Component\HttpClient\Response\MockResponse;

/**
 * Stands in for the stores' servers in tests (config/packages/framework.yaml): RevenueCat's REST API and the Steam
 * Web API. Tests set what the stores should say, and every request is kept to look at.
 */
class StoreMock
{
    /** RevenueCat's subscriber record, by app user id. */
    public static array $subscribers = [];

    /** Steam session tickets and the SteamID each belongs to. */
    public static array $tickets = [];

    public static string $steamCurrency = 'EUR';

    /** Steam order ids the player cancelled in the overlay. */
    public static array $declined = [];

    /** What Steam's GetReport lists. */
    public static array $report = [];

    /** @var list<array{method: string, url: string, body: string}> */
    public static array $calls = [];

    public static function reset(): void
    {
        self::$subscribers = self::$tickets = self::$declined = self::$report = self::$calls = [];
        self::$steamCurrency = 'EUR';
    }

    public function __invoke(string $method, string $url, array $options = []): MockResponse
    {
        $body = is_string($options['body'] ?? null) ? $options['body'] : '';
        self::$calls[] = ['method' => $method, 'url' => $url, 'body' => $body];
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        parse_str($body, $form);
        $in = $query + $form;

        if (preg_match('#api\.revenuecat\.com/v1/subscribers/([^?]+)#', $url, $m)) {
            $id = rawurldecode($m[1]);

            return self::ok(['subscriber' => (self::$subscribers[$id] ?? []) + ['non_subscriptions' => [], 'subscriptions' => [], 'entitlements' => []]]);
        }
        if (str_contains($url, 'AuthenticateUserTicket')) {
            $id = self::$tickets[$in['ticket'] ?? ''] ?? null;

            return self::ok(['response' => $id ? ['params' => ['result' => 'OK', 'steamid' => $id, 'ownersteamid' => $id, 'vacbanned' => false, 'publisherbanned' => false]] : ['error' => ['errorcode' => 101, 'errordesc' => 'Invalid ticket']]]);
        }
        if (str_contains($url, '/GetUserInfo/')) {
            return self::ok(['response' => ['result' => 'OK', 'params' => ['state' => 'CA', 'country' => 'NL', 'currency' => self::$steamCurrency, 'status' => 'Active']]]);
        }
        if (str_contains($url, '/InitTxn/')) {
            return self::ok(['response' => ['result' => 'OK', 'params' => ['orderid' => $in['orderid'] ?? '', 'transid' => '9'.($in['orderid'] ?? '')]]]);
        }
        if (str_contains($url, '/FinalizeTxn/')) {
            return self::ok(['response' => in_array($in['orderid'] ?? '', self::$declined, true)
                ? ['result' => 'Failure', 'error' => ['errorcode' => 100, 'errordesc' => 'Order not approved']]
                : ['result' => 'OK', 'params' => ['orderid' => $in['orderid'] ?? '', 'transid' => '9']]]);
        }
        if (str_contains($url, '/GetReport/')) {
            return self::ok(['response' => ['result' => 'OK', 'params' => ['count' => count(self::$report), 'orders' => ($in['type'] ?? '') === 'GAMESALES' ? self::$report : []]]]);
        }

        return new MockResponse('{"error":"not mocked"}', ['http_code' => 404]);
    }

    private static function ok(array $data): MockResponse
    {
        return new MockResponse(json_encode($data), ['http_code' => 200]);
    }
}

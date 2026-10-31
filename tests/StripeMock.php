<?php

namespace App\Tests;

use Symfony\Component\HttpClient\Response\MockResponse;

/** Stands in for Stripe in tests: a Checkout Session for every request, and the last request kept to look at. */
class StripeMock
{
    public static array $last = [];

    public function __invoke(string $method, string $url, array $options = []): MockResponse
    {
        self::$last = ['method' => $method, 'url' => $url, 'body' => $options['body'] ?? ''];

        return new MockResponse(json_encode(['id' => 'cs_test_'.bin2hex(random_bytes(4)), 'url' => 'https://checkout.stripe.test/pay']), ['http_code' => 200]);
    }
}

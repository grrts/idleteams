<?php

namespace App\Tests\Api;

use App\Tests\StoreMock;

/** Logging in from the native apps: bearer tokens, Steam login and linking, and CORS for the apps' origins. */
class TokenTest extends ApiTestCase
{
    private function bearer(string $method, string $path, ?string $token, array $body = [], array $server = []): array
    {
        $this->client->getCookieJar()->clear();
        $this->client->request($method, '/api'.$path, [], [], ['CONTENT_TYPE' => 'application/json'] + ($token ? ['HTTP_AUTHORIZATION' => 'Bearer '.$token] : []) + $server, $body ? json_encode($body) : null);

        return json_decode($this->client->getResponse()->getContent() ?: 'null', true) ?? [];
    }

    public function testAnAppLogsInWithATokenAndNoCookie(): void
    {
        $res = $this->api('POST', '/register', ['username' => 'mobile', 'password' => 'secret123', 'platform' => 'ios']);
        $this->assertMatchesRegularExpression('/^it_[0-9a-f]{64}$/', $res['token']);
        $this->assertSame('mobile', $this->bearer('GET', '/state', $res['token'])['user']['username'] ?? null);
        $this->assertNull($this->client->getResponse()->headers->getCookies()[0] ?? null, 'a token request makes no session');

        $this->bearer('GET', '/state', 'it_'.str_repeat('0', 64));
        $this->assertSame(401, $this->httpStatus());

        $this->bearer('POST', '/token', null, ['username' => 'mobile', 'password' => 'wrong', 'platform' => 'android']);
        $this->assertSame(401, $this->httpStatus());
        $t2 = $this->bearer('POST', '/token', null, ['username' => 'mobile', 'password' => 'secret123', 'platform' => 'android'])['token'];
        $this->bearer('POST', '/token/revoke', $t2);
        $this->bearer('GET', '/state', $t2);
        $this->assertSame(401, $this->httpStatus());
        $this->bearer('GET', '/state', $res['token']);
        $this->assertSame(200, $this->httpStatus());
    }

    public function testTheSteamBuildLogsInWithTheLinkedSteamAccount(): void
    {
        StoreMock::reset();
        StoreMock::$tickets = ['abcdef0123456789' => '76561198000000009'];
        $this->bearer('POST', '/token/steam', null, ['ticket' => 'abcdef0123456789']);
        $this->assertSame(404, $this->httpStatus());
        $this->assertTrue(json_decode($this->client->getResponse()->getContent(), true)['link']);

        $this->as('valve');
        $this->api('POST', '/account/steam', ['ticket' => 'ffff0000ffff0000']);
        $this->assertSame(400, $this->httpStatus(), 'a ticket Steam does not know');
        $this->api('POST', '/account/steam', ['ticket' => 'abcdef0123456789']);
        $res = $this->bearer('POST', '/token/steam', null, ['ticket' => 'abcdef0123456789']);
        $this->assertSame('valve', $res['username']);
        $this->assertTrue($this->bearer('GET', '/shop', $res['token'])['steamLinked']);

        // one Steam account, one game account
        $this->as('second');
        $this->api('POST', '/account/steam', ['ticket' => 'abcdef0123456789']);
        $this->assertSame(400, $this->httpStatus());
    }

    public function testTheAppsOriginsMayCallTheApi(): void
    {
        $this->bearer('OPTIONS', '/state', null, [], ['HTTP_ORIGIN' => 'capacitor://localhost', 'HTTP_ACCESS_CONTROL_REQUEST_METHOD' => 'GET']);
        $this->assertSame(204, $this->httpStatus());
        $h = $this->client->getResponse()->headers;
        $this->assertSame('capacitor://localhost', $h->get('Access-Control-Allow-Origin'));
        $this->assertStringContainsString('Authorization', $h->get('Access-Control-Allow-Headers'));
        $this->assertNull($h->get('Access-Control-Allow-Credentials'));

        $this->bearer('GET', '/config', null, [], ['HTTP_ORIGIN' => 'https://evil.example']);
        $this->assertNull($this->client->getResponse()->headers->get('Access-Control-Allow-Origin'));
    }
}

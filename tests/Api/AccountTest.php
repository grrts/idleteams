<?php

namespace App\Tests\Api;

/** Adding an email, confirming it and resetting a forgotten password. */
class AccountTest extends ApiTestCase
{
    private function tokenFromLastMail(string $pattern): string
    {
        $mail = self::getMailerMessage();
        $this->assertNotNull($mail, 'a mail was sent');
        $this->assertMatchesRegularExpression($pattern, $mail->getTextBody());
        preg_match($pattern, $mail->getTextBody(), $m);

        return $m[1];
    }

    public function testEmailIsConfirmedThroughTheLinkInTheMail(): void
    {
        $this->as('ann');
        $this->assertFalse($this->api('POST', '/account/email', ['email' => 'Ann@Example.com'])['emailVerified']);
        $this->assertEmailCount(1);
        $token = $this->tokenFromLastMail('~#/verify\?t=([0-9a-f]+)~');
        $this->assertArrayHasKey('error', $this->api('POST', '/account/verify', ['token' => 'nope']));
        $this->assertTrue($this->api('POST', '/account/verify', ['token' => $token])['ok']);
        $user = $this->api('GET', '/state')['user'];
        $this->assertSame('ann@example.com', $user['email']);
        $this->assertTrue($user['emailVerified']);
        $this->assertArrayHasKey('error', $this->api('POST', '/account/verify', ['token' => $token]), 'a token works once');
    }

    public function testAForgottenPasswordIsResetFromTheMail(): void
    {
        $this->as('ann');
        $this->api('POST', '/account/email', ['email' => 'ann@example.com']);
        $this->api('POST', '/logout');
        $this->client->getCookieJar()->clear();

        $this->assertTrue($this->api('POST', '/password/forgot', ['email' => 'nobody@example.com'])['ok'], 'unknown addresses look the same');
        $this->assertEmailCount(0);
        $this->assertTrue($this->api('POST', '/password/forgot', ['email' => 'ann@example.com'])['ok']);
        $token = $this->tokenFromLastMail('~#/reset\?u=ann&t=([0-9a-f]+)~');

        $this->assertArrayHasKey('error', $this->api('POST', '/password/reset', ['username' => 'ann', 'token' => $token, 'password' => 'short']));
        $this->assertTrue($this->api('POST', '/password/reset', ['username' => 'ann', 'token' => $token, 'password' => 'brand-new-pass'])['ok']);
        $this->assertSame('Ann', $this->api('GET', '/state')['hero']['name'], 'the reset logs the player in');

        $this->api('POST', '/logout');
        $this->client->getCookieJar()->clear();
        $this->assertArrayNotHasKey('ok', $this->api('POST', '/login', ['username' => 'ann', 'password' => 'secret123']));
        $this->assertTrue($this->api('POST', '/login', ['username' => 'ann', 'password' => 'brand-new-pass'])['ok']);
    }
}

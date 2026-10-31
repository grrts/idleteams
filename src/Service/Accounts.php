<?php

namespace App\Service;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\Mailer\MailerInterface;
use Symfony\Component\Mime\Address;
use Symfony\Component\Mime\Email;
use Symfony\Component\PasswordHasher\Hasher\UserPasswordHasherInterface;

/**
 * Email on an account: adding and verifying an address, and resetting a forgotten password. Links in the mails point
 * at the game (APP_URL/#/verify or #/reset) and carry a one-time token; only its sha256 is stored.
 */
class Accounts
{
    public const VERIFY_SECONDS = 172800;
    public const RESET_SECONDS = 3600;

    public function __construct(
        private EntityManagerInterface $em,
        private MailerInterface $mailer,
        private UserPasswordHasherInterface $hasher,
        private ApiTokens $tokens,
        #[Autowire('%env(APP_URL)%')] private string $appUrl,
        #[Autowire('%env(MAILER_FROM)%')] private string $from,
    ) {
    }

    public function setEmail(User $u, string $email): void
    {
        $email = strtolower(trim($email));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 180) {
            throw new GameError('That does not look like an email address.');
        }
        if ($email === $u->email && $u->emailVerified) {
            return;
        }
        $other = $this->em->getRepository(User::class)->findOneBy(['email' => $email]);
        if ($other && $other !== $u) {
            throw new GameError('Another account already uses that address.');
        }
        $u->email = $email;
        $u->emailVerified = false;
        $token = $this->issue($u, 'verify', self::VERIFY_SECONDS);
        $this->send($u, 'Confirm your email for Idle Teams', sprintf(
            "Hello %s,\n\nConfirm this address for your Idle Teams account by opening:\n\n%s/#/verify?t=%s\n\nThe link works for 48 hours. If you did not ask for this, ignore this mail.\n",
            $u->username, rtrim($this->appUrl, '/'), $token,
        ));
    }

    public function verify(User $u, string $token): void
    {
        $this->consume($u, 'verify', $token);
        $u->emailVerified = true;
    }

    /** Always succeeds from the outside, so nobody can test which addresses have an account. */
    public function forgot(string $email): void
    {
        $u = $this->em->getRepository(User::class)->findOneBy(['email' => strtolower(trim($email))]);
        if (!$u || $u->demo) {
            return;
        }
        $token = $this->issue($u, 'reset', self::RESET_SECONDS);
        $this->send($u, 'Reset your Idle Teams password', sprintf(
            "Hello %s,\n\nSomeone asked to reset the password of your Idle Teams account. To choose a new one, open:\n\n%s/#/reset?u=%s&t=%s\n\nThe link works for one hour. If it was not you, ignore this mail: your password stays as it is.\n",
            $u->username, rtrim($this->appUrl, '/'), rawurlencode($u->username), $token,
        ));
    }

    public function reset(string $username, string $token, string $password): User
    {
        $u = $this->em->getRepository(User::class)->findOneBy(['username' => strtolower(trim($username))])
            ?? throw new GameError('That reset link is not valid any more. Ask for a new one.');
        if (strlen($password) < 8) {
            throw new GameError('Use a password of at least 8 characters.');
        }
        $this->consume($u, 'reset', $token);
        $u->password = $this->hasher->hashPassword($u, $password);
        // a new password ends every app login
        $this->tokens->revokeAll($u);
        // Whoever could read the mail could reset; the address is proven now.
        $u->emailVerified = true;

        return $u;
    }

    private function issue(User $u, string $kind, int $seconds): string
    {
        $token = bin2hex(random_bytes(24));
        $u->tokenKind = $kind;
        $u->tokenHash = hash('sha256', $token);
        $u->tokenExpiresAt = time() + $seconds;

        return $token;
    }

    private function consume(User $u, string $kind, string $token): void
    {
        $ok = $u->tokenKind === $kind && $u->tokenHash !== null && $u->tokenExpiresAt >= time() && hash_equals($u->tokenHash, hash('sha256', $token));
        if (!$ok) {
            throw new GameError($kind === 'reset' ? 'That reset link is not valid any more. Ask for a new one.' : 'That confirmation link is not valid any more. Add the address again for a new one.');
        }
        $u->tokenKind = $u->tokenHash = null;
        $u->tokenExpiresAt = 0;
    }

    private function send(User $u, string $subject, string $text): void
    {
        $this->mailer->send((new Email())->from(Address::create($this->from))->to(new Address((string) $u->email, $u->username))->subject($subject)->text($text));
    }
}

<?php

namespace App\EventListener;

use App\Service\ErrorReporter;
use App\Service\GameError;
use Symfony\Component\Console\ConsoleEvents;
use Symfony\Component\Console\Event\ConsoleErrorEvent;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\ExceptionEvent;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\KernelEvents;
use Symfony\Component\Security\Core\Exception\AccessDeniedException;
use Symfony\Component\Security\Core\Exception\AuthenticationException;

/** Server errors (not a player's mistake, not a 4xx) from requests and from cron commands go to ErrorReporter. */
final class ErrorReportListener
{
    public function __construct(private ErrorReporter $reporter)
    {
    }

    #[AsEventListener(event: KernelEvents::EXCEPTION, priority: 10)]
    public function onException(ExceptionEvent $event): void
    {
        $e = $event->getThrowable();
        if ($e instanceof GameError || $e instanceof AccessDeniedException || $e instanceof AuthenticationException
            || ($e instanceof HttpExceptionInterface && $e->getStatusCode() < 500)) {
            return;
        }
        $r = $event->getRequest();
        $this->reporter->report($e, $r->getMethod().' '.$r->getPathInfo());
    }

    #[AsEventListener(event: ConsoleEvents::ERROR)]
    public function onConsoleError(ConsoleErrorEvent $event): void
    {
        $this->reporter->report($event->getError(), 'console '.($event->getCommand()?->getName() ?? '?'));
    }
}

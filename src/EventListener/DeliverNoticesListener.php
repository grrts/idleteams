<?php

namespace App\EventListener;

use App\Service\Notifier;
use Symfony\Component\EventDispatcher\Attribute\AsEventListener;
use Symfony\Component\HttpKernel\Event\TerminateEvent;
use Symfony\Component\HttpKernel\KernelEvents;

/** After the response has gone out, push what this request caused (an invite, an application, a finished run). */
#[AsEventListener(event: KernelEvents::TERMINATE)]
final class DeliverNoticesListener
{
    public function __construct(private Notifier $notifier)
    {
    }

    public function __invoke(TerminateEvent $event): void
    {
        if (str_starts_with($event->getRequest()->getPathInfo(), '/api/')) {
            try {
                $this->notifier->deliver();
            } catch (\Throwable) {
                // The cron tick tries again in a minute.
            }
        }
    }
}

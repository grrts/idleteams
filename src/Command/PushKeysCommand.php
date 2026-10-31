<?php

namespace App\Command;

use App\Service\WebPush;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'app:push:keys', description: 'Make the VAPID key pair for push notifications')]
class PushKeysCommand extends Command
{
    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $k = WebPush::newKeys();
        $output->writeln('Add these to .env.local (keep the private key secret; changing it means every player turns notifications on again):');
        $output->writeln('');
        $output->writeln('VAPID_PRIVATE_KEY='.$k['private']);
        $output->writeln('VAPID_SUBJECT=mailto:you@your-domain');

        return Command::SUCCESS;
    }
}

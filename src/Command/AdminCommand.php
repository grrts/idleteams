<?php

namespace App\Command;

use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\Console\Attribute\AsCommand;
use Symfony\Component\Console\Command\Command;
use Symfony\Component\Console\Input\InputArgument;
use Symfony\Component\Console\Input\InputInterface;
use Symfony\Component\Console\Input\InputOption;
use Symfony\Component\Console\Output\OutputInterface;

#[AsCommand(name: 'app:admin', description: 'Make an account a moderator (or take it away with --revoke)')]
class AdminCommand extends Command
{
    public function __construct(private EntityManagerInterface $em)
    {
        parent::__construct();
    }

    protected function configure(): void
    {
        $this->addArgument('username', InputArgument::REQUIRED)->addOption('revoke', null, InputOption::VALUE_NONE, 'Remove the moderator role');
    }

    protected function execute(InputInterface $input, OutputInterface $output): int
    {
        $u = $this->em->getRepository(User::class)->findOneBy(['username' => strtolower((string) $input->getArgument('username'))]);
        if (!$u) {
            $output->writeln('<error>No such account.</error>');

            return Command::FAILURE;
        }
        $u->admin = !$input->getOption('revoke');
        $this->em->flush();
        $output->writeln(sprintf('%s is %s a moderator.', $u->username, $u->admin ? 'now' : 'no longer'));

        return Command::SUCCESS;
    }
}

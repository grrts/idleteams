<?php

namespace App\Controller;

use App\Entity\Hero;
use App\Entity\User;
use App\Service\GameError;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;

/** Shared helpers for the JSON API. */
abstract class ApiController extends AbstractController
{
    public function __construct(protected EntityManagerInterface $em)
    {
    }

    protected function me(): User
    {
        $u = $this->getUser();
        if (!$u instanceof User) {
            throw new GameError('Log in first.');
        }

        return $u;
    }

    protected function hero(): Hero
    {
        return $this->em->getRepository(Hero::class)->findOneBy(['user' => $this->me()])
            ?? throw new GameError('Create a hero first.');
    }

    protected function body(Request $r): array
    {
        $data = json_decode($r->getContent() ?: '{}', true);

        return is_array($data) ? $data : [];
    }

    /** @template T @param class-string<T> $class @return T */
    protected function find(string $class, mixed $id): object
    {
        return $this->em->find($class, (int) $id) ?? throw new GameError('Not found.');
    }

    protected function heroByName(string $name): Hero
    {
        return $this->em->getRepository(Hero::class)->findOneBy(['name' => trim($name)])
            ?? throw new GameError("No hero called $name.");
    }
}

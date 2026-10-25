<?php

namespace App\Controller;

use App\Entity\Hero;
use App\Entity\Party;
use App\Entity\PartyRequest;
use App\Entity\TavernPost;
use App\Service\GameError;
use App\Service\Present;
use App\Service\Social;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\Routing\Attribute\Route;

class PartyController extends ApiController
{
    #[Route('/api/party/{action}', methods: ['POST'], requirements: ['action' => 'create|leave|kick|settings|resume|invite|apply'])]
    public function act(string $action, Request $r, Social $social): JsonResponse
    {
        $h = $this->hero();
        $in = $this->body($r);
        match ($action) {
            'create' => $social->createParty($h, (string) ($in['name'] ?? '')),
            'leave' => $social->leave($h),
            'kick' => $social->kick($h, $this->find(Hero::class, $in['hero'] ?? 0)),
            'settings' => $social->settings($h, $in),
            'resume' => $social->resume($h),
            'invite' => $social->invite($h, isset($in['hero']) ? $this->find(Hero::class, $in['hero']) : $this->heroByName((string) ($in['name'] ?? '')), (string) ($in['message'] ?? '')),
            'apply' => $social->apply($h, $this->find(Party::class, $in['party'] ?? 0), (string) ($in['message'] ?? '')),
        };
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/request/{id}/{answer}', methods: ['POST'], requirements: ['answer' => 'accept|decline'])]
    public function answer(int $id, string $answer, Social $social): JsonResponse
    {
        $h = $this->hero();
        $req = $this->em->find(PartyRequest::class, $id) ?? throw new GameError('That request is gone.');
        $answer === 'accept' ? $social->accept($h, $req) : $social->decline($h, $req);
        $this->em->flush();

        return $this->json(['ok' => true]);
    }

    #[Route('/api/tavern', methods: ['GET'])]
    public function tavern(Present $present): JsonResponse
    {
        $h = $this->hero();
        $posts = $this->em->getRepository(TavernPost::class)->findBy([], ['id' => 'DESC'], 100);
        $heroes = $this->em->getRepository(Hero::class)->createQueryBuilder('x')
            ->where('x.party IS NULL')->andWhere('x != :me')->setParameter('me', $h)
            ->orderBy('x.level', 'DESC')->setMaxResults(40)->getQuery()->getResult();

        return $this->json([
            'posts' => array_map(fn (TavernPost $t) => $present->tavernPost($t), $posts),
            'freeHeroes' => array_map(fn (Hero $x) => $present->heroCard($x), $heroes),
        ]);
    }

    #[Route('/api/tavern', methods: ['POST'])]
    public function post(Request $r, Social $social, Present $present): JsonResponse
    {
        $in = $this->body($r);
        $t = $social->postTavern($this->hero(), (string) ($in['kind'] ?? ''), (string) ($in['text'] ?? ''), (array) ($in['roles'] ?? []));
        $this->em->flush();

        return $this->json($present->tavernPost($t));
    }

    #[Route('/api/tavern/{id}', methods: ['DELETE'])]
    public function remove(int $id, Social $social): JsonResponse
    {
        $social->removeTavern($this->hero(), $this->find(TavernPost::class, $id));
        $this->em->flush();

        return $this->json(['ok' => true]);
    }
}

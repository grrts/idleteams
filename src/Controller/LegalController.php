<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/**
 * The terms and the privacy policy, as plain pages. Who runs the game comes from LEGAL_OPERATOR, LEGAL_ADDRESS and
 * LEGAL_CONTACT; until they are set the pages say so at the top. Have both texts read by a lawyer before launch.
 */
class LegalController extends AbstractController
{
    public const UPDATED = '2026-10-31';

    public function __construct(
        #[Autowire('%env(LEGAL_OPERATOR)%')] private string $operator,
        #[Autowire('%env(LEGAL_ADDRESS)%')] private string $address,
        #[Autowire('%env(LEGAL_CONTACT)%')] private string $contact,
    ) {
    }

    #[Route('/terms', methods: ['GET'])]
    public function terms(): Response
    {
        return $this->page('terms', 'Terms of use');
    }

    #[Route('/privacy', methods: ['GET'])]
    public function privacy(): Response
    {
        return $this->page('privacy', 'Privacy policy');
    }

    private function page(string $name, string $title): Response
    {
        return $this->render('legal/'.$name.'.html.twig', [
            'title' => $title, 'updated' => self::UPDATED,
            'operator' => $this->operator ?: null, 'address' => $this->address ?: null, 'contact' => $this->contact ?: null,
        ]);
    }
}

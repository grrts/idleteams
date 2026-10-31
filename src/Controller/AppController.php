<?php

namespace App\Controller;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

/** Serves the single-page game client. All game data goes through /api. */
class AppController extends AbstractController
{
    #[Route('/', methods: ['GET'])]
    public function index(): Response
    {
        // File times bust browser caches after a deploy.
        $dir = $this->getParameter('kernel.project_dir').'/public/assets/';
        $version = max(array_map(fn ($f) => (int) @filemtime($dir.$f), ['app.js', 'app.css', 'pixel.js']));

        return $this->render('app.html.twig', ['version' => $version]);
    }
}

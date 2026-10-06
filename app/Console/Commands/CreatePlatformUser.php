<?php

namespace App\Console\Commands;

use App\Models\PlatformRole;
use App\Models\PlatformUser;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Symfony\Component\Console\Output\OutputInterface;

/**
 * Bootstrap du tout premier utilisateur de la console superadmin (rôle Superadmin,
 * accès illimité) — équivalent CLI d'un seeder. Reste nécessaire même après
 * l'écran « Utilisateurs transverses » (Phase 2) : il faut bien un premier compte
 * pour se connecter et en créer d'autres via cet écran.
 */
class CreatePlatformUser extends Command
{
    protected $signature = 'platform:users:create {email} {name}';

    protected $description = 'Crée un utilisateur de la console superadmin (plateforme ADMIN)';

    public function handle(): int
    {
        $email = $this->argument('email');
        $name = $this->argument('name');

        if (PlatformUser::where('email', $email)->exists()) {
            $this->error("Un utilisateur plateforme existe déjà avec l'e-mail {$email}.");

            return self::FAILURE;
        }

        $superadminRole = PlatformRole::where('slug', 'superadmin')->firstOrFail();
        $password = Str::password(16);

        PlatformUser::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make($password),
            'platform_role_id' => $superadminRole->id,
            'is_active' => true,
        ]);

        $this->info("Utilisateur plateforme créé (rôle Superadmin) : {$email}");
        $this->line('Mot de passe temporaire (affiché une seule fois, ci-dessous entre crochets) :');
        // Écriture brute (OUTPUT_RAW) : un mot de passe aléatoire peut contenir '<'/'>' que le
        // formateur Symfony Console interprèterait à tort comme une balise de style, tronquant
        // ou altérant l'affichage — inacceptable pour un secret transmis une seule fois.
        $this->output->writeln("[{$password}]", OutputInterface::OUTPUT_RAW);
        $this->line('La double authentification sera configurée à la première connexion.');

        return self::SUCCESS;
    }
}

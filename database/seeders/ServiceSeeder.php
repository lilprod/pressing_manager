<?php

namespace Database\Seeders;

use App\Models\Agency;
use App\Models\Service;
use Illuminate\Database\Seeder;

class ServiceSeeder extends Seeder
{
    /**
     * Catalogue générique initial : remplacé par le catalogue détaillé ci-dessous
     * (issu de l'historique du pressing), mais gardé ici pour désactiver proprement
     * les lignes déjà en base plutôt que de les supprimer (order_items les référence).
     */
    public const LEGACY_SERVICES = [
        ['code' => 'NETT-CHEMISE', 'name' => 'Nettoyage chemise', 'category' => 'nettoyage', 'base_price' => 1000, 'estimated_duration_hours' => 24],
        ['code' => 'NETT-COSTUME', 'name' => 'Nettoyage costume', 'category' => 'nettoyage', 'base_price' => 3500, 'estimated_duration_hours' => 48],
        ['code' => 'NETT-ROBE', 'name' => 'Nettoyage robe', 'category' => 'nettoyage', 'base_price' => 3000, 'estimated_duration_hours' => 48],
        ['code' => 'REPAS-CHEMISE', 'name' => 'Repassage chemise', 'category' => 'repassage', 'base_price' => 500, 'estimated_duration_hours' => 12],
        ['code' => 'REPAS-PANTALON', 'name' => 'Repassage pantalon', 'category' => 'repassage', 'base_price' => 500, 'estimated_duration_hours' => 12],
        ['code' => 'RETOUCHE-OURLET', 'name' => 'Retouche ourlet', 'category' => 'retouche', 'base_price' => 1500, 'estimated_duration_hours' => 48],
        ['code' => 'TEINTURE-STD', 'name' => 'Teinture standard', 'category' => 'teinture', 'base_price' => 4000, 'estimated_duration_hours' => 72],
    ];

    /**
     * Catalogue historique du pressing (table `articles` de l'ancienne base MySQL) :
     * un article = trois tarifs (repassage / lavage / nettoyage), repris tels quels.
     * id = identifiant de l'article dans l'ancienne base, réutilisé pour des codes stables.
     */
    public const ARTICLES = [
        ['id' => 1, 'title' => 'Chemise MC', 'repassage_price' => 500, 'lavage_price' => 1000, 'nettoyage_price' => 700],
        ['id' => 2, 'title' => 'Cravate', 'repassage_price' => 100, 'lavage_price' => 700, 'nettoyage_price' => 500],
        ['id' => 3, 'title' => 'Pantalon', 'repassage_price' => 300, 'lavage_price' => 800, 'nettoyage_price' => 1000],
        ['id' => 4, 'title' => 'Boubou Traditionnel', 'repassage_price' => 1000, 'lavage_price' => 3500, 'nettoyage_price' => 1500],
        ['id' => 5, 'title' => 'Boubou 2P', 'repassage_price' => 1000, 'lavage_price' => 4000, 'nettoyage_price' => 1500],
        ['id' => 6, 'title' => 'Boubou 3P', 'repassage_price' => 1500, 'lavage_price' => 4500, 'nettoyage_price' => 2500],
        ['id' => 7, 'title' => 'Boubou P', 'repassage_price' => 600, 'lavage_price' => 2000, 'nettoyage_price' => 1000],
        ['id' => 8, 'title' => 'Caleçon', 'repassage_price' => 250, 'lavage_price' => 1000, 'nettoyage_price' => 500],
        ['id' => 9, 'title' => 'Camisole', 'repassage_price' => 200, 'lavage_price' => 800, 'nettoyage_price' => 300],
        ['id' => 10, 'title' => 'Casquette', 'repassage_price' => 100, 'lavage_price' => 500, 'nettoyage_price' => 300],
        ['id' => 11, 'title' => 'Chaussette enf', 'repassage_price' => 50, 'lavage_price' => 200, 'nettoyage_price' => 100],
        ['id' => 12, 'title' => 'Chaussure enf', 'repassage_price' => 100, 'lavage_price' => 600, 'nettoyage_price' => 500],
        ['id' => 14, 'title' => 'Chemise enf', 'repassage_price' => 150, 'lavage_price' => 500, 'nettoyage_price' => 300],
        ['id' => 15, 'title' => 'Chemisier', 'repassage_price' => 350, 'lavage_price' => 1000, 'nettoyage_price' => 600],
        ['id' => 16, 'title' => 'Combinaison (mécanicien)', 'repassage_price' => 1000, 'lavage_price' => 5000, 'nettoyage_price' => 3500],
        ['id' => 17, 'title' => 'Combinaison dame', 'repassage_price' => 500, 'lavage_price' => 2000, 'nettoyage_price' => 1000],
        ['id' => 18, 'title' => 'Combinaison enf', 'repassage_price' => 200, 'lavage_price' => 800, 'nettoyage_price' => 400],
        ['id' => 19, 'title' => 'Corsage', 'repassage_price' => 350, 'lavage_price' => 1000, 'nettoyage_price' => 600],
        ['id' => 20, 'title' => 'Corsage enf', 'repassage_price' => 150, 'lavage_price' => 500, 'nettoyage_price' => 300],
        ['id' => 21, 'title' => 'Costume 2P', 'repassage_price' => 1500, 'lavage_price' => 5000, 'nettoyage_price' => 3000],
        ['id' => 22, 'title' => 'Costume 3P', 'repassage_price' => 1700, 'lavage_price' => 6000, 'nettoyage_price' => 3500],
        ['id' => 23, 'title' => 'Costume 3P enf', 'repassage_price' => 1000, 'lavage_price' => 3500, 'nettoyage_price' => 1500],
        ['id' => 24, 'title' => 'Costume enf', 'repassage_price' => 600, 'lavage_price' => 2500, 'nettoyage_price' => 1000],
        ['id' => 25, 'title' => 'Couverture GM', 'repassage_price' => 2000, 'lavage_price' => 5000, 'nettoyage_price' => 3000],
        ['id' => 26, 'title' => 'Couverture Mby', 'repassage_price' => 1500, 'lavage_price' => 4500, 'nettoyage_price' => 2500],
        ['id' => 27, 'title' => 'Couverture NM', 'repassage_price' => 700, 'lavage_price' => 2500, 'nettoyage_price' => 1500],
        ['id' => 28, 'title' => 'Cravate', 'repassage_price' => 300, 'lavage_price' => 1000, 'nettoyage_price' => 600],
        ['id' => 29, 'title' => 'Cravate enf', 'repassage_price' => 100, 'lavage_price' => 600, 'nettoyage_price' => 300],
        ['id' => 30, 'title' => 'Culotte', 'repassage_price' => 400, 'lavage_price' => 1200, 'nettoyage_price' => 600],
        ['id' => 31, 'title' => 'Culotte enf', 'repassage_price' => 150, 'lavage_price' => 600, 'nettoyage_price' => 300],
        ['id' => 32, 'title' => 'Débardeur', 'repassage_price' => 200, 'lavage_price' => 800, 'nettoyage_price' => 500],
        ['id' => 33, 'title' => 'Débardeur enf', 'repassage_price' => 100, 'lavage_price' => 400, 'nettoyage_price' => 200],
        ['id' => 34, 'title' => 'Draps', 'repassage_price' => 500, 'lavage_price' => 2500, 'nettoyage_price' => 1500],
        ['id' => 35, 'title' => 'Ens 3P enf', 'repassage_price' => 500, 'lavage_price' => 2000, 'nettoyage_price' => 1000],
        ['id' => 36, 'title' => 'Ens bazin enf', 'repassage_price' => 400, 'lavage_price' => 1500, 'nettoyage_price' => 500],
        ['id' => 37, 'title' => 'Ensemble', 'repassage_price' => 800, 'lavage_price' => 2500, 'nettoyage_price' => 1500],
        ['id' => 38, 'title' => 'Ensemble Draps', 'repassage_price' => 1000, 'lavage_price' => 4000, 'nettoyage_price' => 2500],
        ['id' => 39, 'title' => 'Ensemble 3P', 'repassage_price' => 1000, 'lavage_price' => 3500, 'nettoyage_price' => 2000],
        ['id' => 40, 'title' => 'Ensemble enf', 'repassage_price' => 400, 'lavage_price' => 1500, 'nettoyage_price' => 500],
        ['id' => 41, 'title' => 'Ensemble pagne', 'repassage_price' => 800, 'lavage_price' => 3000, 'nettoyage_price' => 1500],
        ['id' => 42, 'title' => 'Gants', 'repassage_price' => 200, 'lavage_price' => 700, 'nettoyage_price' => 500],
        ['id' => 43, 'title' => 'Gilet adulte', 'repassage_price' => 200, 'lavage_price' => 1000, 'nettoyage_price' => 500],
        ['id' => 44, 'title' => 'Gilet enf', 'repassage_price' => 150, 'lavage_price' => 500, 'nettoyage_price' => 200],
        ['id' => 45, 'title' => 'Haut traditionnel', 'repassage_price' => 500, 'lavage_price' => 2000, 'nettoyage_price' => 1500],
        ['id' => 46, 'title' => 'Imperméable', 'repassage_price' => 1000, 'lavage_price' => 3000, 'nettoyage_price' => 3000],
        ['id' => 47, 'title' => 'Jupe', 'repassage_price' => 400, 'lavage_price' => 1500, 'nettoyage_price' => 600],
        ['id' => 48, 'title' => 'Jupe enf', 'repassage_price' => 150, 'lavage_price' => 500, 'nettoyage_price' => 200],
        ['id' => 49, 'title' => 'Manteau', 'repassage_price' => 2000, 'lavage_price' => 6000, 'nettoyage_price' => 3000],
        ['id' => 50, 'title' => 'Manteau PM', 'repassage_price' => 1000, 'lavage_price' => 3500, 'nettoyage_price' => 2000],
        ['id' => 51, 'title' => 'Mini robe', 'repassage_price' => 500, 'lavage_price' => 1500, 'nettoyage_price' => 1000],
        ['id' => 52, 'title' => 'Napins', 'repassage_price' => 150, 'lavage_price' => 500, 'nettoyage_price' => 300],
        ['id' => 53, 'title' => 'Nappe', 'repassage_price' => 500, 'lavage_price' => 2000, 'nettoyage_price' => 800],
        ['id' => 54, 'title' => 'Pagne 3P', 'repassage_price' => 800, 'lavage_price' => 3000, 'nettoyage_price' => 2000],
        ['id' => 55, 'title' => 'Paire de chaussettes', 'repassage_price' => 100, 'lavage_price' => 400, 'nettoyage_price' => 250],
        ['id' => 56, 'title' => 'Paire de chaussures', 'repassage_price' => 300, 'lavage_price' => 2000, 'nettoyage_price' => 1000],
        ['id' => 57, 'title' => 'Pantalon', 'repassage_price' => 500, 'lavage_price' => 2000, 'nettoyage_price' => 1100],
        ['id' => 58, 'title' => 'Pantalon 3/4', 'repassage_price' => 300, 'lavage_price' => 1500, 'nettoyage_price' => 700],
        ['id' => 59, 'title' => 'Pantalon enf', 'repassage_price' => 100, 'lavage_price' => 700, 'nettoyage_price' => 400],
        ['id' => 60, 'title' => 'Provisoire haut', 'repassage_price' => 800, 'lavage_price' => 2000, 'nettoyage_price' => 1000],
        ['id' => 61, 'title' => 'Provisoire MC', 'repassage_price' => 1200, 'lavage_price' => 3500, 'nettoyage_price' => 2500],
        ['id' => 62, 'title' => 'Provisoire ML', 'repassage_price' => 1200, 'lavage_price' => 4000, 'nettoyage_price' => 2500],
        ['id' => 63, 'title' => 'Pull over', 'repassage_price' => 300, 'lavage_price' => 1500, 'nettoyage_price' => 800],
        ['id' => 64, 'title' => 'Pyjama enf', 'repassage_price' => 300, 'lavage_price' => 1500, 'nettoyage_price' => 500],
        ['id' => 65, 'title' => 'Robe', 'repassage_price' => 800, 'lavage_price' => 2500, 'nettoyage_price' => 1200],
        ['id' => 66, 'title' => 'Robe de mariage', 'repassage_price' => 2500, 'lavage_price' => 10000, 'nettoyage_price' => 4000],
        ['id' => 67, 'title' => 'Robe de nuit', 'repassage_price' => 400, 'lavage_price' => 2000, 'nettoyage_price' => 1000],
        ['id' => 68, 'title' => 'Robe enfant', 'repassage_price' => 300, 'lavage_price' => 1000, 'nettoyage_price' => 500],
        ['id' => 69, 'title' => 'Serpillère', 'repassage_price' => 500, 'lavage_price' => 2500, 'nettoyage_price' => 1500],
        ['id' => 70, 'title' => 'Serviette GM', 'repassage_price' => 500, 'lavage_price' => 2000, 'nettoyage_price' => 1000],
        ['id' => 71, 'title' => 'Serviette Moyen', 'repassage_price' => 350, 'lavage_price' => 1000, 'nettoyage_price' => 700],
        ['id' => 72, 'title' => 'Serviette PM', 'repassage_price' => 200, 'lavage_price' => 600, 'nettoyage_price' => 500],
        ['id' => 73, 'title' => 'Smoking', 'repassage_price' => 1200, 'lavage_price' => 3500, 'nettoyage_price' => 2500],
        ['id' => 74, 'title' => 'Taie', 'repassage_price' => 150, 'lavage_price' => 500, 'nettoyage_price' => 200],
        ['id' => 75, 'title' => 'Tailleur', 'repassage_price' => 1000, 'lavage_price' => 3000, 'nettoyage_price' => 2000],
        ['id' => 76, 'title' => 'Tailleur 3P', 'repassage_price' => 1000, 'lavage_price' => 4000, 'nettoyage_price' => 2000],
        ['id' => 77, 'title' => 'T-Shirt', 'repassage_price' => 350, 'lavage_price' => 1000, 'nettoyage_price' => 600],
        ['id' => 78, 'title' => 'T-Shirt enf', 'repassage_price' => 150, 'lavage_price' => 500, 'nettoyage_price' => 300],
        ['id' => 79, 'title' => 'Veste Dame', 'repassage_price' => 600, 'lavage_price' => 2000, 'nettoyage_price' => 1000],
        ['id' => 80, 'title' => 'Veste Homme', 'repassage_price' => 1000, 'lavage_price' => 3000, 'nettoyage_price' => 2000],
    ];

    /** Délai estimé par type de traitement (repris de l'ancienne table `delivery_hours`). */
    private const DURATIONS = [
        'repassage' => 24,
        'lavage' => 48,
        'nettoyage' => 48,
    ];

    public function run(): void
    {
        // Le catalogue générique initial est désactivé (pas supprimé : des order_items
        // existants peuvent encore y faire référence) au profit du catalogue détaillé.
        foreach (self::LEGACY_SERVICES as $service) {
            Service::query()->updateOrCreate(['code' => $service['code']], [
                ...$service,
                'is_active' => false,
            ]);
        }

        $services = collect();

        foreach (self::ARTICLES as $article) {
            $services->push(Service::query()->updateOrCreate(
                ['code' => "REP-{$article['id']}"],
                [
                    'name' => "Repassage - {$article['title']}",
                    'category' => 'repassage',
                    'description' => "Article historique #{$article['id']}",
                    'base_price' => $article['repassage_price'],
                    'estimated_duration_hours' => self::DURATIONS['repassage'],
                    'is_active' => true,
                ],
            ));

            $services->push(Service::query()->updateOrCreate(
                ['code' => "LAV-{$article['id']}"],
                [
                    'name' => "Lavage - {$article['title']}",
                    'category' => 'nettoyage',
                    'description' => "Article historique #{$article['id']}",
                    'base_price' => $article['lavage_price'],
                    'estimated_duration_hours' => self::DURATIONS['lavage'],
                    'is_active' => true,
                ],
            ));

            $services->push(Service::query()->updateOrCreate(
                ['code' => "NET-{$article['id']}"],
                [
                    'name' => "Nettoyage - {$article['title']}",
                    'category' => 'nettoyage',
                    'description' => "Article historique #{$article['id']}",
                    'base_price' => $article['nettoyage_price'],
                    'estimated_duration_hours' => self::DURATIONS['nettoyage'],
                    'is_active' => true,
                ],
            ));
        }

        // Chaque service est disponible dans chaque agence, au tarif de base par défaut.
        foreach (Agency::all() as $agency) {
            foreach ($services as $service) {
                $agency->services()->syncWithoutDetaching([
                    $service->id => ['is_active' => true],
                ]);
            }
        }
    }
}

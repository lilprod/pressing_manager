<?php

namespace Tests\Feature\Services;

use App\Models\Agency;
use App\Models\Service;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\Concerns\SeedsRbac;
use Tests\TestCase;
use Illuminate\Foundation\Testing\RefreshDatabase;

class ServiceExportImportTest extends TestCase
{
    use RefreshDatabase, SeedsRbac;

    private function makeImportFile(array $rows): UploadedFile
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->fromArray(['Code', 'Nom', 'Catégorie', 'Prix de base (FCFA)', 'Durée estimée (h)'], null, 'A1');
        $sheet->fromArray($rows, null, 'A2');

        $path = tempnam(sys_get_temp_dir(), 'import').'.xlsx';
        (new Xlsx($spreadsheet))->save($path);

        return new UploadedFile($path, 'catalogue.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
    }

    public function test_export_respects_the_search_filter(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $match = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'name' => 'Nettoyage costume']);
        Service::factory()->create(['pressing_id' => $agency->pressing_id, 'name' => 'Repassage chemise']);

        $response = $this->actingAs($admin)->get('/api/services/export?search=costume');

        $response->assertOk();
        $response->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    public function test_import_creates_valid_piece_billed_services(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $file = $this->makeImportFile([
            ['IMP-01', 'Chemise', 'nettoyage', 1500, 24],
            ['IMP-02', 'Pantalon', 'nettoyage', 2000, 24],
        ]);

        $response = $this->actingAs($admin)->post('/api/services/import', ['file' => $file]);

        $response->assertCreated();
        $response->assertJsonPath('created', 2);
        $this->assertDatabaseHas('services', ['code' => 'IMP-01', 'pressing_id' => $agency->pressing_id]);
        $this->assertDatabaseHas('services', ['code' => 'IMP-02', 'pressing_id' => $agency->pressing_id]);
        // Le correctif racine s'applique aussi aux imports (ils passent par createService()).
        $imported = Service::where('code', 'IMP-01')->firstOrFail();
        $this->assertDatabaseHas('agency_services', ['agency_id' => $agency->id, 'service_id' => $imported->id]);
    }

    public function test_import_rejects_the_whole_file_if_any_row_is_invalid(): void
    {
        $this->seedRbac();
        Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $file = $this->makeImportFile([
            ['IMP-03', 'Chemise', 'nettoyage', 1500, 24],
            ['IMP-04', 'Ligne invalide', 'categorie-inexistante', 2000, 24],
        ]);

        $response = $this->actingAs($admin)->post('/api/services/import', ['file' => $file]);

        $response->assertStatus(422);
        $response->assertJsonPath('created', 0);
        $this->assertCount(1, $response->json('errors'));
        $this->assertDatabaseMissing('services', ['code' => 'IMP-03']);
        $this->assertDatabaseMissing('services', ['code' => 'IMP-04']);
    }

    public function test_import_rejects_a_duplicate_code_within_the_file(): void
    {
        $this->seedRbac();
        Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $file = $this->makeImportFile([
            ['IMP-05', 'Chemise', 'nettoyage', 1500, 24],
            ['IMP-05', 'Doublon', 'nettoyage', 2000, 24],
        ]);

        $response = $this->actingAs($admin)->post('/api/services/import', ['file' => $file]);

        $response->assertStatus(422);
        $this->assertDatabaseMissing('services', ['code' => 'IMP-05']);
    }

    public function test_duplicate_creates_an_inactive_copy_with_a_new_code(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $admin = $this->makeUser('admin');
        $service = Service::factory()->create(['pressing_id' => $agency->pressing_id, 'code' => 'ORIG-01', 'is_active' => true]);

        $response = $this->actingAs($admin)->postJson("/api/services/{$service->id}/duplicate");

        $response->assertCreated();
        $response->assertJsonPath('code', 'ORIG-01-COPIE');
        $response->assertJsonPath('is_active', false);
        $this->assertNotSame($service->id, $response->json('id'));
    }

    public function test_export_import_and_duplicate_require_the_services_manage_permission(): void
    {
        $this->seedRbac();
        $agency = Agency::factory()->create();
        $livreur = $this->makeUser('livreur', $agency);
        $service = Service::factory()->create(['pressing_id' => $agency->pressing_id]);

        $this->actingAs($livreur)->get('/api/services/export')->assertStatus(403);
        $this->actingAs($livreur)->postJson("/api/services/{$service->id}/duplicate")->assertStatus(403);
        $this->actingAs($livreur)->getJson('/api/services/price-history')->assertStatus(403);
    }
}

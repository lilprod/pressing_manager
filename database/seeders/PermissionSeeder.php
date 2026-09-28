<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;

class PermissionSeeder extends Seeder
{
    public const PERMISSIONS = [
        ['slug' => 'clients.manage', 'name' => 'Gérer les clients', 'group' => 'clients'],
        ['slug' => 'orders.manage', 'name' => 'Gérer les commandes', 'group' => 'orders'],
        ['slug' => 'orders.update_status', 'name' => 'Changer le statut des articles', 'group' => 'orders'],
        ['slug' => 'invoices.manage', 'name' => 'Gérer les factures', 'group' => 'billing'],
        ['slug' => 'payments.manage', 'name' => 'Encaisser les paiements', 'group' => 'billing'],
        ['slug' => 'licenses.manage', 'name' => 'Gérer la licence logicielle', 'group' => 'admin'],
        ['slug' => 'subscriptions.manage', 'name' => 'Gérer les abonnements clients', 'group' => 'billing'],
        ['slug' => 'reports.view', 'name' => 'Consulter les rapports', 'group' => 'reports'],
        ['slug' => 'agencies.manage', 'name' => 'Gérer les agences', 'group' => 'admin'],
        ['slug' => 'users.manage', 'name' => 'Gérer les utilisateurs', 'group' => 'admin'],
        ['slug' => 'stocks.manage', 'name' => 'Gérer les stocks et fournisseurs', 'group' => 'stocks'],
        ['slug' => 'deliveries.manage', 'name' => 'Planifier les livraisons et gérer les zones', 'group' => 'deliveries'],
        ['slug' => 'deliveries.fulfill', 'name' => 'Effectuer les livraisons (statut, preuve)', 'group' => 'deliveries'],
        ['slug' => 'hr.manage', 'name' => 'Gérer les plannings et consulter la performance', 'group' => 'hr'],
        ['slug' => 'hr.clock', 'name' => 'Pointer ses heures de présence', 'group' => 'hr'],
        ['slug' => 'notifications.manage', 'name' => 'Configurer les notifications SMS/email', 'group' => 'notifications'],
        ['slug' => 'services.manage', 'name' => 'Gérer le catalogue de services et les tarifs', 'group' => 'catalog'],
    ];

    /** Rôle => permissions accordées. */
    public const ROLE_PERMISSIONS = [
        'admin' => ['clients.manage', 'orders.manage', 'orders.update_status', 'invoices.manage', 'payments.manage', 'licenses.manage', 'subscriptions.manage', 'reports.view', 'agencies.manage', 'users.manage', 'stocks.manage', 'deliveries.manage', 'deliveries.fulfill', 'hr.manage', 'hr.clock', 'notifications.manage', 'services.manage'],
        'manager' => ['clients.manage', 'orders.manage', 'orders.update_status', 'invoices.manage', 'payments.manage', 'subscriptions.manage', 'reports.view', 'users.manage', 'stocks.manage', 'deliveries.manage', 'deliveries.fulfill', 'hr.manage', 'hr.clock', 'notifications.manage', 'services.manage'],
        'accueil' => ['clients.manage', 'orders.manage', 'invoices.manage', 'payments.manage', 'subscriptions.manage', 'deliveries.manage', 'hr.clock'],
        'technicien' => ['orders.update_status', 'hr.clock'],
        'livreur' => ['orders.update_status', 'deliveries.fulfill', 'hr.clock'],
        'client' => [],
    ];

    public function run(): void
    {
        foreach (self::PERMISSIONS as $permission) {
            Permission::query()->updateOrCreate(['slug' => $permission['slug']], $permission);
        }

        foreach (self::ROLE_PERMISSIONS as $roleSlug => $permissionSlugs) {
            $role = Role::where('slug', $roleSlug)->first();
            $permissionIds = Permission::whereIn('slug', $permissionSlugs)->pluck('id');
            $role?->permissions()->sync($permissionIds);
        }
    }
}

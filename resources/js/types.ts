export interface AppSettings {
    pressing_name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    tax_id: string | null;
    website: string | null;
    legal_notice: string | null;
    logo_url: string | null;
    favicon_url: string | null;
    primary_color: string | null;
    secondary_color: string | null;
    monogram: string | null;
    ticket_footer: string | null;
    ticket_conditions: string | null;
    draft_data: Partial<AppSettings> | null;
    draft_saved_at: string | null;
    password_expiry_days: number | null;
    password_expiry_warning_days: number;
    session_timeout_minutes: number | null;
    password_min_length: number;
    password_require_uppercase: boolean;
    password_require_number: boolean;
    password_require_symbol: boolean;
    tax_rate: number;
    updated_at: string | null;
    loyalty_amount_per_point: number;
}

export interface AppSettingVersion {
    id: number;
    data: Partial<AppSettings>;
    published_by: { id: number; name: string } | null;
    restored_from_version_id: number | null;
    created_at: string;
}

export type RoleSlug = 'admin' | 'manager' | 'accueil' | 'technicien' | 'livreur' | 'client';

export const SYSTEM_ROLE_SLUGS: RoleSlug[] = ['admin', 'manager', 'accueil', 'technicien', 'livreur', 'client'];

export interface Permission {
    id: number;
    slug: string;
    name: string;
    group: string;
}

export type RoleScope = 'global' | 'agency' | 'flexible';

export interface Role {
    id: number;
    slug: string;
    name: string;
    scope: RoleScope;
    permissions?: Permission[];
    users_count?: number;
}

export interface Agency {
    id: number;
    code: string;
    name: string;
    city: string | null;
    address: string | null;
    phone: string | null;
    unclaimed_item_threshold_days: number;
    workshop_capacity: number | null;
    is_active: boolean;
    users_count?: number;
    clients_count?: number;
}

export interface AgencySettings {
    agency_id: number;
    order_number_prefix: string | null;
    order_number_suffix: string | null;
    order_number_padding: number;
    standard_delay_hours: number | null;
    express_delay_hours: number | null;
    finishing_delay_hours: number | null;
    allow_immediate_pickup: boolean;
    block_pickup_if_unpaid: boolean;
    washer_step_enabled: boolean;
    sorter_step_enabled: boolean;
    collection_fee: number | null;
    delivery_fee: number | null;
    minimum_order_amount: number | null;
    loyalty_amount_per_point: number | null;
    loyalty_redemption_threshold: number | null;
    offline_sync_interval_minutes: number | null;
    offline_retention_days: number | null;
    updated_at: string | null;
}

export interface User {
    id: number;
    name: string;
    email: string;
    phone: string | null;
    photo_url: string | null;
    role: Role;
    agency: Agency | null;
    agency_id: number | null;
    is_active: boolean;
    must_change_password: boolean;
    password_expired: boolean;
    password_expires_at: string | null;
}

export type ClientContactPreference = 'whatsapp' | 'call' | 'sms' | 'email';

export interface Client {
    id: number;
    agency_id: number;
    first_name: string;
    last_name: string;
    phone: string;
    phone_secondary: string | null;
    email: string | null;
    address: string | null;
    city: string | null;
    contact_preference: ClientContactPreference | null;
    referral_code: string | null;
    loyalty_points: number;
    loyalty_discount_rate: number;
    loyalty_tier_name: string | null;
    notes: string | null;
    is_active: boolean;
    sms_consent: boolean;
    email_consent: boolean;
    updated_at: string;
    agency?: { id: number; name: string };
}

export interface ClientDetail extends Client {
    deposits_count: number;
    average_basket: number;
    lifetime_value: number;
    balance_due: number;
    recent_pickups: OrderPickup[];
}

export interface LoyaltyTier {
    id: number;
    name: string;
    min_points: number;
    discount_rate: number;
    is_active: boolean;
}

export type CashMovementType = 'entree' | 'sortie';
export type CashMovementCategory = 'fourniture' | 'salaire' | 'depot_banque' | 'retrait_banque' | 'remboursement' | 'autre';
export type CashMovementStatus = 'valide' | 'en_attente';

export interface CashMovement {
    id: number;
    agency_id: number;
    type: CashMovementType;
    category: CashMovementCategory;
    amount: number;
    reason: string;
    counterparty: string | null;
    reference: string | null;
    note: string | null;
    proof_path: string | null;
    status: CashMovementStatus;
    created_by: number | null;
    creator?: { id: number; name: string } | null;
    validated_by: number | null;
    validator?: { id: number; name: string } | null;
    validated_at: string | null;
    occurred_at: string;
}

export interface CashSummary {
    opening_balance: number;
    cash_payments_total: number;
    manual_in_total: number;
    manual_out_total: number;
    expected_balance: number;
    since: string | null;
    by_method: Record<'espece' | 'mobile_money' | 'carte', { theoretical: number }>;
}

export type CashReconciliationMethod = 'espece' | 'mobile_money' | 'carte';

export interface CashClosureCount {
    id: number;
    cash_closure_id: number;
    method: CashReconciliationMethod;
    theoretical_amount: number;
    counted_amount: number;
    variance: number;
}

export interface CashClosure {
    id: number;
    agency_id: number;
    business_date: string;
    opening_balance: number;
    cash_payments_total: number;
    manual_in_total: number;
    manual_out_total: number;
    expected_balance: number;
    counted_balance: number;
    variance: number;
    notes: string | null;
    checklist: string[];
    pdf_path: string | null;
    closed_by: number | null;
    closer?: { id: number; name: string } | null;
    counts?: CashClosureCount[];
    closed_at: string;
}

export type ServiceCategory = 'nettoyage' | 'lavage' | 'repassage' | 'retouche' | 'teinture' | 'autre';
export type ServiceBillingMode = 'piece' | 'kg' | 'mixte';
export type ServicePriority = 'standard' | 'haute';

export interface ServicePriceTier {
    id: number;
    service_id: number;
    weight_min: number;
    weight_max: number | null;
    price_per_kg: number;
}

export interface ServicePriceHistory {
    id: number;
    service_id: number;
    field: 'base_price' | 'price_tiers';
    old_value: string | null;
    new_value: string | null;
    changed_at: string;
    actor?: { id: number; name: string } | null;
}

export interface Service {
    id: number;
    code: string;
    name: string;
    category: ServiceCategory;
    billing_mode: ServiceBillingMode;
    description: string | null;
    base_price: number | null;
    estimated_duration_hours: number;
    priority: ServicePriority;
    is_active: boolean;
    allow_discount: boolean;
    round_to_hundred: boolean;
    price_editable_at_counter: boolean;
    effective_price?: number;
    pivot?: { price_override: number | null; is_active: boolean };
    agency_pivot?: { price_override: number | null; is_active: boolean } | null;
    price_tiers?: ServicePriceTier[];
    price_histories?: ServicePriceHistory[];
}

export interface ServiceStats {
    active_count: number;
    category_count: number;
    average_base_price: number;
    stale_count: number;
}

export interface OrderStats {
    today_count: number;
    today_revenue: number;
    due_today: number;
    outstanding_balance: number;
}

export interface ClientStats {
    active_count: number;
    new_this_month: number;
    vip_count: number;
    points_issued: number;
}

export type OrderItemStatus =
    | 'recu'
    | 'trie'
    | 'en_traitement'
    | 'controle_qualite'
    | 'pret'
    | 'livre'
    | 'non_recupere'
    | 'perdu';

export interface IntakeCondition {
    id: number;
    code: string;
    label: string;
    is_active: boolean;
}

export interface TreatmentType {
    id: number;
    code: string;
    name: string;
    price_ratio: number;
    is_active: boolean;
}

export interface OrderItem {
    id: number;
    order_id: number;
    agency_id: number;
    service_id: number;
    service?: Service;
    treatment_type_id: number | null;
    treatment_type?: TreatmentType | null;
    qr_code: string;
    description: string | null;
    intake_notes: string | null;
    intake_conditions?: IntakeCondition[];
    quantity: number;
    quantity_delivered: number;
    weight_kg: number | null;
    unit_price: number;
    status: OrderItemStatus;
    quality_check_result: 'ok' | 'echec' | null;
    quality_check_notes: string | null;
    is_damaged: boolean;
    damage_compensation_amount: number | null;
    ready_at: string | null;
    delivered_at: string | null;
    status_histories?: OrderItemStatusHistory[];
}

export interface OrderItemStatusHistory {
    id: number;
    order_item_id: number;
    from_status: OrderItemStatus;
    to_status: OrderItemStatus;
    notes: string | null;
    changed_at: string;
    actor?: { id: number; name: string } | null;
}

export type OrderStatus = 'recu' | 'trie' | 'en_traitement' | 'controle_qualite' | 'pret' | 'livre' | 'annule';

export interface Order {
    id: number;
    agency_id: number;
    client_id: number;
    client?: Client;
    agency?: Agency;
    order_number: number;
    /** Préfixe/suffixe/padding configurés par agence (« Codes dépôt ») — présent
     * uniquement sur GET /orders/{id} (fiche dépôt), pas sur les listes paginées. */
    order_number_formatted?: string;
    client_local_uuid: string | null;
    sync_status: 'synced' | 'pending' | 'conflict';
    status: OrderStatus;
    is_express: boolean;
    total_amount: number;
    discount_amount: number;
    notes: string | null;
    created_at: string;
    promised_at: string | null;
    delivered_at: string | null;
    items: OrderItem[];
    invoice?: Invoice[];
    pickups?: OrderPickup[];
    creator?: { id: number; name: string } | null;
    // Présent sur GET /orders/{id} et sur les réponses de /pickups (Centre de retrait).
    balance_due?: number;
    pieces_remaining?: number;
    notification_status?: 'sent' | 'simulated' | 'failed' | null;
    priority?: OrderPriority;
    washer_id?: number | null;
    sorter_id?: number | null;
    washer?: { id: number; name: string } | null;
    sorter?: { id: number; name: string } | null;
}

export type OrderPriority = 'urgent' | 'haute' | 'normale';
export type AtelierColumn = 'attente' | 'cours' | 'traites' | 'classes';

export interface AtelierStaffMember {
    id: number;
    name: string;
}

export interface AtelierCard extends Order {
    column: AtelierColumn;
    last_change_at: string;
    is_late: boolean;
    items_summary: { unit: 'kg' | 'articles'; value: number };
}

export interface AtelierBoardResponse {
    capacity: number;
    active_count: number;
    orders: AtelierCard[];
    washer_step_enabled: boolean;
    sorter_step_enabled: boolean;
}

export interface AuditLog {
    id: number;
    action: string;
    auditable_type: string;
    auditable_id: number;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    user: { id: number; name: string } | null;
    created_at: string;
}

export type PickupRecipientType = 'client' | 'tiers';
export type PickupConditionStatus = 'conforme' | 'reserve' | 'anomalie';

export interface OrderPickupItem {
    id: number;
    order_pickup_id: number;
    order_item_id: number;
    quantity: number;
    order_item?: OrderItem;
}

export interface OrderPickup {
    id: number;
    order_id: number;
    agency_id: number;
    recipient_type: PickupRecipientType;
    recipient_name: string;
    condition_status: PickupConditionStatus;
    condition_notes: string | null;
    payment_collected_amount: number;
    payment_id: number | null;
    balance_overridden: boolean;
    override_reason: string | null;
    processed_at: string;
    processor?: { id: number; name: string } | null;
    items?: OrderPickupItem[];
    order?: { id: number; order_number: number };
}

export interface PickupDueToday {
    id: number;
    order_number: number;
    client_name: string;
    promised_at: string;
    pieces_remaining: number;
    balance_due: number;
}

export interface PickupSummary {
    ready_orders: number;
    pieces_ready: number;
    awaiting_notification: number;
    pickups_today: number;
    unpaid_orders: number;
    unpaid_amount: number;
    due_today: PickupDueToday[];
}

export interface Invoice {
    id: number;
    agency_id: number;
    client_id: number;
    order_id: number | null;
    invoice_number: number;
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    status: 'brouillon' | 'emise' | 'payee' | 'partiellement_payee' | 'annulee';
    pdf_path: string | null;
    issued_at: string | null;
    balance_due?: number;
    client?: Client;
    payments?: Payment[];
}

export type PaymentMethod = 'espece' | 'carte' | 'flooz' | 'tmoney';

export interface Payment {
    id: number;
    agency_id: number;
    invoice_id: number | null;
    client_id: number;
    method: PaymentMethod;
    amount: number;
    status: 'en_attente' | 'complete' | 'echoue' | 'rembourse';
    external_reference: string | null;
    paid_at: string | null;
}

export type LicenseStatus = 'active' | 'grace_period' | 'expired';

export interface License {
    id: number;
    plan: string;
    starts_at: string;
    expires_at: string;
    grace_period_days: number;
    status: LicenseStatus;
    grace_ends_at: string;
    days_remaining: number;
}

export interface LicensePayment {
    id: number;
    license_id: number;
    amount: number;
    method: PaymentMethod;
    external_reference: string | null;
    paid_at: string;
    new_expires_at: string;
}

export type LicensePlanSlug = string;

export interface LicensePlan {
    id: number;
    slug: string;
    name: string;
    days: number;
    price: number;
    is_active: boolean;
}

export interface SubscriptionPlan {
    id: number;
    agency_id: number | null;
    name: string;
    description: string | null;
    quota_type: 'kg' | 'articles';
    quota_amount: number;
    price: number;
    duration_days: number;
    is_active: boolean;
}

export interface CustomerSubscription {
    id: number;
    client_id: number;
    client?: Client;
    subscription_plan_id: number;
    plan: SubscriptionPlan;
    agency_id: number;
    started_at: string;
    expires_at: string;
    quota_used: number;
    status: 'active' | 'expired' | 'annulee';
    auto_renew: boolean;
    last_renewed_at: string | null;
    payments?: CustomerSubscriptionPayment[];
}

export interface CustomerSubscriptionPayment {
    id: number;
    customer_subscription_id: number;
    amount: number;
    method: PaymentMethod;
    external_reference: string | null;
    paid_at: string;
}

export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    total: number;
}

export type StockUnit = 'unite' | 'kg' | 'litre' | 'paquet';
export type StockMovementType = 'entree' | 'sortie';
export type StockMovementReason = 'livraison' | 'consommation' | 'perte' | 'ajustement';

export interface Supplier {
    id: number;
    agency_id: number | null;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    is_active: boolean;
}

export interface StockItem {
    id: number;
    code: string;
    name: string;
    unit: StockUnit;
    category: string | null;
    default_reorder_threshold: number;
    is_active: boolean;
}

export interface StockLevel {
    stock_item_id: number;
    code: string;
    name: string;
    unit: StockUnit;
    category: string | null;
    agency_id: number;
    quantity_on_hand: number;
    reorder_threshold: number;
    is_low_stock: boolean;
}

export interface StockMovement {
    id: number;
    agency_id: number;
    stock_item_id: number;
    stock_item?: StockItem;
    supplier_id: number | null;
    supplier?: Supplier;
    user_id: number | null;
    user?: User;
    type: StockMovementType;
    quantity: number;
    unit_cost: number | null;
    reason: StockMovementReason;
    notes: string | null;
    occurred_at: string;
}

export type DeliveryStatus = 'a_planifier' | 'en_cours' | 'livree' | 'echouee';

export interface DeliveryZone {
    id: number;
    agency_id: number;
    name: string;
    fee: number;
    description: string | null;
    is_active: boolean;
}

export interface Delivery {
    id: number;
    order_id: number;
    order?: Order;
    agency_id: number;
    delivery_zone_id: number | null;
    zone?: DeliveryZone;
    livreur_id: number | null;
    livreur?: User;
    address: string;
    phone: string | null;
    fee: number;
    status: DeliveryStatus;
    scheduled_at: string | null;
    delivered_at: string | null;
    latitude: number | null;
    longitude: number | null;
    proof_photo_path: string | null;
    signature_path: string | null;
    failure_reason: string | null;
    notes: string | null;
    created_at: string;
}

export interface Shift {
    id: number;
    agency_id: number;
    user_id: number;
    user?: User;
    starts_at: string;
    ends_at: string;
    notes: string | null;
}

export type AttendanceStatus = 'present' | 'retard' | 'absent';

export interface Attendance {
    id: number;
    agency_id: number;
    user_id: number;
    user?: User;
    shift_id: number | null;
    shift?: Shift;
    clock_in: string | null;
    clock_out: string | null;
    status: AttendanceStatus;
    notes: string | null;
    created_at: string;
}

export interface PerformanceRow {
    user_id: number;
    name: string;
    role: string | null;
    present: number;
    retard: number;
    absent: number;
    hours_worked: number;
    items_processed: number | null;
    deliveries_completed: number | null;
}

export interface KpiMetrics {
    revenue: number;
    orders_count: number;
    average_order_value: number;
    express_rate: number;
    low_stock_items: number;
    stock_movements: number;
    deliveries_total: number;
    deliveries_completed: number;
    deliveries_failed: number;
    delivery_completion_rate: number;
    attendance_present: number;
    attendance_retard: number;
    attendance_absent: number;
    hours_worked: number;
    active_subscriptions: number;
}

export interface KpiAgencyRow extends KpiMetrics {
    agency_id: number;
    agency_name: string;
}

export interface KpiData extends KpiMetrics {
    scope: 'agency' | 'consolidated';
    from: string;
    to: string;
    agency?: { id: number; name: string } | null;
    by_agency?: KpiAgencyRow[];
}

export type NotificationEvent = 'order_ready' | 'delivery_completed' | 'delivery_failed';

export interface NotificationSetting {
    agency_id: number;
    event: NotificationEvent;
    channel_email: boolean;
    channel_sms: boolean;
}

export type NotificationChannel = 'mail' | 'sms';
export type NotificationStatus = 'sent' | 'simulated' | 'failed';

export interface NotificationLog {
    id: number;
    agency_id: number;
    client_id: number | null;
    client?: Client;
    event: NotificationEvent;
    channel: NotificationChannel;
    recipient: string;
    message: string;
    status: NotificationStatus;
    sent_at: string;
}

/* Vue consolidée multi-agences ---------------------------------------------- */

export interface MultiAgencyRow {
    id: number;
    name: string;
    code: string;
    is_active: boolean;
    revenue: number;
    deposits: number;
    average_basket: number;
    pickups: number;
    cash_flow_net: number;
    outstanding: number;
    unpaid_clients: number;
    late_orders: number;
    loyalty_members: number;
    loyalty_points: number;
    workshop_active_count: number;
    workshop_capacity: number;
}

export interface RevenueSeriesPoint {
    date: string;
    revenue: number;
}

export interface MultiAgencyAlert {
    agency_id: number;
    agency_name: string;
    kind: 'late' | 'unpaid' | 'workshop_over_capacity';
    count?: number;
    amount?: number;
    active_count?: number;
    capacity?: number;
}

export interface MultiAgencyOverview {
    from: string;
    to: string;
    network: {
        revenue: number;
        deposits: number;
        pickups: number;
        cash_flow_net: number;
        outstanding: number;
        loyalty_members: number;
    };
    agencies: MultiAgencyRow[];
    revenue_series: RevenueSeriesPoint[];
    alerts: MultiAgencyAlert[];
}

export interface MultiAgencyNetworkComparison {
    rank: number | null;
    agency_count: number;
    avg_revenue: number;
    avg_outstanding: number;
    avg_late_orders: number;
    avg_basket: number;
}

export interface MultiAgencyWorkshop {
    columns: { attente: number; cours: number; traites: number; classes: number };
    capacity: number;
    active_count: number;
}

export interface MultiAgencyTeamMember {
    user: { id: number; name: string } | null;
    clock_in: string;
}

export interface MultiAgencyDetail {
    agency: { id: number; code: string; name: string; city: string | null; address: string | null; phone: string | null; is_active: boolean };
    from: string;
    to: string;
    kpis: MultiAgencyRow;
    network_comparison: MultiAgencyNetworkComparison | null;
    revenue_series: RevenueSeriesPoint[];
    workshop: MultiAgencyWorkshop;
    clients: { active: number; new_this_period: number };
    team_present: MultiAgencyTeamMember[];
    recent_activity: AuditLog[];
}

/* Console superadmin plateforme (Spark) — royaume d'authentification et de données
 * séparé du tenant (voir SuperadminAuthContext, lib/platformApi.ts). */

export interface PlatformPlan {
    id: number;
    slug: string;
    name: string;
    is_active: boolean;
}

export interface Pressing {
    id: number;
    name: string;
    code: string;
    country_code: string | null;
    platform_plan_id: number;
    platform_plan?: PlatformPlan;
    status: 'active' | 'suspended';
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    license_starts_at: string | null;
    license_expires_at: string | null;
    agencies_count: number;
    users_count: number;
    last_report_at: string | null;
    created_at: string;
    report_token?: string;
    manager_email?: string;
    manager_temporary_password?: string;
}

export interface PlatformPermission {
    id: number;
    slug: string;
    name: string;
    group: string;
}

export interface PlatformRole {
    id: number;
    slug: string;
    name: string;
    is_system: boolean;
    permissions?: PlatformPermission[];
}

export interface PlatformUser {
    id: number;
    name: string;
    email: string;
    platform_role_id: number;
    platform_role?: PlatformRole;
    pressings?: Pressing[];
    is_active: boolean;
    totp_enabled_at: string | null;
    last_login_at: string | null;
}

export interface PlatformAuditLog {
    id: number;
    platform_user_id: number | null;
    platform_user?: PlatformUser | null;
    action: string;
    auditable_type: string;
    auditable_id: number;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    created_at: string;
}

export interface PlatformLicenseHealth {
    total: number;
    active_pct: number;
    renewal_due_pct: number;
    suspended_pct: number;
}

export interface PlatformActivityPoint {
    date: string;
    operations_count: number;
}

export interface PlatformDashboard {
    tenants_actifs: number;
    agences_total: number;
    utilisateurs_total: number;
    license_health: PlatformLicenseHealth;
    activity_series: PlatformActivityPoint[];
}

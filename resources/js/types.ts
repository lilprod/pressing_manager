export interface AppSettings {
    pressing_name: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    tax_id: string | null;
    logo_url: string | null;
    favicon_url: string | null;
    password_expiry_days: number | null;
    session_timeout_minutes: number | null;
    password_min_length: number;
    password_require_uppercase: boolean;
    password_require_number: boolean;
    password_require_symbol: boolean;
}

export type RoleSlug = 'admin' | 'manager' | 'accueil' | 'technicien' | 'livreur' | 'client';

export interface Permission {
    id: number;
    slug: string;
    name: string;
}

export interface Role {
    id: number;
    slug: RoleSlug;
    name: string;
    scope: 'global' | 'agency' | 'flexible';
    permissions?: Permission[];
}

export interface Agency {
    id: number;
    code: string;
    name: string;
    city: string | null;
    address: string | null;
    phone: string | null;
    is_active: boolean;
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
}

export interface Client {
    id: number;
    agency_id: number;
    first_name: string;
    last_name: string;
    phone: string;
    email: string | null;
    address: string | null;
    loyalty_points: number;
    loyalty_discount_rate: number;
    loyalty_tier_name: string | null;
    notes: string | null;
}

export interface LoyaltyTier {
    id: number;
    name: string;
    min_points: number;
    discount_rate: number;
    is_active: boolean;
}

export interface Service {
    id: number;
    code: string;
    name: string;
    category: string;
    base_price: number;
    estimated_duration_hours: number;
    pivot?: { price_override: number | null; is_active: boolean };
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

export interface OrderItem {
    id: number;
    order_id: number;
    agency_id: number;
    service_id: number;
    service?: Service;
    qr_code: string;
    description: string | null;
    intake_notes: string | null;
    intake_conditions?: IntakeCondition[];
    quantity: number;
    unit_price: number;
    status: OrderItemStatus;
    quality_check_result: 'ok' | 'echec' | null;
    quality_check_notes: string | null;
    is_damaged: boolean;
    damage_compensation_amount: number | null;
    ready_at: string | null;
    delivered_at: string | null;
}

export type OrderStatus = 'recu' | 'trie' | 'en_traitement' | 'controle_qualite' | 'pret' | 'livre' | 'annule';

export interface Order {
    id: number;
    agency_id: number;
    client_id: number;
    client?: Client;
    agency?: Agency;
    order_number: number;
    client_local_uuid: string | null;
    status: OrderStatus;
    is_express: boolean;
    total_amount: number;
    discount_amount: number;
    notes: string | null;
    created_at: string;
    promised_at: string | null;
    items: OrderItem[];
    invoice?: Invoice[];
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

export interface LicensePlanConfig {
    days: number;
    price: number;
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

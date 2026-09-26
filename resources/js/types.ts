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
    role: Role;
    agency: Agency | null;
    agency_id: number | null;
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
    notes: string | null;
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

export interface OrderItem {
    id: number;
    order_id: number;
    agency_id: number;
    service_id: number;
    service?: Service;
    qr_code: string;
    description: string | null;
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
    order_number: number;
    client_local_uuid: string | null;
    status: OrderStatus;
    is_express: boolean;
    total_amount: number;
    discount_amount: number;
    notes: string | null;
    created_at: string;
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

import type { AppSettings } from '../types';

export type BrandingChecklistKey = 'name' | 'logo' | 'favicon' | 'address' | 'contacts' | 'taxId';

/** Champs d'identité pris en compte dans l'« état de configuration » (hub Paramètres + écran Branding). */
export function brandingChecklist(settings: Partial<AppSettings> | null): { key: BrandingChecklistKey; done: boolean }[] {
    return [
        { key: 'name', done: !!settings?.pressing_name },
        { key: 'logo', done: !!settings?.logo_url },
        { key: 'favicon', done: !!settings?.favicon_url },
        { key: 'address', done: !!settings?.address },
        { key: 'contacts', done: !!settings?.phone && !!settings?.email },
        { key: 'taxId', done: !!settings?.tax_id },
    ];
}

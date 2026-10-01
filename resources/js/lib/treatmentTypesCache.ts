import type { TreatmentType } from '../types';

const CACHE_KEY = 'pm.treatmentTypesCache';

export function readCachedTreatmentTypes(): TreatmentType[] {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function writeCachedTreatmentTypes(types: TreatmentType[]): void {
    localStorage.setItem(CACHE_KEY, JSON.stringify(types));
}

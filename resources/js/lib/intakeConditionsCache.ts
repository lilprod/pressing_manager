import type { IntakeCondition } from '../types';

const CACHE_KEY = 'pm.intakeConditionsCache';

export function readCachedIntakeConditions(): IntakeCondition[] {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function writeCachedIntakeConditions(conditions: IntakeCondition[]): void {
    localStorage.setItem(CACHE_KEY, JSON.stringify(conditions));
}

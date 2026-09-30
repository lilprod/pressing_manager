import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CircleAlert, KeyRound, Save, TimerReset } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useSettings } from '../../contexts/SettingsContext';
import { api, ApiError } from '../../lib/api';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { SectionCard } from '../../components/ui/Metrics';
import Toggle from '../../components/ui/Toggle';
import { button, cx, inputSm, label, textLink } from '../../components/ui/styles';
import type { AppSettings } from '../../types';

/* Politique de sécurité des comptes (anciennement en bas de l'unique formulaire
 * Paramètres). Mise en page « Paramètres opérationnels » de la maquette (node 25:12525) :
 * barre « changements non enregistrés », cartes à champs suffixés et bascules. */

interface Policy {
    expiryEnabled: boolean;
    expiryDays: number;
    warningDays: number;
    sessionTimeout: number;
    minLength: number;
    requireUppercase: boolean;
    requireNumber: boolean;
    requireSymbol: boolean;
}

function fromSettings(s: AppSettings | null): Policy {
    return {
        expiryEnabled: !!s?.password_expiry_days,
        expiryDays: s?.password_expiry_days || 90,
        warningDays: s?.password_expiry_warning_days ?? 14,
        sessionTimeout: s?.session_timeout_minutes ?? 30,
        minLength: s?.password_min_length ?? 8,
        requireUppercase: s?.password_require_uppercase ?? true,
        requireNumber: s?.password_require_number ?? true,
        requireSymbol: s?.password_require_symbol ?? false,
    };
}

export default function SecuritySettingsPage() {
    const { t } = useI18n();
    const { settings, refresh } = useSettings();
    const [policy, setPolicy] = useState<Policy>(() => fromSettings(settings));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    useEffect(() => setPolicy(fromSettings(settings)), [settings]);

    const saved = fromSettings(settings);
    const dirty = (Object.keys(saved) as (keyof Policy)[]).some((k) => saved[k] !== policy[k]);

    function set<K extends keyof Policy>(key: K, value: Policy[K]) {
        setPolicy((p) => ({ ...p, [key]: value }));
        setFeedback(null);
    }

    async function submit() {
        setBusy(true);
        setError(null);
        setFeedback(null);
        try {
            const data = new FormData();
            data.append('password_expiry_days', String(policy.expiryEnabled ? policy.expiryDays : 0));
            data.append('password_expiry_warning_days', String(policy.warningDays));
            data.append('session_timeout_minutes', String(policy.sessionTimeout));
            data.append('password_min_length', String(policy.minLength));
            data.append('password_require_uppercase', policy.requireUppercase ? '1' : '0');
            data.append('password_require_number', policy.requireNumber ? '1' : '0');
            data.append('password_require_symbol', policy.requireSymbol ? '1' : '0');
            await api.postForm<AppSettings>('/settings', data);
            await refresh();
            setFeedback(t('settings.saved'));
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="max-w-4xl space-y-6">
            <Link to="/settings" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                {t('settingsHub.back')}
            </Link>

            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">{t('settings.security')}</h1>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">{t('securitySettings.subtitle')}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setPolicy(fromSettings(settings))} disabled={!dirty || busy} className={button('ghost', 'md', 'h-10')}>
                        {t('common.cancel')}
                    </button>
                    <button type="button" onClick={() => void submit()} disabled={!dirty || busy} className={button('primary', 'md', 'h-10')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Save aria-hidden="true" className="h-4 w-4" />}
                        {t('common.save')}
                    </button>
                </div>
            </div>

            {dirty && (
                <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-400/20 dark:bg-amber-400/10">
                    <span className="inline-flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-300">
                        <CircleAlert aria-hidden="true" className="h-4 w-4" />
                        {t('securitySettings.unsaved')}
                    </span>
                    <span className="text-amber-800 dark:text-amber-300">{t('securitySettings.unsavedHint')}</span>
                </div>
            )}

            {error && <Alert tone="error">{error}</Alert>}
            {feedback && <Alert tone="success">{feedback}</Alert>}

            <SectionCard id="security-session" title={t('securitySettings.session')} subtitle={t('settings.sessionTimeoutHint')}>
                <SuffixInput
                    icon={TimerReset}
                    label={t('settings.sessionTimeout')}
                    value={policy.sessionTimeout}
                    min={5}
                    max={1440}
                    suffix={t('securitySettings.minutes')}
                    onChange={(v) => set('sessionTimeout', v)}
                />
            </SectionCard>

            <SectionCard id="security-expiry" title={t('securitySettings.expiry')} subtitle={t('securitySettings.expiryHint')}>
                <Toggle checked={policy.expiryEnabled} onChange={(v) => set('expiryEnabled', v)} label={t('settings.passwordExpiryEnabled')} />
                {policy.expiryEnabled && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <SuffixInput
                            label={t('settings.passwordExpiryDays')}
                            value={policy.expiryDays}
                            min={1}
                            max={3650}
                            suffix={t('securitySettings.days')}
                            onChange={(v) => set('expiryDays', v)}
                        />
                        <SuffixInput
                            label={t('settings.passwordExpiryWarningDays')}
                            hint={t('settings.passwordExpiryWarningDaysHint')}
                            value={policy.warningDays}
                            min={1}
                            max={90}
                            suffix={t('securitySettings.days')}
                            onChange={(v) => set('warningDays', v)}
                        />
                    </div>
                )}
            </SectionCard>

            <SectionCard id="security-complexity" title={t('securitySettings.complexity')} subtitle={t('securitySettings.complexityHint')}>
                <SuffixInput
                    icon={KeyRound}
                    label={t('settings.passwordMinLength')}
                    value={policy.minLength}
                    min={6}
                    max={64}
                    suffix={t('securitySettings.characters')}
                    onChange={(v) => set('minLength', v)}
                />
                <div className="divide-y divide-ink-100 dark:divide-ink-800">
                    <Toggle className="py-3" checked={policy.requireUppercase} onChange={(v) => set('requireUppercase', v)} label={t('settings.passwordRequireUppercase')} />
                    <Toggle className="py-3" checked={policy.requireNumber} onChange={(v) => set('requireNumber', v)} label={t('settings.passwordRequireNumber')} />
                    <Toggle className="py-3" checked={policy.requireSymbol} onChange={(v) => set('requireSymbol', v)} label={t('settings.passwordRequireSymbol')} />
                </div>
            </SectionCard>
        </div>
    );
}

function SuffixInput({
    label: fieldLabel,
    hint,
    value,
    min,
    max,
    suffix,
    onChange,
    icon: Icon,
}: {
    label: string;
    hint?: string;
    value: number;
    min: number;
    max: number;
    suffix: string;
    onChange: (value: number) => void;
    icon?: typeof KeyRound;
}) {
    return (
        <label className="block">
            <span className={label}>{fieldLabel}</span>
            {hint && <span className="mb-1.5 block text-xs text-ink-600 dark:text-ink-350">{hint}</span>}
            <span className="relative flex max-w-xs items-center">
                {Icon && <Icon aria-hidden="true" className="pointer-events-none absolute left-3 h-4 w-4 text-ink-500 dark:text-ink-350" />}
                <input
                    type="number"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(e) => onChange(Number(e.target.value))}
                    className={cx(inputSm, 'h-10 pr-24', Icon && 'pl-9')}
                />
                <span className="pointer-events-none absolute right-3 text-sm text-ink-500 dark:text-ink-400">{suffix}</span>
            </span>
        </label>
    );
}

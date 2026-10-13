import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Pencil, Plus, Sparkles, Star, X } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import PageHeader from '../../components/ui/PageHeader';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { SectionCard } from '../../components/ui/Metrics';
import { Pill } from '../../components/ui/StatusBadge';
import { button, cx, input, inputSm, label, textLink } from '../../components/ui/styles';
import type { FinishOption, TreatmentType } from '../../types';

/* CDC §11.1-11.3 : types de traitement (Classique/Express/Repassage…), chacun avec un
 * price_ratio appliqué automatiquement au prix de l'article choisi à la création d'un
 * dépôt (voir NewOrder.tsx). Référentiel additif : une ligne de commande sans traitement
 * choisi garde exactement le comportement d'avant (pas de rupture de compatibilité). */

export default function TreatmentTypesPage() {
    const { t } = useI18n();
    const [treatmentTypes, setTreatmentTypes] = useState<TreatmentType[]>([]);
    const [loading, setLoading] = useState(true);

    function reload() {
        api.get<TreatmentType[]>('/treatment-types')
            .then(setTreatmentTypes)
            .finally(() => setLoading(false));
    }

    useEffect(reload, []);

    return (
        <div className="space-y-6">
            <Link to="/services" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                {t('treatmentType.back')}
            </Link>
            <PageHeader title={t('treatmentType.title')} subtitle={t('treatmentType.subtitle')} icon={Sparkles} />

            {loading ? (
                <LoadingState />
            ) : (
                <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
                    <TreatmentTypesPanel treatmentTypes={treatmentTypes} onChanged={reload} />
                    <CreateTreatmentTypeForm onCreated={reload} />
                </div>
            )}
            <FinishOptionsCard />
        </div>
    );
}

function TreatmentTypesPanel({ treatmentTypes, onChanged }: { treatmentTypes: TreatmentType[]; onChanged: () => void }) {
    const { t } = useI18n();
    const [editing, setEditing] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    async function toggleActive(treatmentType: TreatmentType) {
        setError(null);
        try {
            await api.patch(`/treatment-types/${treatmentType.id}`, { is_active: !treatmentType.is_active });
            onChanged();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        }
    }

    return (
        <SectionCard id="treatment-types-heading" title={t('treatmentType.list')} subtitle={t('treatmentType.listHint')}>
            {error && <Alert tone="error">{error}</Alert>}
            {treatmentTypes.length === 0 ? (
                <EmptyState compact icon={Star} title={t('treatmentType.empty')} />
            ) : (
                <ul className="-mx-2 divide-y divide-ink-100 dark:divide-ink-800">
                    {treatmentTypes.map((treatmentType) =>
                        editing === treatmentType.id ? (
                            <li key={treatmentType.id} className="px-2 py-3">
                                <EditTreatmentTypeRow
                                    treatmentType={treatmentType}
                                    onCancel={() => setEditing(null)}
                                    onSaved={() => {
                                        setEditing(null);
                                        onChanged();
                                    }}
                                />
                            </li>
                        ) : (
                            <li key={treatmentType.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2 py-3 sm:flex-nowrap">
                                <span
                                    aria-hidden="true"
                                    className={cx(
                                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold',
                                        treatmentType.is_active
                                            ? 'bg-accent-100 text-accent-800 dark:bg-accent-400/15 dark:text-accent-300'
                                            : 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
                                    )}
                                >
                                    {treatmentType.name.charAt(0).toUpperCase()}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate font-semibold text-ink-900 dark:text-ink-50">{treatmentType.name}</p>
                                    <p className="text-xs text-ink-600 dark:text-ink-350">{treatmentType.code}</p>
                                </div>
                                <span className="shrink-0 font-display text-sm font-bold tabular-nums text-ink-900 dark:text-white">
                                    {t('treatmentType.ratioValue', { ratio: treatmentType.price_ratio })}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => void toggleActive(treatmentType)}
                                    aria-pressed={treatmentType.is_active}
                                    title={treatmentType.is_active ? t('treatmentType.deactivate') : t('treatmentType.activate')}
                                    className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
                                >
                                    <Pill tone={treatmentType.is_active ? 'emerald' : 'neutral'}>
                                        {treatmentType.is_active ? t('treatmentType.active') : t('treatmentType.inactive')}
                                    </Pill>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditing(treatmentType.id)}
                                    className={button('ghost', 'sm', 'h-8 px-2')}
                                    aria-label={t('treatmentType.editTreatmentType', { name: treatmentType.name })}
                                >
                                    <Pencil aria-hidden="true" className="h-4 w-4" />
                                </button>
                            </li>
                        ),
                    )}
                </ul>
            )}
        </SectionCard>
    );
}

function EditTreatmentTypeRow({
    treatmentType,
    onCancel,
    onSaved,
}: {
    treatmentType: TreatmentType;
    onCancel: () => void;
    onSaved: () => void;
}) {
    const { t } = useI18n();
    const [name, setName] = useState(treatmentType.name);
    const [ratio, setRatio] = useState(String(treatmentType.price_ratio));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function save() {
        setBusy(true);
        setError(null);
        try {
            await api.patch(`/treatment-types/${treatmentType.id}`, { name, price_ratio: Number(ratio) });
            onSaved();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="space-y-3 rounded-xl bg-ink-50 p-3 dark:bg-ink-950/40">
            {error && <Alert tone="error">{error}</Alert>}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <label className="block">
                    <span className={label}>{t('treatmentType.name')}</span>
                    <input value={name} onChange={(e) => setName(e.target.value)} className={inputSm} />
                </label>
                <label className="block">
                    <span className={label}>{t('treatmentType.ratio')}</span>
                    <input type="number" min={0.01} max={99.99} step="0.05" value={ratio} onChange={(e) => setRatio(e.target.value)} className={inputSm} />
                </label>
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className={button('ghost', 'sm')}>
                    <X aria-hidden="true" className="h-4 w-4" />
                    {t('common.cancel')}
                </button>
                <button type="button" onClick={() => void save()} disabled={busy || name.trim() === '' || ratio === ''} className={button('primary', 'sm')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                    {t('common.save')}
                </button>
            </div>
        </div>
    );
}

function CreateTreatmentTypeForm({ onCreated }: { onCreated: () => void }) {
    const { t } = useI18n();
    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [ratio, setRatio] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function createTreatmentType() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/treatment-types', { code, name, price_ratio: Number(ratio) });
            setCode('');
            setName('');
            setRatio('');
            onCreated();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = code.trim() !== '' && name.trim() !== '' && ratio !== '';

    return (
        <SectionCard id="treatment-type-create-heading" title={t('treatmentType.newTreatmentType')} subtitle={t('treatmentType.newHint')}>
            {error && <Alert tone="error">{error}</Alert>}
            <label className="block">
                <span className={label}>{t('treatmentType.code')}</span>
                <input value={code} onChange={(e) => setCode(e.target.value)} className={input} />
            </label>
            <label className="block">
                <span className={label}>{t('treatmentType.name')}</span>
                <input value={name} onChange={(e) => setName(e.target.value)} className={input} />
            </label>
            <label className="block">
                <span className={label}>{t('treatmentType.ratio')}</span>
                <input type="number" min={0.01} max={99.99} step="0.05" value={ratio} onChange={(e) => setRatio(e.target.value)} className={input} />
            </label>
            <button type="button" onClick={() => void createTreatmentType()} disabled={!canSubmit || busy} className={button('primary', 'md', 'w-full')}>
                {busy ? <Spinner className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                {t('common.create')}
            </button>
        </SectionCard>
    );
}

/** Référentiel des rendus (sur cintre, plié…) proposés au comptoir aux articles compatibles. */
function FinishOptionsCard() {
    const { t } = useI18n();
    const [options, setOptions] = useState<FinishOption[]>([]);
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = () => {
        api.get<FinishOption[]>('/finish-options').then(setOptions).catch(() => setOptions([]));
    };
    useEffect(load, []);

    async function add() {
        setBusy(true);
        setError(null);
        try {
            await api.post('/finish-options', { name: name.trim() });
            setName('');
            load();
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    async function toggle(option: FinishOption) {
        await api.patch(`/finish-options/${option.id}`, { is_active: !option.is_active });
        load();
    }

    return (
        <SectionCard id="finish-options" title={t("finishOption.title")} subtitle={t("finishOption.hint")}>
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                    <button key={option.id} type="button" onClick={() => void toggle(option)} aria-pressed={option.is_active} className="rounded-full">
                        <Pill tone={option.is_active ? 'emerald' : 'neutral'}>
                            {option.name} · {option.is_active ? t("service.active") : t("service.inactive")}
                        </Pill>
                    </button>
                ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
                <label className="block min-w-0 flex-1 basis-full sm:basis-auto">
                    <span className={label}>{t('finishOption.title')}</span>
                    <input value={name} placeholder={t('finishOption.placeholder')} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
                </label>
                <button type="button" onClick={() => void add()} disabled={busy || !name.trim()} className={button('primary', 'md')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
                    {t('finishOption.add')}
                </button>
            </div>
        </SectionCard>
    );
}

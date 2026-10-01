import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, MapPinHouse } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { Alert, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { button, cardPadded, cx, input, label, textLink } from '../../components/ui/styles';
import type { Agency } from '../../types';

export default function AgencyFormPage() {
    const { id } = useParams<{ id: string }>();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const { t } = useI18n();

    const [loading, setLoading] = useState(isEdit);
    const [notFound, setNotFound] = useState(false);

    const [code, setCode] = useState('');
    const [name, setName] = useState('');
    const [city, setCity] = useState('');
    const [address, setAddress] = useState('');
    const [phone, setPhone] = useState('');
    const [unclaimedDays, setUnclaimedDays] = useState('30');
    const [workshopCapacity, setWorkshopCapacity] = useState('');
    const [isActive, setIsActive] = useState(true);

    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!id) return;
        api
            .get<Agency>(`/agencies/${id}`)
            .then((agency) => {
                setCode(agency.code);
                setName(agency.name);
                setCity(agency.city ?? '');
                setAddress(agency.address ?? '');
                setPhone(agency.phone ?? '');
                setUnclaimedDays(String(agency.unclaimed_item_threshold_days));
                setWorkshopCapacity(agency.workshop_capacity != null ? String(agency.workshop_capacity) : '');
                setIsActive(agency.is_active);
            })
            .catch((err) => {
                if (err instanceof ApiError && err.status === 404) setNotFound(true);
            })
            .finally(() => setLoading(false));
    }, [id]);

    async function handleSubmit() {
        setBusy(true);
        setError(null);
        try {
            const payload = {
                code: isEdit ? undefined : code,
                name,
                city: city || null,
                address: address || null,
                phone: phone || null,
                unclaimed_item_threshold_days: Number(unclaimedDays),
                workshop_capacity: workshopCapacity ? Number(workshopCapacity) : null,
                is_active: isEdit ? isActive : undefined,
            };

            if (isEdit) {
                await api.patch<Agency>(`/agencies/${id}`, payload);
            } else {
                await api.post<Agency>('/agencies', payload);
            }

            navigate('/agencies');
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const canSubmit = name.trim() !== '' && (isEdit || code.trim() !== '');

    const backLink = (
        <Link to="/agencies" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('agency.backToList')}
        </Link>
    );

    if (loading) {
        return <LoadingState />;
    }

    if (notFound) {
        return (
            <div className="space-y-4">
                {backLink}
                <Alert tone="error">{t('agency.notFound')}</Alert>
            </div>
        );
    }

    return (
        <div className="max-w-xl space-y-4">
            {backLink}

            <section className={cx(cardPadded, 'space-y-5')}>
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200 dark:bg-ink-800 dark:text-ink-200 dark:ring-ink-700">
                        <MapPinHouse aria-hidden="true" className="h-5 w-5" />
                    </span>
                    <div>
                        <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">{isEdit ? t('agency.edit') : t('agency.new')}</h1>
                        <p className="text-sm text-ink-600 dark:text-ink-350">{isEdit ? t('agency.editSubtitle') : t('agency.newSubtitle')}</p>
                    </div>
                </div>

                {error && <Alert tone="error">{error}</Alert>}

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className={label}>{t('agency.name')}</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} className={cx(input, 'w-full')} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('agency.code')}</span>
                        <input
                            value={code}
                            disabled={isEdit}
                            onChange={(e) => setCode(e.target.value)}
                            className={cx(input, 'w-full', isEdit && 'cursor-not-allowed opacity-60')}
                        />
                    </label>
                    <label className="block">
                        <span className={label}>{t('agency.city')}</span>
                        <input value={city} onChange={(e) => setCity(e.target.value)} className={cx(input, 'w-full')} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('agency.phone')}</span>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={cx(input, 'w-full')} />
                    </label>
                    <label className="block sm:col-span-2">
                        <span className={label}>{t('agency.address')}</span>
                        <input value={address} onChange={(e) => setAddress(e.target.value)} className={cx(input, 'w-full')} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('agency.unclaimedDays')}</span>
                        <input
                            type="number"
                            min={1}
                            value={unclaimedDays}
                            onChange={(e) => setUnclaimedDays(e.target.value)}
                            className={cx(input, 'w-full')}
                        />
                    </label>
                    <label className="block">
                        <span className={label}>{t('agency.workshopCapacity')}</span>
                        <input
                            type="number"
                            min={1}
                            placeholder={String(24)}
                            value={workshopCapacity}
                            onChange={(e) => setWorkshopCapacity(e.target.value)}
                            className={cx(input, 'w-full')}
                        />
                        <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t('agency.workshopCapacityHint')}</p>
                    </label>
                </div>

                {isEdit && (
                    <div className="flex items-center gap-2 border-t border-ink-200/80 pt-4 dark:border-ink-800">
                        <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">{t('agency.table.status')} :</span>
                        {isActive ? <Pill tone="emerald">{t('agency.active')}</Pill> : <Pill tone="rose">{t('agency.inactive')}</Pill>}
                        <button type="button" onClick={() => setIsActive((v) => !v)} className={button('ghost', 'sm')}>
                            {isActive ? t('agency.deactivate') : t('agency.activate')}
                        </button>
                    </div>
                )}

                <div className="flex justify-end gap-2 border-t border-ink-200/80 pt-5 dark:border-ink-800">
                    <Link to="/agencies" className={button('ghost', 'md')}>
                        {t('common.cancel')}
                    </Link>
                    <button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit || busy} className={button('primary', 'md')}>
                        {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" />}
                        {t('common.save')}
                    </button>
                </div>
            </section>
        </div>
    );
}

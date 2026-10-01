import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import type { Client, ClientContactPreference, LoyaltyTier } from '../../types';
import {
    Archive,
    Check,
    ExternalLink,
    Fingerprint,
    Gift,
    Mail,
    MessageCircle,
    Phone,
    RefreshCw,
    ShieldCheck,
    StickyNote,
    UserPen,
    UserPlus,
    UserRound,
} from 'lucide-react';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import Toggle from '../../components/ui/Toggle';
import { button, card, cardPadded, cx, input, label, select, sectionTitle, textLink } from '../../components/ui/styles';

interface Props {
    client: Client | null;
    onSaved: (client: Client) => void;
    onCancel: () => void;
}

const CONTACT_PREFERENCES: { value: ClientContactPreference; icon: typeof MessageCircle }[] = [
    { value: 'whatsapp', icon: MessageCircle },
    { value: 'call', icon: Phone },
    { value: 'sms', icon: StickyNote },
    { value: 'email', icon: Mail },
];

type DuplicateState = { status: 'idle' | 'checking' | 'clear' | 'duplicate'; match?: Client };

export default function ClientForm({ client, onSaved, onCancel }: Props) {
    const { t } = useI18n();
    const { dateTime } = useFormat();
    const { user, agencies, activeAgencyId } = useAuth();
    const navigate = useNavigate();
    const isGlobal = user?.agency_id === null;

    const [firstName, setFirstName] = useState(client?.first_name ?? '');
    const [lastName, setLastName] = useState(client?.last_name ?? '');
    const [phone, setPhone] = useState(client?.phone ?? '');
    const [phoneSecondary, setPhoneSecondary] = useState(client?.phone_secondary ?? '');
    const [email, setEmail] = useState(client?.email ?? '');
    const [address, setAddress] = useState(client?.address ?? '');
    const [city, setCity] = useState(client?.city ?? '');
    const [agencyIdSelected, setAgencyIdSelected] = useState<number | null>(client?.agency_id ?? activeAgencyId);
    const [contactPreference, setContactPreference] = useState<ClientContactPreference | null>(client?.contact_preference ?? null);
    const [referralCode, setReferralCode] = useState(client?.referral_code ?? '');
    const [notes, setNotes] = useState(client?.notes ?? '');
    const [isActive, setIsActive] = useState(client?.is_active ?? true);
    const [smsConsent, setSmsConsent] = useState(client?.sms_consent ?? false);
    const [emailConsent, setEmailConsent] = useState(client?.email_consent ?? false);

    const [defaultTierName, setDefaultTierName] = useState<string | null>(null);
    const [duplicate, setDuplicate] = useState<DuplicateState>({ status: 'idle' });
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<'save' | 'saveAndOrder' | null>(null);

    const effectiveAgencyId = client ? client.agency_id : agencyIdSelected;

    /** Palier de fidélité par défaut (0 point) affiché pour un nouveau client, avant toute création. */
    useEffect(() => {
        if (client) return;
        api
            .get<LoyaltyTier[]>('/loyalty-tiers')
            .then((tiers) => {
                const lowest = tiers.filter((tr) => tr.is_active).sort((a, b) => a.min_points - b.min_points)[0];
                setDefaultTierName(lowest?.name ?? null);
            })
            .catch(() => {
                // Pas bloquant : la carte "Groupe de fidélité" reste simplement vide.
            });
    }, [client]);

    /** Contrôle des doublons en temps réel, basé sur le numéro de téléphone principal. */
    useEffect(() => {
        const term = phone.trim();
        if (term.length < 6 || !effectiveAgencyId) {
            setDuplicate({ status: 'idle' });
            return;
        }
        setDuplicate({ status: 'checking' });
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            api
                .get<{ data: Client[] }>(`/clients?search=${encodeURIComponent(term)}&agency_id=${effectiveAgencyId}`, controller.signal)
                .then((res) => {
                    const match = res.data.find((c) => c.phone === term && c.id !== client?.id);
                    setDuplicate(match ? { status: 'duplicate', match } : { status: 'clear' });
                })
                .catch(() => {
                    setDuplicate({ status: 'idle' });
                });
        }, 400);
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [phone, effectiveAgencyId, client?.id]);

    async function submit(event: FormEvent, createOrderAfter: boolean) {
        event.preventDefault();
        setBusy(createOrderAfter ? 'saveAndOrder' : 'save');
        setError(null);

        if (!client && isGlobal && !agencyIdSelected) {
            setError(t('client.selectAgency'));
            setBusy(null);
            return;
        }

        const payload = {
            first_name: firstName,
            last_name: lastName,
            phone,
            phone_secondary: phoneSecondary || null,
            email: email || null,
            address: address || null,
            city: city || null,
            contact_preference: contactPreference,
            referral_code: referralCode || null,
            notes: notes || null,
            is_active: isActive,
            sms_consent: smsConsent,
            email_consent: emailConsent,
        };

        try {
            const saved = client
                ? await api.patch<Client>(`/clients/${client.id}`, payload)
                : await api.post<Client>('/clients', isGlobal ? { ...payload, agency_id: agencyIdSelected } : payload);

            if (createOrderAfter) {
                navigate(`/?client=${saved.id}`);
            } else {
                onSaved(saved);
            }
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(null);
        }
    }

    const Icon = client ? UserPen : UserPlus;
    const currentAgencyName = useMemo(() => {
        if (client?.agency) return client.agency.name;
        return agencies.find((a) => a.id === agencyIdSelected)?.name ?? null;
    }, [client, agencies, agencyIdSelected]);

    return (
        <form onSubmit={(e) => void submit(e, false)} className="animate-fade-in space-y-4" aria-label={client ? t('client.edit') : t('client.new')}>
            <div className="flex flex-wrap items-center gap-2">
                <h2 className={cx(sectionTitle, 'flex items-center gap-2 text-xl')}>
                    <Icon aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                    {client ? t('client.edit') : t('client.new')}
                </h2>
                {client && (isActive ? <Pill tone="emerald">{t('client.activeStatus')}</Pill> : <Pill tone="rose">{t('client.inactive')}</Pill>)}
            </div>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
                <div className="space-y-4">
                    <section className={cx(cardPadded, 'space-y-3')}>
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800 dark:text-ink-100">
                            <UserRound aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                            {t('client.section.identity')}
                        </h3>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>{t('client.lastName')}</span>
                                <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className={input} />
                            </label>
                            <label className="block">
                                <span className={label}>{t('client.firstName')}</span>
                                <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={input} />
                            </label>
                            <label className="block">
                                <span className={label}>{t('client.phone')}</span>
                                <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
                            </label>
                            <label className="block">
                                <span className={label}>{t('client.phoneSecondary')}</span>
                                <input type="tel" value={phoneSecondary} onChange={(e) => setPhoneSecondary(e.target.value)} className={input} />
                            </label>
                            <label className="block sm:col-span-2">
                                <span className={label}>{t('client.email')}</span>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
                            </label>
                            <label className="block sm:col-span-2">
                                <span className={label}>{t('client.address')}</span>
                                <input value={address} onChange={(e) => setAddress(e.target.value)} className={input} />
                            </label>
                            <label className="block">
                                <span className={label}>{t('client.city')}</span>
                                <input value={city} onChange={(e) => setCity(e.target.value)} className={input} />
                            </label>
                            <label className="block">
                                <span className={label}>{t('client.referenceAgency')}</span>
                                {isGlobal && !client ? (
                                    <select
                                        required
                                        value={agencyIdSelected ?? ''}
                                        onChange={(e) => setAgencyIdSelected(e.target.value ? Number(e.target.value) : null)}
                                        className={select}
                                    >
                                        <option value="">{t('client.selectAgency')}</option>
                                        {agencies.map((a) => (
                                            <option key={a.id} value={a.id}>
                                                {a.name}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input disabled value={currentAgencyName ?? '—'} className={cx(input, 'opacity-70')} />
                                )}
                                {client && <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t('client.referenceAgencyLockedHint')}</p>}
                            </label>
                        </div>
                    </section>

                    <section className={cx(cardPadded, 'space-y-3')}>
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800 dark:text-ink-100">
                            <Gift aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                            {t('client.section.relation')}
                        </h3>
                        <div>
                            <span className={label}>{t('client.contactPreference')}</span>
                            <div className="flex flex-wrap gap-2">
                                {CONTACT_PREFERENCES.map(({ value, icon: PrefIcon }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setContactPreference(contactPreference === value ? null : value)}
                                        className={cx(
                                            'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition',
                                            contactPreference === value
                                                ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-300 dark:bg-brand-400/10 dark:text-brand-200'
                                                : 'border-ink-300 text-ink-700 hover:border-ink-400 dark:border-ink-600 dark:text-ink-200',
                                        )}
                                    >
                                        <PrefIcon aria-hidden="true" className="h-3.5 w-3.5" />
                                        {t(`client.contactPreference.${value}`)}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className={label}>{t('client.loyaltyGroup')}</span>
                                <input disabled value={client ? (client.loyalty_tier_name ?? '—') : (defaultTierName ?? '—')} className={cx(input, 'opacity-70')} />
                                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t('client.loyaltyGroupHint')}</p>
                            </label>
                            <label className="block">
                                <span className={label}>{t('client.referralCode')}</span>
                                <input value={referralCode} onChange={(e) => setReferralCode(e.target.value)} className={input} />
                                <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{t('client.referralCodeHint')}</p>
                            </label>
                        </div>
                    </section>

                    <section className={cx(cardPadded, 'space-y-3')}>
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800 dark:text-ink-100">
                            <StickyNote aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                            {t('client.section.notes')}
                        </h3>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            rows={3}
                            placeholder={t('client.notesPlaceholder')}
                            className={cx(input, 'w-full')}
                        />
                    </section>
                </div>

                <div className="space-y-4">
                    <section className={cx(cardPadded, 'space-y-2')}>
                        <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">{t('client.statusCard.title')}</h3>
                        <Toggle checked={isActive} onChange={setIsActive} label={t('client.activeStatus')} description={t('client.statusCard.description')} />
                    </section>

                    <section className={cx(cardPadded, 'space-y-2.5')}>
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800 dark:text-ink-100">
                            <Fingerprint aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                            {t('client.duplicateCheck.title')}
                        </h3>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{t('client.duplicateCheck.description')}</p>
                        {duplicate.status === 'duplicate' && duplicate.match ? (
                            <div className="flex items-start justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">
                                <p>
                                    {t('client.duplicateCheck.found', { phone: duplicate.match.phone, name: `${duplicate.match.first_name} ${duplicate.match.last_name}` })}
                                </p>
                                <a href={`/clients/${duplicate.match.id}`} target="_blank" rel="noreferrer" className={cx(textLink, 'inline-flex shrink-0 items-center gap-1 whitespace-nowrap')}>
                                    {t('client.duplicateCheck.open')}
                                    <ExternalLink aria-hidden="true" className="h-3 w-3" />
                                </a>
                            </div>
                        ) : duplicate.status === 'clear' ? (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
                                {t('client.duplicateCheck.clear')}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-ink-200 bg-ink-50 p-3 text-xs text-ink-500 dark:border-ink-700 dark:bg-ink-800/60 dark:text-ink-400">
                                {t('client.duplicateCheck.idle')}
                            </div>
                        )}
                    </section>

                    <section className={cx(cardPadded, 'space-y-2.5')}>
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800 dark:text-ink-100">
                            <ShieldCheck aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                            {t('client.consent.title')}
                        </h3>
                        <p className="text-xs text-ink-500 dark:text-ink-400">{t('client.consent.description')}</p>
                        <label className="flex items-start gap-2.5 text-sm text-ink-800 dark:text-ink-100">
                            <input type="checkbox" checked={smsConsent} onChange={(e) => setSmsConsent(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-ink-400" />
                            <span>
                                <span className="block font-medium">{t('client.consent.sms')}</span>
                                <span className="block text-xs text-ink-500 dark:text-ink-400">{t('client.consent.smsHint')}</span>
                            </span>
                        </label>
                        <label className="flex items-start gap-2.5 text-sm text-ink-800 dark:text-ink-100">
                            <input type="checkbox" checked={emailConsent} onChange={(e) => setEmailConsent(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-ink-400" />
                            <span>
                                <span className="block font-medium">{t('client.consent.email')}</span>
                                <span className="block text-xs text-ink-500 dark:text-ink-400">{t('client.consent.emailHint')}</span>
                            </span>
                        </label>
                    </section>

                    <section className={cx(card, 'flex items-start gap-2.5 p-4 text-xs text-ink-600 dark:text-ink-350')}>
                        <Archive aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-500 dark:text-ink-400" />
                        <div>
                            <p className="font-semibold text-ink-800 dark:text-ink-100">{t('client.archive.title')}</p>
                            <p className="mt-0.5">{t('client.archive.description')}</p>
                        </div>
                    </section>

                    {client && (
                        <section className={cx(card, 'flex items-start gap-2.5 p-4 text-xs text-ink-600 dark:text-ink-350')}>
                            <RefreshCw aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-ink-500 dark:text-ink-400" />
                            <div>
                                <p className="font-semibold text-ink-800 dark:text-ink-100">{t('client.sync.title')}</p>
                                <p className="mt-0.5">{t('client.sync.lastUpdate', { date: dateTime(client.updated_at) })}</p>
                            </div>
                        </section>
                    )}
                </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-ink-200/80 pt-5 dark:border-ink-800">
                <button type="button" onClick={onCancel} className={button('ghost')}>
                    {t('common.cancel')}
                </button>
                <button type="submit" disabled={busy !== null} className={button('secondary')}>
                    {busy === 'save' ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />}
                    {t('common.save')}
                </button>
                <button type="button" disabled={busy !== null} onClick={(e) => void submit(e, true)} className={button('primary')}>
                    {busy === 'saveAndOrder' ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />}
                    {t('client.saveAndCreateOrder')}
                </button>
            </div>
        </form>
    );
}

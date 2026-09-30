import { useState, type FormEvent } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import type { Client } from '../../types';
import { Check, StickyNote, UserPen, UserPlus, UserRound } from 'lucide-react';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { button, cardPadded, cx, input, label, sectionTitle } from '../../components/ui/styles';

interface Props {
    client: Client | null;
    onSaved: (client: Client) => void;
    onCancel: () => void;
}

export default function ClientForm({ client, onSaved, onCancel }: Props) {
    const { t } = useI18n();
    const { user, activeAgencyId } = useAuth();
    const [firstName, setFirstName] = useState(client?.first_name ?? '');
    const [lastName, setLastName] = useState(client?.last_name ?? '');
    const [phone, setPhone] = useState(client?.phone ?? '');
    const [email, setEmail] = useState(client?.email ?? '');
    const [address, setAddress] = useState(client?.address ?? '');
    const [notes, setNotes] = useState(client?.notes ?? '');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const payload = { first_name: firstName, last_name: lastName, phone, email: email || null, address: address || null, notes: notes || null };
        const isGlobal = user?.agency_id === null;
        if (!client && isGlobal && !activeAgencyId) {
            setError(t('client.selectAgency'));
            setBusy(false);
            return;
        }
        try {
            // À la création, l'API exige l'agence pour un rôle global et la refuse pour un rôle d'agence.
            const saved = client
                ? await api.patch<Client>(`/clients/${client.id}`, payload)
                : await api.post<Client>('/clients', isGlobal ? { ...payload, agency_id: activeAgencyId } : payload);
            onSaved(saved);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const Icon = client ? UserPen : UserPlus;

    return (
        <form onSubmit={handleSubmit} className={cx(cardPadded, 'animate-fade-in space-y-6')} aria-label={client ? t('client.edit') : t('client.new')}>
            <h2 className={cx(sectionTitle, 'flex items-center gap-2')}>
                <Icon aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {client ? t('client.edit') : t('client.new')}
            </h2>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800 dark:text-ink-100">
                    <UserRound aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                    {t('client.section.identity')}
                </h3>
                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block">
                        <span className={label}>{t('client.firstName')}</span>
                        <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('client.lastName')}</span>
                        <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('client.phone')}</span>
                        <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={input} />
                    </label>
                    <label className="block">
                        <span className={label}>{t('client.email')}</span>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
                    </label>
                    <label className="block sm:col-span-2">
                        <span className={label}>{t('client.address')}</span>
                        <input value={address} onChange={(e) => setAddress(e.target.value)} className={input} />
                    </label>
                </div>
            </div>

            <div className="space-y-3 border-t border-ink-200/80 pt-5 dark:border-ink-800">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800 dark:text-ink-100">
                    <StickyNote aria-hidden="true" className="h-4 w-4 text-ink-500 dark:text-ink-350" />
                    {t('client.section.notes')}
                </h3>
                <label className="block">
                    <span className="sr-only">{t('client.section.notes')}</span>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        placeholder={t('client.notesPlaceholder')}
                        className={cx(input, 'w-full')}
                    />
                </label>
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-ink-200/80 pt-5 dark:border-ink-800">
                <button type="button" onClick={onCancel} className={button('ghost')}>
                    {t('common.cancel')}
                </button>
                <button type="submit" disabled={busy} className={button('primary')}>
                    {busy ? <Spinner className="h-4 w-4" /> : <Check aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />}
                    {t('common.save')}
                </button>
            </div>
        </form>
    );
}

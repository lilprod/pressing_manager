import { useState, type FormEvent } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import type { Client } from '../../types';
import { Check, UserPen, UserPlus } from 'lucide-react';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { button, cardPadded, cx, input, label, sectionTitle } from '../../components/ui/styles';

interface Props {
    client: Client | null;
    onSaved: (client: Client) => void;
    onCancel: () => void;
}

export default function ClientForm({ client, onSaved, onCancel }: Props) {
    const { t } = useI18n();
    const [firstName, setFirstName] = useState(client?.first_name ?? '');
    const [lastName, setLastName] = useState(client?.last_name ?? '');
    const [phone, setPhone] = useState(client?.phone ?? '');
    const [email, setEmail] = useState(client?.email ?? '');
    const [address, setAddress] = useState(client?.address ?? '');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const payload = { first_name: firstName, last_name: lastName, phone, email: email || null, address: address || null };
        try {
            const saved = client
                ? await api.patch<Client>(`/clients/${client.id}`, payload)
                : await api.post<Client>('/clients', payload);
            onSaved(saved);
        } catch (err) {
            setError(err instanceof ApiError ? err.message : t('common.error'));
        } finally {
            setBusy(false);
        }
    }

    const Icon = client ? UserPen : UserPlus;

    return (
        <form onSubmit={handleSubmit} className={cx(cardPadded, 'animate-fade-in space-y-5 ring-2 ring-brand-500/20')} aria-label={client ? t('client.edit') : t('client.new')}>
            <h2 className={cx(sectionTitle, 'flex items-center gap-2')}>
                <Icon aria-hidden="true" className="h-5 w-5 text-brand-700 dark:text-brand-300" />
                {client ? t('client.edit') : t('client.new')}
            </h2>

            {error && <Alert tone="error">{error}</Alert>}

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

            <div className="flex flex-wrap justify-end gap-2">
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

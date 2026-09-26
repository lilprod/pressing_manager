import { useState, type FormEvent } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import type { Client } from '../../types';

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

    return (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-slate-200 p-4 dark:border-slate-700" aria-label={t('client.new')}>
            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                    {t('client.firstName')}
                    <input
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                    />
                </label>
                <label className="text-sm">
                    {t('client.lastName')}
                    <input
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                    />
                </label>
                <label className="text-sm">
                    {t('client.phone')}
                    <input
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                    />
                </label>
                <label className="text-sm">
                    {t('client.email')}
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                    />
                </label>
                <label className="col-span-2 text-sm">
                    {t('client.address')}
                    <input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1 dark:border-slate-600 dark:bg-slate-900"
                    />
                </label>
            </div>

            <div className="flex gap-2">
                <button type="submit" disabled={busy} className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                    {t('common.save')}
                </button>
                <button type="button" onClick={onCancel} className="rounded-md border border-slate-300 px-4 py-2 text-sm dark:border-slate-600">
                    {t('common.cancel')}
                </button>
            </div>
        </form>
    );
}

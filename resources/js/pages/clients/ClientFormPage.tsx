import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { api, ApiError } from '../../lib/api';
import { Alert, LoadingState } from '../../components/ui/Feedback';
import { cx, textLink } from '../../components/ui/styles';
import ClientForm from './ClientForm';
import type { Client } from '../../types';

export default function ClientFormPage() {
    const { id } = useParams<{ id: string }>();
    const isEdit = Boolean(id);
    const navigate = useNavigate();
    const { t } = useI18n();

    const [client, setClient] = useState<Client | null>(null);
    const [loading, setLoading] = useState(isEdit);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id) return;
        api
            .get<Client>(`/clients/${id}`)
            .then(setClient)
            .catch((err) => {
                if (err instanceof ApiError && err.status === 404) setNotFound(true);
            })
            .finally(() => setLoading(false));
    }, [id]);

    const backLink = (
        <Link to="/clients" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('client.backToList')}
        </Link>
    );

    if (loading) {
        return <LoadingState />;
    }

    if (notFound) {
        return (
            <div className="space-y-4">
                {backLink}
                <Alert tone="error">{t('client.notFound')}</Alert>
            </div>
        );
    }

    return (
        <div className="max-w-2xl space-y-4">
            {backLink}
            <ClientForm
                client={client}
                onCancel={() => navigate('/clients')}
                onSaved={() => navigate('/clients')}
            />
        </div>
    );
}

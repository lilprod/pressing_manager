import { useEffect, useState } from 'react';
import { CheckCircle2, RotateCcw, TriangleAlert } from 'lucide-react';
import { platformApi, PlatformApiError } from '../../lib/platformApi';
import { useFormat } from '../../lib/format';
import { Alert, EmptyState, LoadingState, Spinner } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { ChipToggle } from '../../components/ui/Metrics';
import { button, card, cx, input, label, select } from '../../components/ui/styles';

/* Registre des incidents plateforme (audit Figma du 2026-10-13) : saisis et clôturés par
 * l'équipe Spark. Ils alimentent « Incidents ouverts », « Alertes récentes » et la
 * pastille d'incident d'un pressing — aucune télémétrie de santé n'est inventée. */

type Incident = {
    id: number;
    title: string;
    description: string | null;
    priority: 'P1' | 'P2' | 'P3';
    status: 'open' | 'resolved';
    resolution: string | null;
    created_at: string;
    resolved_at: string | null;
    pressing: { id: number; name: string; code: string } | null;
    opener: { id: number; name: string } | null;
    resolver: { id: number; name: string } | null;
};

const PRIORITY_TONE = { P1: 'rose', P2: 'amber', P3: 'sky' } as const;

export default function IncidentsPage() {
    const { dateTime } = useFormat();
    const [incidents, setIncidents] = useState<Incident[]>([]);
    const [pressings, setPressings] = useState<{ id: number; name: string }[]>([]);
    const [status, setStatus] = useState<'open' | 'resolved' | ''>('open');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [draft, setDraft] = useState({ title: '', description: '', priority: 'P2', pressing_id: '' });

    function reload() {
        setLoading(true);
        platformApi
            .get<{ data: Incident[] }>(`/incidents${status ? `?status=${status}` : ''}`)
            .then((p) => setIncidents(p.data))
            .finally(() => setLoading(false));
    }

    useEffect(reload, [status]);
    useEffect(() => {
        platformApi.get<{ data: { id: number; name: string }[] }>('/pressings?per_page=100').then((p) => setPressings(p.data)).catch(() => setPressings([]));
    }, []);

    async function create() {
        setBusy(true);
        setError(null);
        try {
            await platformApi.post('/incidents', {
                title: draft.title,
                description: draft.description || null,
                priority: draft.priority,
                pressing_id: draft.pressing_id ? Number(draft.pressing_id) : null,
            });
            setDraft({ title: '', description: '', priority: 'P2', pressing_id: '' });
            reload();
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        } finally {
            setBusy(false);
        }
    }

    async function setIncidentStatus(incident: Incident, next: 'open' | 'resolved') {
        setError(null);
        try {
            await platformApi.patch(`/incidents/${incident.id}`, { status: next });
            reload();
        } catch (err) {
            setError(err instanceof PlatformApiError ? err.message : 'Une erreur est survenue.');
        }
    }

    return (
        <div className="space-y-6">
            <header className="flex items-center gap-3.5">
                <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 text-ink-950 shadow-sm sm:flex">
                    <TriangleAlert aria-hidden="true" className="h-5 w-5" strokeWidth={2} />
                </span>
                <div>
                    <h1 className="font-display text-2xl font-bold text-ink-900 dark:text-white">Incidents</h1>
                    <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-350">Registre des incidents déclarés par l'équipe plateforme.</p>
                </div>
            </header>

            {error && <Alert tone="error">{error}</Alert>}

            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className={cx(card, 'min-w-0 overflow-hidden')}>
                    <div role="group" aria-label="Statut" className="flex flex-wrap gap-2 border-b border-ink-100 px-5 py-3 dark:border-ink-800">
                        <ChipToggle active={status === 'open'} onClick={() => setStatus('open')}>Ouverts</ChipToggle>
                        <ChipToggle active={status === 'resolved'} onClick={() => setStatus('resolved')}>Résolus</ChipToggle>
                        <ChipToggle active={status === ''} onClick={() => setStatus('')}>Tous</ChipToggle>
                    </div>
                    {loading ? (
                        <LoadingState />
                    ) : incidents.length === 0 ? (
                        <EmptyState icon={TriangleAlert} title="Aucun incident" />
                    ) : (
                        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                            {incidents.map((incident) => (
                                <li key={incident.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                                    <Pill tone={PRIORITY_TONE[incident.priority]}>{incident.priority}</Pill>
                                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                                        <p className="font-semibold text-ink-900 dark:text-white">{incident.title}</p>
                                        <p className="text-xs text-ink-600 dark:text-ink-350">
                                            {incident.pressing?.name ?? 'Plateforme'} · ouvert {dateTime(incident.created_at)}
                                            {incident.opener ? ` par ${incident.opener.name}` : ''}
                                            {incident.resolved_at ? ` · résolu ${dateTime(incident.resolved_at)}${incident.resolver ? ` par ${incident.resolver.name}` : ''}` : ''}
                                        </p>
                                        {incident.description && <p className="mt-1 text-sm text-ink-700 dark:text-ink-200">{incident.description}</p>}
                                    </div>
                                    {incident.status === 'open' ? (
                                        <button type="button" onClick={() => void setIncidentStatus(incident, 'resolved')} className={button('secondary', 'sm')}>
                                            <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                                            Résoudre
                                        </button>
                                    ) : (
                                        <button type="button" onClick={() => void setIncidentStatus(incident, 'open')} className={button('ghost', 'sm')}>
                                            <RotateCcw aria-hidden="true" className="h-4 w-4" />
                                            Rouvrir
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <section className={cx(card, 'space-y-3 p-5')}>
                    <h2 className="font-display text-lg font-bold text-ink-900 dark:text-white">Déclarer un incident</h2>
                    <label className="block">
                        <span className={label}>Titre *</span>
                        <input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} className={input} />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="block">
                            <span className={label}>Priorité</span>
                            <select value={draft.priority} onChange={(e) => setDraft((d) => ({ ...d, priority: e.target.value }))} className={select}>
                                <option value="P1">P1 · critique</option>
                                <option value="P2">P2 · élevée</option>
                                <option value="P3">P3 · normale</option>
                            </select>
                        </label>
                        <label className="block">
                            <span className={label}>Pressing</span>
                            <select value={draft.pressing_id} onChange={(e) => setDraft((d) => ({ ...d, pressing_id: e.target.value }))} className={select}>
                                <option value="">Plateforme</option>
                                {pressings.map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <label className="block">
                        <span className={label}>Description</span>
                        <textarea rows={3} value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} className={input} />
                    </label>
                    <button type="button" onClick={() => void create()} disabled={busy || !draft.title.trim()} className={cx(button('primary', 'md'), 'w-full')}>
                        {busy && <Spinner className="h-4 w-4" />}
                        Déclarer
                    </button>
                </section>
            </div>
        </div>
    );
}

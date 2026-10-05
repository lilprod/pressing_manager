import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDownCircle, ArrowLeft, ArrowUpCircle, Paperclip } from 'lucide-react';
import { useI18n } from '../../contexts/I18nContext';
import { useFormat } from '../../lib/format';
import { api, ApiError } from '../../lib/api';
import { Alert, LoadingState } from '../../components/ui/Feedback';
import { Pill } from '../../components/ui/StatusBadge';
import { Timeline, type TimelineEntry } from '../../components/ui/Timeline';
import { button, cardPadded, cx, sectionTitle, textLink } from '../../components/ui/styles';
import type { CashMovement } from '../../types';

/** Fiche détail d'un mouvement de caisse — « Traçabilité » réelle (pas de panneau
 * fabriqué) : chronologie construite depuis les champs de cycle de vie déjà en base
 * (created_at/created_by, validated_at/validated_by), même composant Timeline que
 * la chronologie atelier/journal d'audit de la fiche dépôt. */
export default function CashMovementDetailPage() {
    const { id } = useParams<{ id: string }>();
    const { t } = useI18n();
    const { money, dateTime } = useFormat();

    const [movement, setMovement] = useState<CashMovement | null>(null);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);

    useEffect(() => {
        if (!id) return;
        api
            .get<CashMovement>(`/cash/movements/${id}`)
            .then(setMovement)
            .catch((err) => {
                if (err instanceof ApiError && (err.status === 404 || err.status === 403)) setNotFound(true);
            })
            .finally(() => setLoading(false));
    }, [id]);

    const timeline = useMemo<TimelineEntry[]>(() => {
        if (!movement) return [];
        const entries: TimelineEntry[] = [];
        if (movement.status === 'valide' && movement.validated_at) {
            entries.push({
                id: 'validated',
                label: t('cash.movementDetail.timeline.validated'),
                at: movement.validated_at,
                actor: movement.validator?.name ?? null,
            });
        } else if (movement.status === 'en_attente') {
            entries.push({ id: 'pending', label: t('cash.movementDetail.timeline.pending'), at: movement.occurred_at, actor: null });
        }
        entries.push({
            id: 'created',
            label: t('cash.movementDetail.timeline.created'),
            at: movement.occurred_at,
            actor: movement.creator?.name ?? null,
        });
        return entries;
    }, [movement, t]);

    const backLink = (
        <Link to="/cash" className={cx(textLink, 'inline-flex items-center gap-1.5 text-sm')}>
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            {t('cash.backToRegister')}
        </Link>
    );

    if (loading) return <LoadingState />;

    if (notFound || !movement) {
        return (
            <div className="space-y-4">
                {backLink}
                <Alert tone="error">{t('cash.movementDetail.notFound')}</Alert>
            </div>
        );
    }

    const Icon = movement.type === 'entree' ? ArrowUpCircle : ArrowDownCircle;

    return (
        <div className="max-w-xl space-y-4">
            {backLink}

            <section className={cx(cardPadded, 'space-y-5')}>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span
                            className={cx(
                                'flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-inset',
                                movement.type === 'entree'
                                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25'
                                    : 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/25',
                            )}
                        >
                            <Icon aria-hidden="true" className="h-5 w-5" />
                        </span>
                        <div>
                            <h1 className="font-display text-xl font-bold text-ink-900 dark:text-white">{movement.reason}</h1>
                            <p className="text-sm text-ink-600 dark:text-ink-350">{t(`cash.movementCategory.${movement.category}`)}</p>
                        </div>
                    </div>
                    {movement.status === 'en_attente' ? (
                        <Pill tone="amber">{t('cash.pending.badge')}</Pill>
                    ) : (
                        <Pill tone="emerald">{t('cash.closureForm.varianceOk')}</Pill>
                    )}
                </div>

                <p
                    className={cx(
                        'font-display text-3xl font-bold tabular-nums',
                        movement.type === 'entree' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400',
                    )}
                >
                    {movement.type === 'entree' ? '+' : '-'}
                    {money(movement.amount)}
                </p>

                <dl className="space-y-2 border-t border-ink-200/80 pt-4 text-sm dark:border-ink-800">
                    {movement.counterparty && (
                        <div className="flex justify-between">
                            <dt className="text-ink-600 dark:text-ink-350">{t('cash.movementForm.counterparty')}</dt>
                            <dd className="font-medium text-ink-900 dark:text-white">{movement.counterparty}</dd>
                        </div>
                    )}
                    {movement.reference && (
                        <div className="flex justify-between">
                            <dt className="text-ink-600 dark:text-ink-350">{t('cash.movementForm.reference')}</dt>
                            <dd className="font-medium text-ink-900 dark:text-white">{movement.reference}</dd>
                        </div>
                    )}
                    {movement.note && (
                        <div className="flex justify-between gap-4">
                            <dt className="shrink-0 text-ink-600 dark:text-ink-350">{t('cash.movementForm.note')}</dt>
                            <dd className="text-right font-medium text-ink-900 dark:text-white">{movement.note}</dd>
                        </div>
                    )}
                </dl>

                {movement.proof_path && (
                    <a
                        href={`/api/cash/movements/${movement.id}/proof`}
                        target="_blank"
                        rel="noreferrer"
                        className={cx(button('secondary', 'sm'), 'w-fit')}
                    >
                        <Paperclip aria-hidden="true" className="h-4 w-4" />
                        {t('cash.movementForm.proof')}
                    </a>
                )}

                <div className="space-y-2 border-t border-ink-200/80 pt-4 dark:border-ink-800">
                    <h3 className={cx(sectionTitle, 'text-sm')}>{t('cash.movementDetail.timeline.title')}</h3>
                    <Timeline entries={timeline} emptyLabel={t('order.timeline.empty')} />
                </div>

                <p className="border-t border-ink-200/80 pt-4 text-xs text-ink-500 dark:border-ink-800 dark:text-ink-400">
                    {t('cash.movementDetail.createdBy')} {movement.creator?.name ?? '—'} · {dateTime(movement.occurred_at)}
                </p>
            </section>
        </div>
    );
}

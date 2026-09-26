import {
    Ban,
    CircleCheck,
    CircleDashed,
    Clock,
    FileText,
    Hourglass,
    Inbox,
    ListFilter,
    PackageCheck,
    RotateCcw,
    ShieldCheck,
    ShieldAlert,
    Truck,
    TriangleAlert,
    WashingMachine,
    XCircle,
    type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useI18n } from '../../contexts/I18nContext';
import { cx } from './styles';

export type Tone = 'neutral' | 'brand' | 'sky' | 'violet' | 'amber' | 'orange' | 'emerald' | 'rose' | 'accent';

/* Chaque ton : fond doux + texte foncé en clair (≥ 6,8:1), fond translucide + texte
 * 300 en sombre (≥ 7,4:1). Voir tailwind.config.js pour la palette. */
export const TONES: Record<Tone, string> = {
    neutral: 'bg-ink-100 text-ink-700 ring-ink-200 dark:bg-ink-400/10 dark:text-ink-300 dark:ring-ink-400/20',
    brand: 'bg-brand-50 text-brand-800 ring-brand-200 dark:bg-brand-400/10 dark:text-brand-300 dark:ring-brand-400/25',
    sky: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-400/10 dark:text-sky-300 dark:ring-sky-400/25',
    violet: 'bg-violet-50 text-violet-800 ring-violet-200 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/25',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/25',
    orange: 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-400/10 dark:text-orange-300 dark:ring-orange-400/25',
    emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/25',
    rose: 'bg-rose-50 text-rose-800 ring-rose-200 dark:bg-rose-400/10 dark:text-rose-300 dark:ring-rose-400/25',
    accent: 'bg-accent-100 text-accent-800 ring-accent-200 dark:bg-accent-400/15 dark:text-accent-300 dark:ring-accent-400/25',
};

type StatusKind = 'order' | 'invoice' | 'payment' | 'license' | 'subscription' | 'delivery';

interface StatusStyle {
    tone: Tone;
    icon: LucideIcon;
}

const ITEM_STYLES: Record<string, StatusStyle> = {
    recu: { tone: 'sky', icon: Inbox },
    trie: { tone: 'violet', icon: ListFilter },
    en_traitement: { tone: 'brand', icon: WashingMachine },
    controle_qualite: { tone: 'amber', icon: ShieldCheck },
    pret: { tone: 'emerald', icon: PackageCheck },
    livre: { tone: 'neutral', icon: Truck },
    non_recupere: { tone: 'orange', icon: Hourglass },
    perdu: { tone: 'rose', icon: TriangleAlert },
    annule: { tone: 'neutral', icon: Ban },
};

const STYLES: Record<StatusKind, Record<string, StatusStyle>> = {
    order: ITEM_STYLES,
    invoice: {
        brouillon: { tone: 'neutral', icon: FileText },
        emise: { tone: 'sky', icon: FileText },
        payee: { tone: 'emerald', icon: CircleCheck },
        partiellement_payee: { tone: 'amber', icon: CircleDashed },
        annulee: { tone: 'rose', icon: Ban },
    },
    payment: {
        en_attente: { tone: 'amber', icon: Clock },
        complete: { tone: 'emerald', icon: CircleCheck },
        echoue: { tone: 'rose', icon: XCircle },
        rembourse: { tone: 'neutral', icon: RotateCcw },
    },
    license: {
        active: { tone: 'emerald', icon: ShieldCheck },
        grace_period: { tone: 'amber', icon: ShieldAlert },
        expired: { tone: 'rose', icon: ShieldAlert },
    },
    subscription: {
        active: { tone: 'emerald', icon: CircleCheck },
        expired: { tone: 'neutral', icon: Hourglass },
        annulee: { tone: 'rose', icon: Ban },
    },
    delivery: {
        a_planifier: { tone: 'amber', icon: Clock },
        en_cours: { tone: 'sky', icon: Truck },
        livree: { tone: 'emerald', icon: CircleCheck },
        echouee: { tone: 'rose', icon: XCircle },
    },
};

const LABEL_PREFIX: Record<StatusKind, string> = {
    order: 'status.',
    invoice: 'invoice.status.',
    payment: 'payment.status.',
    license: 'license.status.',
    subscription: 'subscription.status.',
    delivery: 'delivery.status.',
};

export function statusTone(kind: StatusKind, status: string): Tone {
    return STYLES[kind][status]?.tone ?? 'neutral';
}

interface Props {
    kind: StatusKind;
    status: string;
    size?: 'sm' | 'md';
    className?: string;
}

export default function StatusBadge({ kind, status, size = 'sm', className }: Props) {
    const { t } = useI18n();
    const style = STYLES[kind][status] ?? { tone: 'neutral' as Tone, icon: CircleDashed };
    const Icon = style.icon;

    return (
        <span
            className={cx(
                'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset',
                size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
                TONES[style.tone],
                className,
            )}
        >
            <Icon aria-hidden="true" className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2.25} />
            {t(`${LABEL_PREFIX[kind]}${status}`)}
        </span>
    );
}

export function Pill({ tone, icon: Icon, children, className }: { tone: Tone; icon?: LucideIcon; children: ReactNode; className?: string }) {
    return (
        <span
            className={cx(
                'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                TONES[tone],
                className,
            )}
        >
            {Icon && <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.25} />}
            {children}
        </span>
    );
}

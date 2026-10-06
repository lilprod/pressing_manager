import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Search, Users } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { api } from '../lib/api';
import { cx } from './ui/styles';
import type { GlobalSearchResponse, SearchResultItem } from '../types';

/**
 * Recherche globale (en-tête) + raccourci ⌘K/Ctrl+K — interroge `GET /search`
 * (clients + dépôts, scopé agence/pressing côté backend). Jamais de recherche
 * fourre-tout : deux groupes de résultats distincts, chacun gardé par sa propre
 * permission côté serveur (voir `SearchController`).
 */
export default function GlobalSearch() {
    const { t } = useI18n();
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState<GlobalSearchResponse>({ clients: [], orders: [] });
    const [activeIndex, setActiveIndex] = useState(-1);

    const flatResults: Array<SearchResultItem & { group: 'clients' | 'orders' }> = [
        ...results.clients.map((r) => ({ ...r, group: 'clients' as const })),
        ...results.orders.map((r) => ({ ...r, group: 'orders' as const })),
    ];

    useEffect(() => {
        function handleShortcut(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === 'Escape') {
                setOpen(false);
                inputRef.current?.blur();
            }
        }
        window.addEventListener('keydown', handleShortcut);
        return () => window.removeEventListener('keydown', handleShortcut);
    }, []);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const term = query.trim();
        if (term.length < 2) {
            setResults({ clients: [], orders: [] });
            setActiveIndex(-1);
            return;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            api
                .get<GlobalSearchResponse>(`/search?q=${encodeURIComponent(term)}`, controller.signal)
                .then((res) => {
                    setResults(res);
                    setActiveIndex(-1);
                })
                .catch(() => {});
        }, 300);
        return () => {
            clearTimeout(timeout);
            controller.abort();
        };
    }, [query]);

    function go(item: SearchResultItem) {
        setOpen(false);
        setQuery('');
        inputRef.current?.blur();
        navigate(item.url);
    }

    function handleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
        if (!open || flatResults.length === 0) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, flatResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && activeIndex >= 0) {
            e.preventDefault();
            go(flatResults[activeIndex]);
        }
    }

    const hasResults = flatResults.length > 0;

    return (
        <div ref={containerRef} className="relative hidden min-w-0 flex-1 max-w-md md:block">
            <div className="relative">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 dark:text-ink-400" />
                <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('search.placeholder')}
                    aria-label={t('search.placeholder')}
                    className="h-10 w-full rounded-xl border border-ink-300 bg-white pl-9 pr-14 text-sm text-ink-800 transition placeholder:text-ink-500 hover:border-ink-400 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-500/15 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100 dark:placeholder:text-ink-400"
                />
                <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md border border-ink-300 bg-ink-50 px-1.5 py-0.5 text-[10px] font-semibold text-ink-500 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-400">
                    ⌘K
                </kbd>
            </div>

            {open && query.trim().length >= 2 && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-ink-200 bg-white py-1.5 shadow-lg dark:border-ink-700 dark:bg-ink-900">
                    {!hasResults ? (
                        <p className="px-3.5 py-3 text-sm text-ink-600 dark:text-ink-350">{t('search.empty')}</p>
                    ) : (
                        <>
                            {results.clients.length > 0 && (
                                <SearchGroup
                                    label={t('search.groupClients')}
                                    icon={Users}
                                    items={results.clients}
                                    group="clients"
                                    activeIndex={activeIndex}
                                    flatResults={flatResults}
                                    onSelect={go}
                                />
                            )}
                            {results.orders.length > 0 && (
                                <SearchGroup
                                    label={t('search.groupOrders')}
                                    icon={ClipboardList}
                                    items={results.orders}
                                    group="orders"
                                    activeIndex={activeIndex}
                                    flatResults={flatResults}
                                    onSelect={go}
                                />
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function SearchGroup({
    label,
    icon: Icon,
    items,
    group,
    activeIndex,
    flatResults,
    onSelect,
}: {
    label: string;
    icon: typeof Users;
    items: SearchResultItem[];
    group: 'clients' | 'orders';
    activeIndex: number;
    flatResults: Array<SearchResultItem & { group: 'clients' | 'orders' }>;
    onSelect: (item: SearchResultItem) => void;
}) {
    return (
        <div className="py-1">
            <p className="px-3.5 pb-1 pt-1 text-[11px] font-bold uppercase tracking-wide text-ink-500 dark:text-ink-400">{label}</p>
            {items.map((item) => {
                const flatIndex = flatResults.findIndex((r) => r.group === group && r.id === item.id);
                return (
                    <button
                        key={`${group}-${item.id}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => onSelect(item)}
                        className={cx(
                            'flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm transition',
                            flatIndex === activeIndex ? 'bg-brand-50 dark:bg-brand-400/10' : 'hover:bg-ink-50 dark:hover:bg-ink-800',
                        )}
                    >
                        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-ink-500 dark:text-ink-400" />
                        <span className="min-w-0 flex-1 truncate">
                            <span className="font-semibold text-ink-900 dark:text-ink-50">{item.label}</span>
                            {item.subtitle && <span className="ml-1.5 text-ink-600 dark:text-ink-350">{item.subtitle}</span>}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

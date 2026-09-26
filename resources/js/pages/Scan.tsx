import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import type { OrderItem } from '../types';
import { Camera, Keyboard, ScanLine, Search } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Alert } from '../components/ui/Feedback';
import { button, card, cx, inputLg } from '../components/ui/styles';

declare global {
    interface Window {
        BarcodeDetector?: new (options: { formats: string[] }) => {
            detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
        };
    }
}

export default function Scan() {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [cameraActive, setCameraActive] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const supportsCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window;

    async function resolveCode(value: string) {
        setError(null);
        try {
            const item = await api.get<OrderItem>(`/order-items/scan/${encodeURIComponent(value)}`);
            navigate(`/orders/${item.order_id}`);
        } catch (err) {
            setError(err instanceof ApiError && err.status === 404 ? t('scan.notFound') : t('common.error'));
        }
    }

    function handleManualSubmit(event: FormEvent) {
        event.preventDefault();
        if (code.trim()) {
            void resolveCode(code.trim());
        }
    }

    useEffect(() => {
        if (!cameraActive || !window.BarcodeDetector) {
            return;
        }

        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        let stopped = false;

        navigator.mediaDevices
            .getUserMedia({ video: { facingMode: 'environment' } })
            .then((stream) => {
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    void videoRef.current.play();
                }

                const scanLoop = async () => {
                    if (stopped || !videoRef.current) return;
                    try {
                        const codes = await detector.detect(videoRef.current);
                        if (codes[0]) {
                            stopped = true;
                            await resolveCode(codes[0].rawValue);
                            return;
                        }
                    } catch {
                        // image pas encore prête, on continue la boucle
                    }
                    requestAnimationFrame(() => void scanLoop());
                };
                void scanLoop();
            })
            .catch(() => setError(t('scan.unsupported')));

        return () => {
            stopped = true;
            streamRef.current?.getTracks().forEach((track) => track.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cameraActive]);

    return (
        <div className="mx-auto max-w-xl space-y-6">
            <PageHeader title={t('scan.title')} subtitle={t('scan.subtitle')} icon={ScanLine} />

            {error && <Alert tone="error">{error}</Alert>}

            <div className={cx(card, 'overflow-hidden')}>
                {supportsCamera ? (
                    !cameraActive ? (
                        <div className="flex flex-col items-center gap-5 bg-gradient-to-b from-brand-50 to-white px-6 py-10 text-center dark:from-brand-400/10 dark:to-ink-900">
                            <ScanFrame />
                            <button type="button" onClick={() => setCameraActive(true)} className={button('primary', 'lg', 'w-full max-w-xs')}>
                                <Camera aria-hidden="true" className="h-5 w-5" />
                                {t('scan.start')}
                            </button>
                        </div>
                    ) : (
                        <div className="relative bg-ink-950">
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            <video ref={videoRef} className="aspect-[4/3] w-full object-cover" muted playsInline aria-label={t('scan.title')} />
                            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                <div className="relative h-3/5 w-3/5 max-w-[16rem] rounded-3xl shadow-[0_0_0_9999px_rgb(12_20_27/0.45)]">
                                    <Corners className="text-white" />
                                    <div className="absolute inset-x-4 top-1/2 h-0.5 rounded-full bg-accent-400 shadow-[0_0_12px_2px] shadow-accent-400/60" />
                                </div>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="flex flex-col items-center gap-4 bg-gradient-to-b from-ink-50 to-white px-6 py-10 text-center dark:from-ink-800/40 dark:to-ink-900">
                        <ScanFrame muted />
                        <p className="max-w-xs text-sm text-ink-600 dark:text-ink-350">{t('scan.unsupported')}</p>
                    </div>
                )}

                <div className="border-t border-ink-200/80 p-5 dark:border-ink-800">
                    <form onSubmit={handleManualSubmit} className="space-y-2">
                        <label htmlFor="manual-code" className="flex items-center gap-2 text-sm font-semibold text-ink-700 dark:text-ink-200">
                            <Keyboard aria-hidden="true" className="h-4 w-4" />
                            {t('scan.manualEntry')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                id="manual-code"
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder={t('scan.codePlaceholder')}
                                autoComplete="off"
                                className={cx(inputLg, 'flex-1 font-mono')}
                            />
                            <button type="submit" className={button('secondary', 'lg', 'px-5')}>
                                <Search aria-hidden="true" className="h-5 w-5" />
                                <span className="hidden sm:inline">{t('common.search')}</span>
                                <span className="sr-only sm:hidden">{t('common.search')}</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

function Corners({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={cx('absolute inset-0 h-full w-full', className)} fill="none">
            <path d="M2 22V10a8 8 0 0 1 8-8h12M78 2h12a8 8 0 0 1 8 8v12M98 78v12a8 8 0 0 1-8 8H78M22 98H10a8 8 0 0 1-8-8V78" stroke="currentColor" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

function ScanFrame({ muted = false }: { muted?: boolean }) {
    return (
        <div aria-hidden="true" className="relative flex h-32 w-32 items-center justify-center">
            <Corners className={muted ? 'text-ink-400' : 'text-brand-600 dark:text-brand-300'} />
            <ScanLine className={cx('h-14 w-14', muted ? 'text-ink-400' : 'text-brand-700 dark:text-brand-300')} strokeWidth={1.5} />
        </div>
    );
}

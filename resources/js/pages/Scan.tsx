import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '../contexts/I18nContext';
import { api, ApiError } from '../lib/api';
import type { OrderItem } from '../types';

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
        <div className="max-w-md space-y-4">
            <h1 className="text-xl font-semibold">{t('scan.title')}</h1>

            {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

            {supportsCamera ? (
                <div className="space-y-2">
                    {!cameraActive ? (
                        <button
                            type="button"
                            onClick={() => setCameraActive(true)}
                            className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700"
                        >
                            {t('scan.title')}
                        </button>
                    ) : (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video ref={videoRef} className="w-full rounded-md" muted playsInline aria-label={t('scan.title')} />
                    )}
                </div>
            ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400">{t('scan.unsupported')}</p>
            )}

            <form onSubmit={handleManualSubmit} className="flex gap-2">
                <label htmlFor="manual-code" className="sr-only">
                    {t('scan.manualEntry')}
                </label>
                <input
                    id="manual-code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={t('scan.manualEntry')}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 dark:border-slate-600 dark:bg-slate-900"
                />
                <button type="submit" className="rounded-md bg-slate-700 px-4 py-2 text-white hover:bg-slate-800">
                    {t('common.search')}
                </button>
            </form>
        </div>
    );
}

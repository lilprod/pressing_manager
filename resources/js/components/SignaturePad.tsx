import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { button, cx } from './ui/styles';

interface SignaturePadProps {
    onChange: (blob: Blob | null) => void;
    className?: string;
}

export default function SignaturePad({ onChange, className }: SignaturePadProps) {
    const { t } = useI18n();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawingRef = useRef(false);
    const [isEmpty, setIsEmpty] = useState(true);

    function pointerPos(e: ReactPointerEvent<HTMLCanvasElement>) {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        return {
            x: ((e.clientX - rect.left) / rect.width) * canvas.width,
            y: ((e.clientY - rect.top) / rect.height) * canvas.height,
        };
    }

    function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
        e.preventDefault();
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        drawingRef.current = true;
        const { x, y } = pointerPos(e);
        ctx.beginPath();
        ctx.moveTo(x, y);
    }

    function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
        if (!drawingRef.current) return;
        const ctx = canvasRef.current?.getContext('2d');
        if (!ctx) return;
        const { x, y } = pointerPos(e);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineTo(x, y);
        ctx.stroke();
        setIsEmpty(false);
    }

    function stopDrawing() {
        if (!drawingRef.current) return;
        drawingRef.current = false;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.toBlob((blob) => onChange(blob), 'image/png');
    }

    function clear() {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setIsEmpty(true);
        onChange(null);
    }

    return (
        <div className={cx('space-y-2', className)}>
            <canvas
                ref={canvasRef}
                width={480}
                height={160}
                className="h-40 w-full touch-none rounded-xl border border-ink-400 bg-white dark:border-ink-500"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={stopDrawing}
                onPointerLeave={stopDrawing}
            />
            <div className="flex items-center justify-between">
                {isEmpty && <p className="text-xs text-ink-600 dark:text-ink-350">{t('delivery.signatureRequired')}</p>}
                <button type="button" onClick={clear} className={cx(button('ghost', 'sm'), 'ml-auto')}>
                    <Eraser aria-hidden="true" className="h-4 w-4" />
                    {t('delivery.signatureClear')}
                </button>
            </div>
        </div>
    );
}

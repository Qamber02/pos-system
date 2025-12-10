import { useEffect, useRef } from 'react';

interface UseBarcodeScannerOptions {
    onScan: (barcode: string) => void;
    minLength?: number;
    timeLimit?: number;
}

export const useBarcodeScanner = ({
    onScan,
    minLength = 3,
    timeLimit = 50, // Scanners are fast, 50ms between keystrokes is generous
}: UseBarcodeScannerOptions) => {
    const buffer = useRef<string>('');
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // If the event target is an input or textarea, we might want to ignore it
            // UNLESS it's the barcode scanner acting like a keyboard.
            // However, usually scanners send keys very fast.
            // For now, let's capture everything but be careful about interfering with normal typing.

            // If the user is typing in an input field, we generally don't want to intercept
            // UNLESS we can be sure it's a scanner.
            // But for POS, we often want to scan even if focus is elsewhere, or maybe focus is nowhere.

            // Simple approach:
            // 1. Clear buffer if too much time passed since last keystroke
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }

            timeoutRef.current = window.setTimeout(() => {
                buffer.current = '';
            }, timeLimit);

            // 2. Handle Enter key (end of scan)
            if (event.key === 'Enter') {
                if (buffer.current.length >= minLength) {
                    onScan(buffer.current);
                    buffer.current = '';
                    // Prevent default submission if it was a scan
                    // event.preventDefault(); // Optional: might block normal Enter behavior
                } else {
                    buffer.current = '';
                }
                return;
            }

            // 3. Ignore non-character keys (Shift, Ctrl, etc.)
            if (event.key.length !== 1) return;

            // 4. Append to buffer
            buffer.current += event.key;
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [onScan, minLength, timeLimit]);
};

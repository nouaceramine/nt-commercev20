import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * p149: مسح الباركود بكاميرا الهاتف — زر صغير يفتح نافذة كاميرا (html5-qrcode / ZXing)
 * يدعم EAN-13, EAN-8, Code128, QR... — يعمل عبر HTTPS مع كاميرا الهاتف الخلفية (environment)
 * onDetected(code) يُستدعى مرة واحدة عند قراءة ناجحة ثم تُغلق النافذة
 */
const CameraBarcodeScanner = ({ language, onDetected, testId = 'camera-scan-btn' }) => {
  const isAr = language === 'ar';
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const scannerRef = useRef(null);
  const readerId = useRef(`bc-reader-${Math.random().toString(36).slice(2, 8)}`);

  const stopScanner = async () => {
    try {
      const s = scannerRef.current;
      scannerRef.current = null;
      if (s) {
        if (s.isScanning) await s.stop();
        s.clear();
      }
    } catch { /* camera already released */ }
  };

  useEffect(() => {
    if (!open) { stopScanner(); return undefined; }
    let cancelled = false;
    const start = async () => {
      setStarting(true);
      try {
        const scanner = new Html5Qrcode(readerId.current);
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 260, height: 160 } },
          (decoded) => {
            try { navigator.vibrate?.(80); } catch { /* no haptics */ }
            onDetected(decoded);
            toast.success(isAr ? `تم المسح: ${decoded}` : `Scanné : ${decoded}`);
            setOpen(false);
          },
          () => { /* per-frame miss — normal while aiming */ }
        );
      } catch (e) {
        if (!cancelled) {
          toast.error(isAr
            ? 'تعذر فتح الكاميرا — امنح إذن الكاميرا للمتصفح ثم أعد المحاولة'
            : 'Caméra inaccessible — autorisez la caméra puis réessayez');
          setOpen(false);
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    };
    const t = setTimeout(start, 200); // wait for dialog DOM node
    return () => { cancelled = true; clearTimeout(t); stopScanner(); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-5 px-1 text-xs"
        data-testid={testId}
        title={isAr ? 'مسح الباركود بكاميرا الهاتف' : 'Scanner le code-barres avec la caméra'}
      >
        <Camera className="h-3 w-3" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md" data-testid="camera-scan-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {isAr ? 'وجّه الكاميرا نحو الباركود' : 'Pointez la caméra vers le code-barres'}
            </DialogTitle>
          </DialogHeader>
          <div id={readerId.current} className="w-full min-h-[260px] rounded-lg overflow-hidden bg-black/5" />
          {starting && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              {isAr ? 'جارٍ فتح الكاميرا…' : 'Ouverture de la caméra…'}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CameraBarcodeScanner;

import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { ImagePlus, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../lib/apiClient';

/**
 * زر جلب صور المنتج بالذكاء الاصطناعي:
 * يرسل اسم المنتج إلى /ai/product-images (Gemini يبني عبارة بحث + Openverse يرجع صوراً حقيقية مرخّصة تجارياً)
 * ثم يعرض 5 صور في نافذة — النقر على صورة يضيف رابطها عبر onPick(url)
 */
const AiImagePicker = ({ getName, language, onPick, maxReached }) => {
  const isAr = language === 'ar';
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState([]);
  const [query, setQuery] = useState('');

  const fetchImages = async () => {
    const name = (getName() || '').trim();
    if (!name) {
      toast.error(isAr ? 'أدخل اسم المنتج أولاً' : "Entrez le nom du produit d'abord");
      return;
    }
    setLoading(true);
    try {
      const res = await apiClient.post('/ai/product-images', { name });
      if (res.data.success && res.data.images?.length) {
        setImages(res.data.images);
        setQuery(res.data.query || '');
        setOpen(true);
      } else {
        toast.error(isAr ? 'لم يتم العثور على صور مناسبة' : 'Aucune image trouvée');
      }
    } catch (e) {
      toast.error(isAr ? 'فشل جلب الصور' : 'Échec du chargement des images');
    } finally {
      setLoading(false);
    }
  };

  const pick = (img) => {
    if (maxReached) {
      toast.error(isAr ? 'الحد الأقصى للصور' : 'Nombre maximum d\'images atteint');
      return;
    }
    onPick(img.url);
    setImages(prev => prev.filter(i => i.url !== img.url));
    toast.success(isAr ? 'تمت إضافة الصورة' : 'Image ajoutée');
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={fetchImages}
        disabled={loading}
        className="h-5 px-1 text-xs"
        data-testid="ai-images-btn"
        title={isAr ? 'جلب صور بالذكاء الاصطناعي' : 'Rechercher des images par IA'}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
        {isAr ? 'صور AI' : 'Images IA'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl" data-testid="ai-images-dialog">
          <DialogHeader>
            <DialogTitle className="text-sm">
              {isAr ? 'اختر صورة للمنتج' : 'Choisir une image produit'}
              {query && <span className="block text-xs font-normal text-muted-foreground mt-1" dir="ltr">{query}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-3">
            {images.map((img, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pick(img)}
                className="group relative border rounded-lg overflow-hidden hover:border-primary transition-colors"
                data-testid={`ai-image-option-${i}`}
              >
                <img src={img.thumb} alt={img.title} className="w-full h-32 object-cover" loading="lazy" />
                <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate text-left" dir="ltr">
                  {img.license} · {img.source}
                </div>
              </button>
            ))}
          </div>
          {images.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-4">
              {isAr ? 'تم اختيار جميع الصور' : 'Toutes les images ont été choisies'}
            </p>
          )}
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            {isAr ? 'صور مرخّصة للاستخدام التجاري عبر Openverse' : 'Images sous licence commerciale via Openverse'}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AiImagePicker;

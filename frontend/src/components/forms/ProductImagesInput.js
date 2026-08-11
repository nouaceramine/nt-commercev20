import { useRef } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

/**
 * معرض صور المنتج المشترك — يُستخدم في صفحتي الإضافة والتعديل (لا تكرار)
 * images: مصفوفة الصور الإضافية | onChange: تحديث المصفوفة | max: الحد الأقصى
 */
export default function ProductImagesInput({ images = [], onChange, max = 4, language = 'ar' }) {
  const fileRef = useRef(null);
  const isAr = language === 'ar';
  const list = Array.isArray(images) ? images.filter(Boolean) : [];

  const addFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (list.length >= max) {
      toast.warning(isAr ? `الحد الأقصى ${max} صور إضافية` : `Maximum ${max} images`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      onChange([...list, ev.target.result]);
      toast.success(isAr ? 'تمت إضافة الصورة' : 'Image ajoutée');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-1 mt-2">
      <div className="flex flex-wrap gap-2 items-center">
        {list.map((src, i) => (
          <div key={i} className="relative">
            <img src={src} alt="" className="h-12 w-12 object-cover rounded border" />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, j) => j !== i))}
              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-600 text-white text-[10px] leading-none flex items-center justify-center"
            >×</button>
          </div>
        ))}
        {list.length < max && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="h-12 w-12 border-2 border-dashed rounded flex items-center justify-center text-muted-foreground hover:border-primary transition-colors"
            title={isAr ? 'إضافة صورة' : 'Ajouter une image'}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {isAr ? `صور إضافية: ${list.length}/${max} (المجموع مع الصورة الرئيسية: 5 كحد أقصى)` : `Images: ${list.length}/${max}`}
      </p>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ''; }}
      />
    </div>
  );
}

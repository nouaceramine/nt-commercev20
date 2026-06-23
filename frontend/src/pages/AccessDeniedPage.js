import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../contexts/LanguageContext';
import { ShieldOff, ArrowRight, ArrowLeft } from 'lucide-react';

const AccessDeniedPage = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isRTL = language === 'ar';

  const t = {
    title: language === 'ar' ? 'غير مصرح' : 'Accès refusé',
    subtitle: language === 'ar'
      ? 'هذا القسم غير متاح لصلاحية الكاشير'
      : 'Cette section n\'est pas accessible au rôle caissier',
    description: language === 'ar'
      ? 'تواصل مع مسؤول المتجر إذا كنت بحاجة إلى الوصول إلى هذا القسم.'
      : 'Contactez l\'administrateur du magasin si vous avez besoin d\'y accéder.',
    goBack: language === 'ar' ? 'رجوع' : 'Retour',
    goToPOS: language === 'ar' ? 'الذهاب إلى نقطة البيع' : 'Aller à la caisse',
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-background p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
            <ShieldOff className="w-12 h-12 text-muted-foreground" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">{t.title}</h1>
          <p className="text-muted-foreground text-lg">{t.subtitle}</p>
          <p className="text-sm text-muted-foreground">{t.description}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-border bg-background hover:bg-muted transition-colors text-sm font-medium"
          >
            {isRTL ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
            {t.goBack}
          </button>
          <button
            onClick={() => navigate('/pos')}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            {t.goToPOS}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessDeniedPage;

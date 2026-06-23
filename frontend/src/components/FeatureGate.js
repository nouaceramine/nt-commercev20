import { useFeatureFlag } from '../contexts/FeatureFlagContext';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from './Layout';
import { ShieldOff } from 'lucide-react';

export function FeatureGate({ feature, children, fallback, inline = false }) {
  const isEnabled = useFeatureFlag(feature);

  if (isEnabled) return children;

  if (fallback !== undefined) return fallback;

  if (inline) {
    return null;
  }

  return (
    <Layout>
      <FeatureDisabledInline />
    </Layout>
  );
}

function FeatureDisabledInline() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-8">
      <ShieldOff className="h-16 w-16 text-muted-foreground/40" />
      <div>
        <h2 className="text-xl font-bold text-muted-foreground">
          {isAr ? 'هذه الميزة معطّلة' : 'Fonctionnalité désactivée'}
        </h2>
        <p className="text-sm text-muted-foreground/70 mt-1">
          {isAr
            ? 'تم إيقاف هذه الخدمة من اللوحة الأم. تواصل مع المدير لتفعيلها.'
            : 'Ce module est désactivé depuis la carte mère. Contactez l\'administrateur.'}
        </p>
      </div>
    </div>
  );
}

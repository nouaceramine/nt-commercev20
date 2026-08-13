import { Link } from 'react-router-dom';
import { Layout } from '../../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/accordion';
import {
  BookOpen, ArrowRight, ShoppingBag, MessageCircle, Truck, Sparkles,
  CheckCircle2, AlertCircle, ExternalLink, Link2, Inbox, Zap, Lock, Lightbulb,
} from 'lucide-react';

const QUICK_STEPS = [
  {
    n: 1,
    title: 'فعِّل مركز التجارة الإلكترونية',
    desc: 'اطلب من الإدارة (السوبر-أدمن) تفعيل الميزة لحسابك. سيظهر فوراً قسم "🛍️ التجارة الإلكترونية" في القائمة الجانبية.',
    icon: Lock,
    color: 'border-emerald-300 bg-emerald-50',
  },
  {
    n: 2,
    title: 'أنشئ طلبك الأول يدوياً',
    desc: 'افتح "صندوق الطلبات الموحَّد" واضغط "طلب يدوي". أدخل بيانات الزبون والمنتجات. الطلب سيظهر في القائمة فوراً برقم ECO-XXXXXXXX.',
    icon: ShoppingBag,
    color: 'border-blue-300 bg-blue-50',
    link: '/ecom-hub',
    linkLabel: 'افتح صندوق الطلبات',
  },
  {
    n: 3,
    title: 'اربط قنوات البيع',
    desc: 'افتح "قنوات البيع" واختر القناة (Shopify / Facebook / Instagram / WhatsApp / TikTok / Telegram / Viber). أدخل المفاتيح الخاصة بكل قناة.',
    icon: Link2,
    color: 'border-violet-300 bg-violet-50',
    link: '/ecom-hub/channels',
    linkLabel: 'افتح قنوات البيع',
  },
  {
    n: 4,
    title: 'أدِر دورة حياة الطلب',
    desc: 'استخدم أزرار تغيير الحالة: جديد → مؤكَّد → محضَّر → في الشحن → تم التسليم. الإلغاء والاسترداد متاحان في معظم المراحل.',
    icon: Inbox,
    color: 'border-amber-300 bg-amber-50',
  },
  {
    n: 5,
    title: 'أنشئ بطاقات الشحن',
    desc: 'بعد تأكيد الطلب، أنشئ بطاقة شحن (Yalidine / ZR / Maystro). سيتم توليد رقم تتبع تلقائياً (وضع المحاكاة في P1).',
    icon: Truck,
    color: 'border-cyan-300 bg-cyan-50',
  },
];

const CHANNEL_GUIDES = [
  {
    key: 'shopify',
    icon: '🛍️',
    name: 'Shopify',
    badge: 'الأكثر شيوعاً',
    steps: [
      'سجّل دخولك إلى لوحة تحكم متجرك: https://your-store.myshopify.com/admin',
      'انتقل إلى Settings → Apps and sales channels → Develop apps → Create an app.',
      'أنشئ تطبيقاً خاصاً (Private app) وامنحه الصلاحيات: read_orders, write_orders, read_products, write_inventory.',
      'انسخ الـ Admin API access token من قسم API credentials.',
      'في قنوات البيع NT Commerce: اضغط على بطاقة Shopify، أدخل اسم المتجر (مثل: store.myshopify.com) والـ token، ثم احفظ.',
      '⚠️ في المرحلة P1 الحالية الربط في وضع المحاكاة فقط. الـ Webhooks الحقيقية تأتي في P2.',
    ],
    docLink: 'https://shopify.dev/docs/api/admin-rest',
  },
  {
    key: 'facebook',
    icon: '📘',
    name: 'Facebook',
    steps: [
      'افتح صفحتك على Facebook → Settings → Page roles → تأكد أنك Admin.',
      'انتقل إلى Meta Business Suite: https://business.facebook.com → System Users → أنشئ مستخدم نظام.',
      'امنحه صلاحيات الصفحة + manage_pages + leads_retrieval + pages_messaging.',
      'انسخ Page ID من about → page transparency.',
      'انسخ Page Access Token (دائم).',
      'في قنوات البيع NT Commerce: اختر Facebook وأدخل القيمتين، ثم احفظ.',
    ],
    docLink: 'https://developers.facebook.com/docs/pages/access-tokens',
  },
  {
    key: 'instagram',
    icon: '📸',
    name: 'Instagram',
    steps: [
      'تأكد أن حسابك من نوع Business Account وموصول بصفحة Facebook.',
      'في Meta Business Suite: Instagram Accounts → اربطه بحساب Facebook الإداري.',
      'احصل على Instagram Business Account ID من Graph API Explorer (GET /me/accounts).',
      'استخدم نفس Access Token الخاص بـ Facebook (يجب أن يحتوي على instagram_basic + instagram_manage_messages).',
      'في قنوات البيع NT Commerce: اختر Instagram وأدخل القيمتين.',
    ],
    docLink: 'https://developers.facebook.com/docs/instagram-api',
  },
  {
    key: 'whatsapp',
    icon: '💬',
    name: 'WhatsApp Business',
    steps: [
      'سجّل في WhatsApp Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api',
      'أضف رقم هاتف عمل (Business phone number) في Meta for Developers.',
      'انسخ Phone Number ID من قسم WhatsApp → API setup.',
      'أنشئ Permanent Access Token من System Users (Meta Business Suite).',
      'في قنوات البيع NT Commerce: اختر WhatsApp وأدخل القيمتين.',
      '✅ بعد تفعيل P3: ستصل رسائل الزبائن تلقائياً إلى صندوق الطلبات وتُحوَّل لـ Leads.',
    ],
    docLink: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
  },
  {
    key: 'tiktok',
    icon: '🎵',
    name: 'TikTok Shop',
    steps: [
      'افتح حساب TikTok Seller: https://seller-us.tiktok.com/',
      'انتقل إلى TikTok Shop Developer Portal وسجّل تطبيقاً.',
      'احصل على Shop ID من إعدادات المتجر.',
      'أنشئ Access Token عبر OAuth flow التابع لـ TikTok Marketing API.',
      'في قنوات البيع NT Commerce: اختر TikTok وأدخل القيمتين.',
    ],
    docLink: 'https://partner.tiktokshop.com/docv2',
  },
  {
    key: 'telegram',
    icon: '✈️',
    name: 'Telegram Bot',
    steps: [
      'افتح Telegram وابحث عن @BotFather.',
      'أرسل /newbot واتبع التعليمات (اسم البوت + username).',
      'انسخ Bot Token (يبدأ بأرقام مثل: 123456789:ABCdef...).',
      'في قنوات البيع NT Commerce: اختر Telegram وأدخل الـ token.',
      '💡 ستتمكن من استقبال طلبات Telegram عبر البوت بعد تفعيل P4.',
    ],
    docLink: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
  },
  {
    key: 'viber',
    icon: '🟣',
    name: 'Viber',
    steps: [
      'افتح Viber Bot Admin Panel: https://partners.viber.com/account/create-bot-account.',
      'أنشئ حساب بوت (يتطلب رقم هاتف).',
      'انسخ Authentication Token.',
      'في قنوات البيع NT Commerce: اختر Viber وأدخل الـ token.',
    ],
    docLink: 'https://developers.viber.com/docs/api/rest-bot-api/',
  },
];

const SHIPPING_GUIDES = [
  {
    name: 'Yalidine (يالدين) — الجزائر',
    steps: [
      'سجّل حسابك على https://yalidine.app/',
      'من لوحة التحكم → الإعدادات → API: انسخ API ID + API Token.',
      'احفظ القيم في إعدادات الشحن (تأتي في P2).',
      '✅ سيتم توليد بطاقات الشحن وأرقام التتبع تلقائياً.',
    ],
  },
  {
    name: 'ZR Express — الجزائر',
    steps: [
      'تواصل مع فريق ZR لإنشاء حساب: https://procolis.com/',
      'احصل على API Token من حسابك التجاري.',
      'ستحتاج Token + Client Key في إعدادات الشحن (P2).',
    ],
  },
  {
    name: 'Maystro — الجزائر',
    steps: [
      'سجّل في https://maystro-delivery.com/',
      'احصل على API Key من حسابك.',
      'أضفه في إعدادات الشحن (P2).',
    ],
  },
];

export default function EcomGuidePage() {
  return (
    <Layout>
      <div className="space-y-6 p-4 md:p-6" dir="rtl" data-testid="ecom-guide-page">
        {/* Header */}
        <div>
          <Link to="/ecom-hub" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowRight className="w-3 h-3" /> العودة لصندوق الطلبات
          </Link>
          <h1 className="text-2xl md:text-3xl font-bold mt-1 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-emerald-600" />
            دليل الاستخدام والربط
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            خطوة بخطوة: كيف تبدأ بمركز التجارة الإلكترونية، تربط قنواتك، وتدير طلباتك من كل العالم في صندوق واحد.
          </p>
        </div>

        {/* Quick start steps */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              البداية السريعة — 5 خطوات
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {QUICK_STEPS.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.n} className={`flex items-start gap-3 p-3 rounded-lg border-2 ${s.color}`}>
                  <div className="flex items-center justify-center w-9 h-9 rounded-full bg-white border-2 border-current text-current font-bold flex-shrink-0">
                    {s.n}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <h3 className="font-semibold">{s.title}</h3>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                    {s.link && (
                      <Link to={s.link}>
                        <Button size="sm" variant="outline" className="mt-2" data-testid={`guide-step-link-${s.n}`}>
                          {s.linkLabel}
                          <ArrowRight className="w-3 h-3 mr-1 rotate-180" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Channel-specific guides */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Link2 className="w-4 h-4 text-violet-500" />
              دليل ربط كل قناة بيع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {CHANNEL_GUIDES.map((ch) => (
                <AccordionItem key={ch.key} value={ch.key} data-testid={`guide-channel-${ch.key}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-2xl">{ch.icon}</span>
                      <span className="font-semibold">{ch.name}</span>
                      {ch.badge && <Badge className="bg-emerald-100 text-emerald-800 text-xs">{ch.badge}</Badge>}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <ol className="space-y-2 ps-2">
                      {ch.steps.map((step, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                          <span className="text-muted-foreground">{step}</span>
                        </li>
                      ))}
                    </ol>
                    {ch.docLink && (
                      <a
                        href={ch.docLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-3 text-xs text-blue-600 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        التوثيق الرسمي
                      </a>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </CardContent>
        </Card>

        {/* Shipping guides */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck className="w-4 h-4 text-cyan-500" />
              دليل ربط شركات الشحن
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SHIPPING_GUIDES.map((sh, idx) => (
              <div key={idx} className="border rounded-lg p-3" data-testid={`guide-shipping-${idx}`}>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Truck className="w-4 h-4 text-cyan-600" />
                  {sh.name}
                </h3>
                <ol className="space-y-1 ps-2">
                  {sh.steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-cyan-100 text-cyan-800 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Order workflow diagram */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              دورة حياة الطلب
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {[
                { s: 'جديد', c: 'bg-blue-100 text-blue-800' },
                { s: 'مؤكَّد', c: 'bg-violet-100 text-violet-800' },
                { s: 'محضَّر', c: 'bg-amber-100 text-amber-800' },
                { s: 'في الشحن', c: 'bg-cyan-100 text-cyan-800' },
                { s: 'تم التسليم', c: 'bg-emerald-100 text-emerald-800' },
              ].map((st, i, arr) => (
                <span key={i} className="flex items-center gap-2">
                  <Badge className={`${st.c} border px-3 py-1`}>{st.s}</Badge>
                  {i < arr.length - 1 && <ArrowRight className="w-4 h-4 text-muted-foreground rotate-180" />}
                </span>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">إجراءات بديلة في أي مرحلة:</span>
              <Badge className="bg-gray-100 text-gray-700 border">ملغى</Badge>
              <Badge className="bg-rose-100 text-rose-800 border">مُستردّ</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Tips */}
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <Lightbulb className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm text-amber-900">
              <div className="font-semibold">نصائح مهمة</div>
              <ul className="space-y-1 list-disc ps-4">
                <li>المرحلة الحالية (P1) تعمل بوضع المحاكاة. تستطيع حفظ المفاتيح الآن، والمزامنة الفعلية ستُفعَّل تلقائياً عند انتقالنا لـ P2.</li>
                <li>المفاتيح والـ tokens تُخزَّن مشفَّرة. عند تعديل التكامل، اترك حقول المفاتيح فارغة لتبقى القيم القديمة.</li>
                <li>أنشئ على الأقل تكاملاً واحداً وهمياً لكل قناة الآن، حتى يصبح اختيار التكامل متاحاً عند إنشاء طلب يدوي.</li>
                <li>لا تحذف الطلبات المكتملة. استخدم «ملغى» أو «مُستردّ» بدلاً من ذلك للحفاظ على سجل المبيعات.</li>
                <li>استخدم الفلاتر (القناة + الحالة + البحث) للعثور على أي طلب بسرعة مهما كان حجم صندوقك.</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* CTA Footer */}
        <div className="flex flex-wrap gap-2 justify-center pt-4">
          <Link to="/ecom-hub">
            <Button size="lg" data-testid="guide-cta-inbox">
              <Inbox className="w-4 h-4 ml-2" />
              ابدأ من صندوق الطلبات
            </Button>
          </Link>
          <Link to="/ecom-hub/channels">
            <Button size="lg" variant="outline" data-testid="guide-cta-channels">
              <Link2 className="w-4 h-4 ml-2" />
              اربط قناتك الأولى
            </Button>
          </Link>
        </div>
      </div>
    </Layout>
  );
}

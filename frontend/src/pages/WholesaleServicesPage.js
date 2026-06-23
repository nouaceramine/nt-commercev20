import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import {
  Wallet,
  CreditCard,
  Smartphone,
  Wifi,
  Gift,
  TrendingUp,
  AlertTriangle,
  ShoppingBag,
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function WholesaleServicesPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [stats, setStats] = useState({
    balance: 0,
    debts: 0,
    profits: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch user balance and stats
        const [cashRes] = await Promise.all([
          apiClient.get(`/cash/accounts`)
        ]);
        
        // Calculate total balance from all cash accounts
        const totalBalance = cashRes.data?.reduce((sum, acc) => sum + (acc.balance || 0), 0) || 0;
        
        setStats({
          balance: totalBalance,
          debts: 0, // This would come from a debts endpoint
          profits: 0 // This would come from a profits endpoint
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const services = [
    {
      id: 'flexy',
      name: language === 'ar' ? 'فليكسي' : 'Flexy',
      description: language === 'ar' ? 'شحن رصيد الهاتف' : 'Recharge téléphone',
      icon: Smartphone,
      color: 'bg-red-500 hover:bg-red-600',
      textColor: 'text-white',
      link: '/services/flexy'
    },
    {
      id: 'idoom',
      name: language === 'ar' ? 'تعبئة أيدوم' : 'Recharge Idoom',
      description: language === 'ar' ? 'تعبئة رصيد الإنترنت' : 'Recharge internet',
      icon: Wifi,
      color: 'bg-emerald-500 hover:bg-emerald-600',
      textColor: 'text-white',
      link: '/services/idoom'
    },
    {
      id: 'cards',
      name: language === 'ar' ? 'بطاقات' : 'Cartes',
      description: language === 'ar' ? 'بطاقات التعبئة' : 'Cartes de recharge',
      icon: CreditCard,
      color: 'bg-blue-500 hover:bg-blue-600',
      textColor: 'text-white',
      link: '/services/cards'
    }
  ];

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('ar-DZ', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="wholesale-services-page">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Stats Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Balance Card */}
            <Card className="border-r-4 border-r-primary">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      {language === 'ar' ? 'رصيدي' : 'Mon solde'}
                    </p>
                    <p className="text-2xl font-bold text-primary mt-1">
                      {formatCurrency(stats.balance)} <span className="text-sm font-normal">دج</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Debts Card */}
            <Card className="border-r-4 border-r-red-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      {language === 'ar' ? 'ديوني' : 'Mes dettes'}
                    </p>
                    <p className="text-2xl font-bold text-red-500 mt-1">
                      {formatCurrency(stats.debts)} <span className="text-sm font-normal">دج</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Profits Card */}
            <Card className="border-r-4 border-r-emerald-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      {language === 'ar' ? 'أرباحي' : 'Mes profits'}
                    </p>
                    <p className="text-2xl font-bold text-emerald-500 mt-1">
                      {formatCurrency(stats.profits)} <span className="text-sm font-normal">دج</span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Hero Banner */}
            <Card className="overflow-hidden bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-950/50 dark:to-pink-950/50 border-2 border-purple-200 dark:border-purple-800">
              <CardContent className="p-0">
                <div className="flex flex-col md:flex-row items-center">
                  <div className="p-8 flex-1">
                    <h1 className="text-4xl md:text-5xl font-bold text-purple-800 dark:text-purple-300 mb-2">
                      {language === 'ar' ? 'التسوق' : 'Shopping'}
                    </h1>
                    <h2 className="text-3xl md:text-4xl font-bold text-purple-600 dark:text-purple-400 mb-4">
                      {language === 'ar' ? 'الإلكتروني' : 'En ligne'}
                    </h2>
                    <p className="text-purple-700 dark:text-purple-300 mb-6">
                      {language === 'ar' ? 'إضغط على الصورة للتسوق' : 'Cliquez pour faire vos achats'}
                    </p>
                    <Button className="bg-purple-600 hover:bg-purple-700">
                      <ShoppingBag className="h-4 w-4 me-2" />
                      {language === 'ar' ? 'تسوق الآن' : 'Acheter maintenant'}
                    </Button>
                  </div>
                  <div className="p-8 flex items-center justify-center">
                    <div className="relative">
                      <div className="w-48 h-48 bg-pink-200 dark:bg-pink-900/50 rounded-full flex items-center justify-center">
                        <ShoppingBag className="h-24 w-24 text-pink-500" />
                      </div>
                      <div className="absolute -top-2 -right-2 bg-yellow-400 rounded-full p-2">
                        <Sparkles className="h-6 w-6 text-yellow-800" />
                      </div>
                      <div className="absolute -bottom-2 -left-2 bg-emerald-400 rounded-full p-3">
                        <Gift className="h-6 w-6 text-emerald-800" />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Service Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {services.map((service) => (
                <Link key={service.id} to={service.link}>
                  <Card 
                    className={`${service.color} ${service.textColor} cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl border-0`}
                    data-testid={`service-card-${service.id}`}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-xl font-bold">{service.name}</h3>
                          <p className="text-sm opacity-90 mt-1">{service.description}</p>
                        </div>
                        <service.icon className="h-10 w-10 opacity-80" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link to="/services/flexy">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-4 text-center">
                    <Smartphone className="h-8 w-8 mx-auto text-orange-500 mb-2" />
                    <p className="text-sm font-medium">{language === 'ar' ? 'فليكسي جملة' : 'Flexy en gros'}</p>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/services/cards">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-4 text-center">
                    <CreditCard className="h-8 w-8 mx-auto text-blue-500 mb-2" />
                    <p className="text-sm font-medium">{language === 'ar' ? 'طلبات البطاقات' : 'Commandes cartes'}</p>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/services/operations">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-4 text-center">
                    <TrendingUp className="h-8 w-8 mx-auto text-emerald-500 mb-2" />
                    <p className="text-sm font-medium">{language === 'ar' ? 'كل العمليات' : 'Toutes opérations'}</p>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/services/profits">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-4 text-center">
                    <Wallet className="h-8 w-8 mx-auto text-purple-500 mb-2" />
                    <p className="text-sm font-medium">{language === 'ar' ? 'نسب الأرباح' : 'Taux de profits'}</p>
                  </CardContent>
                </Card>
              </Link>
            </div>

            {/* Additional Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Link to="/services/transfers">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-4 text-center">
                    <ArrowLeft className="h-8 w-8 mx-auto text-indigo-500 mb-2" />
                    <p className="text-sm font-medium">{language === 'ar' ? 'التحويلات' : 'Transferts'}</p>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/services/directory">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-4 text-center">
                    <Gift className="h-8 w-8 mx-auto text-cyan-500 mb-2" />
                    <p className="text-sm font-medium">{language === 'ar' ? 'دليل الهاتف' : 'Annuaire'}</p>
                  </CardContent>
                </Card>
              </Link>
              <Link to="/services/idoom">
                <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                  <CardContent className="p-4 text-center">
                    <Wallet className="h-8 w-8 mx-auto text-teal-500 mb-2" />
                    <p className="text-sm font-medium">{language === 'ar' ? 'الإستهلاك' : 'Consommation'}</p>
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

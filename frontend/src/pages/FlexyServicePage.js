import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  Smartphone,
  Send,
  History,
  ArrowRight,
  Phone,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Algerian operators based on phone prefix
const OPERATORS = {
  '06': { name: 'Mobilis', color: 'bg-green-500', amounts: [100, 200, 500, 1000, 2000, 5000] },
  '07': { name: 'Djezzy', color: 'bg-red-500', amounts: [100, 200, 500, 1000, 2000, 5000] },
  '05': { name: 'Ooredoo', color: 'bg-orange-500', amounts: [100, 200, 500, 1000, 2000, 5000] }
};

export default function FlexyServicePage() {
  const { language } = useLanguage();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [detectedOperator, setDetectedOperator] = useState(null);

  useEffect(() => {
    // Detect operator from phone number
    const prefix = phoneNumber.substring(0, 2);
    if (OPERATORS[prefix]) {
      setDetectedOperator({ prefix, ...OPERATORS[prefix] });
    } else {
      setDetectedOperator(null);
    }
  }, [phoneNumber]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!phoneNumber || phoneNumber.length !== 10) {
      toast.error(language === 'ar' ? 'يرجى إدخال رقم هاتف صحيح (10 أرقام)' : 'Veuillez entrer un numéro valide (10 chiffres)');
      return;
    }

    const finalAmount = customAmount || amount;
    if (!finalAmount || parseFloat(finalAmount) <= 0) {
      toast.error(language === 'ar' ? 'يرجى اختيار أو إدخال مبلغ صحيح' : 'Veuillez choisir ou entrer un montant valide');
      return;
    }

    setLoading(true);
    try {
      // Simulated API call - in production, this would connect to a real flexy service
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast.success(
        language === 'ar' 
          ? `تم شحن ${finalAmount} دج بنجاح للرقم ${phoneNumber}`
          : `${finalAmount} DA rechargé avec succès pour ${phoneNumber}`
      );

      // Add to recent transactions
      setRecentTransactions(prev => [{
        id: Date.now(),
        phone: phoneNumber,
        amount: parseFloat(finalAmount),
        operator: detectedOperator?.name || 'Unknown',
        status: 'success',
        date: new Date().toISOString()
      }, ...prev.slice(0, 9)]);

      // Reset form
      setPhoneNumber('');
      setAmount('');
      setCustomAmount('');
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل في عملية الشحن' : 'Échec de la recharge');
    } finally {
      setLoading(false);
    }
  };

  const quickAmounts = detectedOperator?.amounts || [100, 200, 500, 1000, 2000, 5000];

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="flexy-service-page">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/services">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
                <Smartphone className="h-8 w-8 text-red-500" />
              </div>
              {language === 'ar' ? 'فليكسي' : 'Flexy'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'شحن رصيد الهاتف المحمول' : 'Recharge de crédit mobile'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recharge Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5" />
                  {language === 'ar' ? 'شحن رصيد جديد' : 'Nouvelle recharge'}
                </CardTitle>
                <CardDescription>
                  {language === 'ar' 
                    ? 'أدخل رقم الهاتف والمبلغ المراد شحنه'
                    : 'Entrez le numéro de téléphone et le montant à recharger'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Phone Number */}
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'رقم الهاتف' : 'Numéro de téléphone'}</Label>
                    <div className="relative">
                      <Input
                        type="tel"
                        placeholder="0X XX XX XX XX"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        className="text-lg h-12 font-mono"
                        dir="ltr"
                        data-testid="flexy-phone-input"
                      />
                      {detectedOperator && (
                        <Badge className={`absolute left-3 top-1/2 -translate-y-1/2 ${detectedOperator.color} text-white`}>
                          {detectedOperator.name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {language === 'ar' 
                        ? '06: موبيليس | 07: جيزي | 05: أوريدو'
                        : '06: Mobilis | 07: Djezzy | 05: Ooredoo'}
                    </p>
                  </div>

                  {/* Quick Amount Selection */}
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'اختر المبلغ' : 'Choisir le montant'}</Label>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                      {quickAmounts.map((amt) => (
                        <Button
                          key={amt}
                          type="button"
                          variant={amount === String(amt) ? 'default' : 'outline'}
                          className="h-12"
                          onClick={() => {
                            setAmount(String(amt));
                            setCustomAmount('');
                          }}
                          data-testid={`flexy-amount-${amt}`}
                        >
                          {amt} دج
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Custom Amount */}
                  <div className="space-y-2">
                    <Label>{language === 'ar' ? 'أو أدخل مبلغ مخصص' : 'Ou entrez un montant personnalisé'}</Label>
                    <Input
                      type="number"
                      placeholder={language === 'ar' ? 'المبلغ بالدينار' : 'Montant en DA'}
                      value={customAmount}
                      onChange={(e) => {
                        setCustomAmount(e.target.value);
                        setAmount('');
                      }}
                      className="h-12"
                      min="50"
                      data-testid="flexy-custom-amount"
                    />
                  </div>

                  {/* Submit Button */}
                  <Button 
                    type="submit" 
                    className="w-full h-14 text-lg"
                    disabled={loading}
                    data-testid="flexy-submit-btn"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-5 w-5 me-2 animate-spin" />
                        {language === 'ar' ? 'جاري الشحن...' : 'Recharge en cours...'}
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5 me-2" />
                        {language === 'ar' ? 'شحن الآن' : 'Recharger maintenant'}
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Recent Transactions */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  {language === 'ar' ? 'آخر العمليات' : 'Dernières opérations'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {recentTransactions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Smartphone className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{language === 'ar' ? 'لا توجد عمليات حديثة' : 'Aucune opération récente'}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentTransactions.map((tx) => (
                      <div key={tx.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center gap-3">
                          {tx.status === 'success' ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-500" />
                          )}
                          <div>
                            <p className="font-mono text-sm">{tx.phone}</p>
                            <p className="text-xs text-muted-foreground">{tx.operator}</p>
                          </div>
                        </div>
                        <div className="text-end">
                          <p className="font-bold text-primary">{tx.amount} دج</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(tx.date).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}

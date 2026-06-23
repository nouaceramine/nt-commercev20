import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import {
  TrendingUp,
  ArrowRight,
  Percent,
  Smartphone,
  Wifi,
  CreditCard,
  DollarSign,
  Info
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function ProfitRatesPage() {
  const { language } = useLanguage();

  // Sample profit rates data
  const profitRates = {
    flexy: [
      { operator: 'Mobilis', minAmount: 100, maxAmount: 500, rate: 5, profit: '5 دج لكل 100 دج' },
      { operator: 'Mobilis', minAmount: 501, maxAmount: 2000, rate: 4.5, profit: '4.5 دج لكل 100 دج' },
      { operator: 'Mobilis', minAmount: 2001, maxAmount: 10000, rate: 4, profit: '4 دج لكل 100 دج' },
      { operator: 'Djezzy', minAmount: 100, maxAmount: 500, rate: 5, profit: '5 دج لكل 100 دج' },
      { operator: 'Djezzy', minAmount: 501, maxAmount: 2000, rate: 4.5, profit: '4.5 دج لكل 100 دج' },
      { operator: 'Djezzy', minAmount: 2001, maxAmount: 10000, rate: 4, profit: '4 دج لكل 100 دج' },
      { operator: 'Ooredoo', minAmount: 100, maxAmount: 500, rate: 5, profit: '5 دج لكل 100 دج' },
      { operator: 'Ooredoo', minAmount: 501, maxAmount: 2000, rate: 4.5, profit: '4.5 دج لكل 100 دج' },
      { operator: 'Ooredoo', minAmount: 2001, maxAmount: 10000, rate: 4, profit: '4 دج لكل 100 دج' },
    ],
    idoom: [
      { type: '4G LTE', amount: 500, rate: 5, profit: '25 دج' },
      { type: '4G LTE', amount: 1000, rate: 5, profit: '50 دج' },
      { type: '4G LTE', amount: 1500, rate: 5, profit: '75 دج' },
      { type: '4G LTE', amount: 2000, rate: 5, profit: '100 دج' },
      { type: '4G LTE', amount: 2500, rate: 5, profit: '125 دج' },
      { type: 'ADSL', amount: 500, rate: 4, profit: '20 دج' },
      { type: 'ADSL', amount: 1000, rate: 4, profit: '40 دج' },
      { type: 'ADSL', amount: 2000, rate: 4, profit: '80 دج' },
    ],
    cards: [
      { operator: 'Mobilis', faceValue: 100, buyPrice: 95, profit: '5 دج' },
      { operator: 'Mobilis', faceValue: 200, buyPrice: 190, profit: '10 دج' },
      { operator: 'Mobilis', faceValue: 500, buyPrice: 475, profit: '25 دج' },
      { operator: 'Mobilis', faceValue: 1000, buyPrice: 950, profit: '50 دج' },
      { operator: 'Djezzy', faceValue: 100, buyPrice: 95, profit: '5 دج' },
      { operator: 'Djezzy', faceValue: 200, buyPrice: 190, profit: '10 دج' },
      { operator: 'Djezzy', faceValue: 500, buyPrice: 475, profit: '25 دج' },
      { operator: 'Djezzy', faceValue: 1000, buyPrice: 950, profit: '50 دج' },
      { operator: 'Ooredoo', faceValue: 100, buyPrice: 95, profit: '5 دج' },
      { operator: 'Ooredoo', faceValue: 200, buyPrice: 190, profit: '10 دج' },
      { operator: 'Ooredoo', faceValue: 500, buyPrice: 475, profit: '25 دج' },
      { operator: 'Ooredoo', faceValue: 1000, buyPrice: 950, profit: '50 دج' },
    ]
  };

  const getOperatorColor = (operator) => {
    switch (operator) {
      case 'Mobilis': return 'bg-green-500';
      case 'Djezzy': return 'bg-red-500';
      case 'Ooredoo': return 'bg-orange-500';
      default: return 'bg-blue-500';
    }
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="profit-rates-page">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/services">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
                <Percent className="h-8 w-8 text-amber-500" />
              </div>
              {language === 'ar' ? 'نسب الأرباح' : 'Taux de profits'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'نسب الربح لكل خدمة ومشغل' : 'Taux de profit par service et opérateur'}
            </p>
          </div>
        </div>

        {/* Info Banner */}
        <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
          <CardContent className="p-4 flex items-center gap-3">
            <Info className="h-5 w-5 text-amber-600" />
            <p className="text-sm text-amber-700 dark:text-amber-400">
              {language === 'ar' 
                ? 'الأرباح تُحسب تلقائياً وتُضاف إلى رصيدك فور نجاح كل عملية'
                : 'Les profits sont calculés automatiquement et ajoutés à votre solde après chaque opération réussie'}
            </p>
          </CardContent>
        </Card>

        {/* Flexy Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-red-500" />
              {language === 'ar' ? 'فليكسي' : 'Flexy'}
            </CardTitle>
            <CardDescription>
              {language === 'ar' ? 'نسب الربح على شحن رصيد الهاتف' : 'Taux de profit sur les recharges mobiles'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'المشغل' : 'Opérateur'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المبلغ (من)' : 'Montant (de)'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المبلغ (إلى)' : 'Montant (à)'}</TableHead>
                  <TableHead>{language === 'ar' ? 'النسبة' : 'Taux'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الربح' : 'Profit'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitRates.flexy.map((rate, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge className={getOperatorColor(rate.operator)}>{rate.operator}</Badge>
                    </TableCell>
                    <TableCell>{rate.minAmount} دج</TableCell>
                    <TableCell>{rate.maxAmount} دج</TableCell>
                    <TableCell className="font-bold text-emerald-600">{rate.rate}%</TableCell>
                    <TableCell className="text-emerald-600">{rate.profit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Idoom Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-emerald-500" />
              {language === 'ar' ? 'تعبئة أيدوم' : 'Recharge Idoom'}
            </CardTitle>
            <CardDescription>
              {language === 'ar' ? 'نسب الربح على تعبئة الإنترنت' : 'Taux de profit sur les recharges internet'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'النوع' : 'Type'}</TableHead>
                  <TableHead>{language === 'ar' ? 'المبلغ' : 'Montant'}</TableHead>
                  <TableHead>{language === 'ar' ? 'النسبة' : 'Taux'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الربح' : 'Profit'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitRates.idoom.map((rate, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge variant="outline">{rate.type}</Badge>
                    </TableCell>
                    <TableCell>{rate.amount} دج</TableCell>
                    <TableCell className="font-bold text-emerald-600">{rate.rate}%</TableCell>
                    <TableCell className="text-emerald-600">{rate.profit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Cards Rates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-500" />
              {language === 'ar' ? 'بطاقات التعبئة' : 'Cartes de recharge'}
            </CardTitle>
            <CardDescription>
              {language === 'ar' ? 'الفرق بين سعر الشراء وسعر البيع' : 'Différence entre prix d\'achat et prix de vente'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{language === 'ar' ? 'المشغل' : 'Opérateur'}</TableHead>
                  <TableHead>{language === 'ar' ? 'القيمة الاسمية' : 'Valeur faciale'}</TableHead>
                  <TableHead>{language === 'ar' ? 'سعر الشراء' : 'Prix d\'achat'}</TableHead>
                  <TableHead>{language === 'ar' ? 'الربح' : 'Profit'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profitRates.cards.map((rate, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Badge className={getOperatorColor(rate.operator)}>{rate.operator}</Badge>
                    </TableCell>
                    <TableCell>{rate.faceValue} دج</TableCell>
                    <TableCell>{rate.buyPrice} دج</TableCell>
                    <TableCell className="font-bold text-emerald-600">{rate.profit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

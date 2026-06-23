import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { toast } from 'sonner';
import {
  CreditCard,
  Plus,
  ShoppingCart,
  History,
  ArrowRight,
  Package,
  Search,
  Eye,
  Copy,
  CheckCircle2,
  Clock,
  XCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

// Sample card types
const CARD_TYPES = [
  { id: 'mobilis_100', name: 'موبيليس 100 دج', operator: 'Mobilis', price: 95, sellPrice: 100, color: 'bg-green-500' },
  { id: 'mobilis_200', name: 'موبيليس 200 دج', operator: 'Mobilis', price: 190, sellPrice: 200, color: 'bg-green-500' },
  { id: 'mobilis_500', name: 'موبيليس 500 دج', operator: 'Mobilis', price: 475, sellPrice: 500, color: 'bg-green-500' },
  { id: 'mobilis_1000', name: 'موبيليس 1000 دج', operator: 'Mobilis', price: 950, sellPrice: 1000, color: 'bg-green-500' },
  { id: 'djezzy_100', name: 'جيزي 100 دج', operator: 'Djezzy', price: 95, sellPrice: 100, color: 'bg-red-500' },
  { id: 'djezzy_200', name: 'جيزي 200 دج', operator: 'Djezzy', price: 190, sellPrice: 200, color: 'bg-red-500' },
  { id: 'djezzy_500', name: 'جيزي 500 دج', operator: 'Djezzy', price: 475, sellPrice: 500, color: 'bg-red-500' },
  { id: 'djezzy_1000', name: 'جيزي 1000 دج', operator: 'Djezzy', price: 950, sellPrice: 1000, color: 'bg-red-500' },
  { id: 'ooredoo_100', name: 'أوريدو 100 دج', operator: 'Ooredoo', price: 95, sellPrice: 100, color: 'bg-orange-500' },
  { id: 'ooredoo_200', name: 'أوريدو 200 دج', operator: 'Ooredoo', price: 190, sellPrice: 200, color: 'bg-orange-500' },
  { id: 'ooredoo_500', name: 'أوريدو 500 دج', operator: 'Ooredoo', price: 475, sellPrice: 500, color: 'bg-orange-500' },
  { id: 'ooredoo_1000', name: 'أوريدو 1000 دج', operator: 'Ooredoo', price: 950, sellPrice: 1000, color: 'bg-orange-500' },
];

export default function CardsServicePage() {
  const { language } = useLanguage();
  const [activeTab, setActiveTab] = useState('buy');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCards, setSelectedCards] = useState({});
  const [orders, setOrders] = useState([]);
  const [myCards, setMyCards] = useState([]);
  const [loading, setLoading] = useState(false);

  const filteredCards = CARD_TYPES.filter(card => 
    card.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    card.operator.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleQuantityChange = (cardId, quantity) => {
    if (quantity < 0) return;
    setSelectedCards(prev => ({
      ...prev,
      [cardId]: quantity
    }));
  };

  const getTotalPrice = () => {
    return Object.entries(selectedCards).reduce((total, [cardId, qty]) => {
      const card = CARD_TYPES.find(c => c.id === cardId);
      return total + (card ? card.price * qty : 0);
    }, 0);
  };

  const getTotalCards = () => {
    return Object.values(selectedCards).reduce((a, b) => a + b, 0);
  };

  const handleOrder = async () => {
    if (getTotalCards() === 0) {
      toast.error(language === 'ar' ? 'يرجى اختيار بطاقات' : 'Veuillez sélectionner des cartes');
      return;
    }

    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const newOrder = {
        id: Date.now(),
        items: Object.entries(selectedCards)
          .filter(([_, qty]) => qty > 0)
          .map(([cardId, qty]) => {
            const card = CARD_TYPES.find(c => c.id === cardId);
            return { ...card, quantity: qty };
          }),
        total: getTotalPrice(),
        status: 'pending',
        date: new Date().toISOString()
      };

      setOrders(prev => [newOrder, ...prev]);
      setSelectedCards({});
      toast.success(language === 'ar' ? 'تم إرسال الطلب بنجاح' : 'Commande envoyée avec succès');
    } catch (error) {
      toast.error(language === 'ar' ? 'فشل في إرسال الطلب' : 'Échec de la commande');
    } finally {
      setLoading(false);
    }
  };

  const copyCardCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success(language === 'ar' ? 'تم نسخ الكود' : 'Code copié');
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in" data-testid="cards-service-page">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link to="/services">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <CreditCard className="h-8 w-8 text-blue-500" />
              </div>
              {language === 'ar' ? 'بطاقات التعبئة' : 'Cartes de recharge'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' ? 'شراء وإدارة بطاقات التعبئة' : 'Acheter et gérer les cartes de recharge'}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="buy" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              {language === 'ar' ? 'شراء' : 'Acheter'}
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-2">
              <Package className="h-4 w-4" />
              {language === 'ar' ? 'طلباتي' : 'Mes commandes'}
            </TabsTrigger>
            <TabsTrigger value="cards" className="gap-2">
              <CreditCard className="h-4 w-4" />
              {language === 'ar' ? 'بطاقاتي' : 'Mes cartes'}
            </TabsTrigger>
          </TabsList>

          {/* Buy Cards Tab */}
          <TabsContent value="buy" className="space-y-6 mt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={language === 'ar' ? 'بحث عن بطاقة...' : 'Rechercher une carte...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pe-10"
                  />
                </div>
              </div>
              <Card className="p-4 flex items-center gap-4 bg-primary/5">
                <div>
                  <p className="text-sm text-muted-foreground">{language === 'ar' ? 'الإجمالي' : 'Total'}</p>
                  <p className="text-2xl font-bold text-primary">{getTotalPrice().toFixed(2)} دج</p>
                </div>
                <Button 
                  onClick={handleOrder} 
                  disabled={loading || getTotalCards() === 0}
                  className="h-12"
                >
                  {loading ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 me-2" />
                      {language === 'ar' ? `طلب (${getTotalCards()})` : `Commander (${getTotalCards()})`}
                    </>
                  )}
                </Button>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {['Mobilis', 'Djezzy', 'Ooredoo'].map(operator => (
                <Card key={operator}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2">
                      <Badge className={
                        operator === 'Mobilis' ? 'bg-green-500' :
                        operator === 'Djezzy' ? 'bg-red-500' : 'bg-orange-500'
                      }>
                        {operator}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {filteredCards.filter(c => c.operator === operator).map(card => (
                      <div key={card.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                        <div>
                          <p className="font-medium text-sm">{card.sellPrice} دج</p>
                          <p className="text-xs text-muted-foreground">{language === 'ar' ? 'سعر الشراء' : 'Prix'}: {card.price} دج</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleQuantityChange(card.id, (selectedCards[card.id] || 0) - 1)}
                          >
                            -
                          </Button>
                          <span className="w-8 text-center font-bold">{selectedCards[card.id] || 0}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleQuantityChange(card.id, (selectedCards[card.id] || 0) + 1)}
                          >
                            +
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Orders Tab */}
          <TabsContent value="orders" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'طلباتي' : 'Mes commandes'}</CardTitle>
              </CardHeader>
              <CardContent>
                {orders.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{language === 'ar' ? 'لا توجد طلبات' : 'Aucune commande'}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {orders.map(order => (
                      <Card key={order.id} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={order.status === 'completed' ? 'default' : 'secondary'}>
                              {order.status === 'completed' ? (
                                <><CheckCircle2 className="h-3 w-3 me-1" />{language === 'ar' ? 'مكتمل' : 'Terminé'}</>
                              ) : (
                                <><Clock className="h-3 w-3 me-1" />{language === 'ar' ? 'قيد المعالجة' : 'En cours'}</>
                              )}
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                              {new Date(order.date).toLocaleString()}
                            </span>
                          </div>
                          <span className="font-bold text-primary">{order.total} دج</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {order.items.map((item, idx) => (
                            <Badge key={idx} variant="outline">
                              {item.name} × {item.quantity}
                            </Badge>
                          ))}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* My Cards Tab */}
          <TabsContent value="cards" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>{language === 'ar' ? 'بطاقاتي المتاحة' : 'Mes cartes disponibles'}</CardTitle>
                <CardDescription>
                  {language === 'ar' ? 'البطاقات الجاهزة للاستخدام' : 'Cartes prêtes à utiliser'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {myCards.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>{language === 'ar' ? 'لا توجد بطاقات متاحة' : 'Aucune carte disponible'}</p>
                    <p className="text-sm">{language === 'ar' ? 'قم بشراء بطاقات من تبويب "شراء"' : 'Achetez des cartes depuis l\'onglet "Acheter"'}</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{language === 'ar' ? 'البطاقة' : 'Carte'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الكود' : 'Code'}</TableHead>
                        <TableHead>{language === 'ar' ? 'الحالة' : 'Statut'}</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {myCards.map(card => (
                        <TableRow key={card.id}>
                          <TableCell>{card.name}</TableCell>
                          <TableCell className="font-mono">{card.code}</TableCell>
                          <TableCell>
                            <Badge variant={card.used ? 'secondary' : 'default'}>
                              {card.used ? (language === 'ar' ? 'مستخدم' : 'Utilisé') : (language === 'ar' ? 'متاح' : 'Disponible')}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => copyCardCode(card.code)}>
                              <Copy className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

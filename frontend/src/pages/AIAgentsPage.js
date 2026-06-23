import { useState, useEffect } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Progress } from '../components/ui/progress';
import { Switch } from '../components/ui/switch';
import {
  Bot,
  Brain,
  FileText,
  Tags,
  TrendingUp,
  Shield,
  FileBarChart,
  Calculator,
  LineChart,
  Clock,
  Play,
  Pause,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Settings,
  ChevronRight
} from 'lucide-react';

export default function AIAgentsPage() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [runningAgent, setRunningAgent] = useState(null);
  const [results, setResults] = useState({});

  const agentInfo = {
    invoice_processor: {
      icon: FileText,
      name: language === 'ar' ? 'معالج الفواتير' : 'Processeur de Factures',
      description: language === 'ar' 
        ? 'يستخرج بيانات الفواتير تلقائياً وينشئ قيود محاسبية'
        : 'Extrait automatiquement les données des factures et crée des écritures comptables',
      color: 'bg-blue-500'
    },
    expense_classifier: {
      icon: Tags,
      name: language === 'ar' ? 'مصنف المصروفات' : 'Classificateur de Dépenses',
      description: language === 'ar'
        ? 'يصنف المصروفات تلقائياً بناءً على الأنماط السابقة'
        : 'Classifie automatiquement les dépenses selon les modèles précédents',
      color: 'bg-green-500'
    },
    financial_analyzer: {
      icon: TrendingUp,
      name: language === 'ar' ? 'المحلل المالي' : 'Analyseur Financier',
      description: language === 'ar'
        ? 'يحلل الإيرادات والأرباح ويكتشف الاتجاهات'
        : 'Analyse les revenus et les bénéfices et détecte les tendances',
      color: 'bg-purple-500'
    },
    fraud_detector: {
      icon: Shield,
      name: language === 'ar' ? 'كاشف الاحتيال' : 'Détecteur de Fraude',
      description: language === 'ar'
        ? 'يكتشف المعاملات المشبوهة والفواتير المكررة'
        : 'Détecte les transactions suspectes et les factures en double',
      color: 'bg-red-500'
    },
    smart_reporter: {
      icon: FileBarChart,
      name: language === 'ar' ? 'مولد التقارير' : 'Générateur de Rapports',
      description: language === 'ar'
        ? 'ينشئ تقارير الأرباح والخسائر والميزانية تلقائياً'
        : 'Génère automatiquement des rapports de profits et pertes et de bilan',
      color: 'bg-orange-500'
    },
    tax_assistant: {
      icon: Calculator,
      name: language === 'ar' ? 'مساعد الضرائب' : 'Assistant Fiscal',
      description: language === 'ar'
        ? 'يحسب الالتزامات الضريبية ويحدد الأخطاء'
        : 'Calcule les obligations fiscales et identifie les erreurs',
      color: 'bg-yellow-500'
    },
    forecaster: {
      icon: LineChart,
      name: language === 'ar' ? 'المتنبئ' : 'Prévisionniste',
      description: language === 'ar'
        ? 'يتنبأ بالإيرادات والتدفق النقدي المستقبلي'
        : 'Prédit les revenus et les flux de trésorerie futurs',
      color: 'bg-cyan-500'
    },
    daily_automation: {
      icon: Clock,
      name: language === 'ar' ? 'الأتمتة اليومية' : 'Automatisation Quotidienne',
      description: language === 'ar'
        ? 'يحلل النشاط اليومي ويولد ملخصات وتنبيهات'
        : 'Analyse l\'activité quotidienne et génère des résumés et des alertes',
      color: 'bg-indigo-500'
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAgents = async () => {
    try {
      const res = await apiClient.get(`/ai/agents/status`);
      setAgents(res.data || []);
    } catch (error) {
      console.error('Error fetching agents:', error);
      // Set default agents if API fails
      setAgents(Object.keys(agentInfo).map(id => ({
        id,
        is_enabled: true,
        last_run: null,
        last_success: null
      })));
    } finally {
      setLoading(false);
    }
  };

  const runAgent = async (agentType, taskData = {}) => {
    setRunningAgent(agentType);
    try {
      const res = await apiClient.post(`/ai/agents/run`, {
        agent_type: agentType,
        task_data: taskData
      });
      
      setResults(prev => ({
        ...prev,
        [agentType]: res.data
      }));
      
      // Refresh agents status
      fetchAgents();
    } catch (error) {
      console.error('Error running agent:', error);
      setResults(prev => ({
        ...prev,
        [agentType]: { success: false, error: error.message }
      }));
    } finally {
      setRunningAgent(null);
    }
  };

  const getTaskDataForAgent = (agentType) => {
    const today = new Date().toISOString().split('T')[0];
    const monthStart = today.slice(0, 7) + '-01';
    
    switch (agentType) {
      case 'financial_analyzer':
        return { period_start: monthStart, period_end: today };
      case 'fraud_detector':
        return { days: 7 };
      case 'smart_reporter':
        return { report_type: 'profit_loss', start: monthStart, end: today };
      case 'tax_assistant':
        return { period: today.slice(0, 4) };
      case 'forecaster':
        return { forecast_type: 'revenue', periods: 3 };
      default:
        return {};
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="spinner mx-auto mb-4" />
            <p className="text-muted-foreground">
              {language === 'ar' ? 'جاري تحميل الوكلاء...' : 'Chargement des agents...'}
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="ai-agents-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="h-8 w-8 text-primary" />
              {language === 'ar' ? 'وكلاء المحاسبة الذكية' : 'Agents Comptables Intelligents'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {language === 'ar' 
                ? '8 وكلاء ذكاء اصطناعي لأتمتة المهام المحاسبية'
                : '8 agents IA pour automatiser les tâches comptables'}
            </p>
          </div>
          <Button onClick={fetchAgents} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            {language === 'ar' ? 'تحديث الحالة' : 'Actualiser'}
          </Button>
        </div>

        {/* Agents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {agents.map((agent) => {
            const info = agentInfo[agent.id] || {};
            const Icon = info.icon || Bot;
            const isRunning = runningAgent === agent.id;
            const result = results[agent.id];
            
            return (
              <Card 
                key={agent.id} 
                className="relative overflow-hidden hover:shadow-lg transition-all"
                data-testid={`agent-card-${agent.id}`}
              >
                <div className={`absolute top-0 left-0 right-0 h-1 ${info.color || 'bg-gray-500'}`} />
                
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className={`p-2 rounded-lg ${info.color || 'bg-gray-500'} bg-opacity-10`}>
                      <Icon className={`h-6 w-6 ${info.color?.replace('bg-', 'text-') || 'text-gray-500'}`} />
                    </div>
                    <Badge variant={agent.is_enabled ? 'default' : 'secondary'}>
                      {agent.is_enabled 
                        ? (language === 'ar' ? 'مفعل' : 'Actif')
                        : (language === 'ar' ? 'معطل' : 'Inactif')}
                    </Badge>
                  </div>
                  <CardTitle className="text-lg mt-2">{info.name || agent.id}</CardTitle>
                  <CardDescription className="text-sm">{info.description}</CardDescription>
                </CardHeader>
                
                <CardContent>
                  {/* Last Run Info */}
                  {agent.last_run && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                      <Clock className="h-3 w-3" />
                      <span>
                        {language === 'ar' ? 'آخر تشغيل: ' : 'Dernière exécution: '}
                        {new Date(agent.last_run).toLocaleString(language === 'ar' ? 'ar' : 'fr')}
                      </span>
                      {agent.last_success !== null && (
                        agent.last_success 
                          ? <CheckCircle className="h-3 w-3 text-emerald-500" />
                          : <XCircle className="h-3 w-3 text-red-500" />
                      )}
                    </div>
                  )}
                  
                  {/* Result */}
                  {result && (
                    <div className={`p-2 rounded-lg mb-3 text-xs ${
                      result.success 
                        ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    }`}>
                      {result.success 
                        ? (language === 'ar' ? '✓ تم التنفيذ بنجاح' : '✓ Exécuté avec succès')
                        : `✗ ${result.error || (language === 'ar' ? 'فشل التنفيذ' : 'Échec de l\'exécution')}`}
                      {result.execution_time_ms && (
                        <span className="block mt-1 opacity-75">
                          {language === 'ar' ? `الوقت: ${result.execution_time_ms}ms` : `Temps: ${result.execution_time_ms}ms`}
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Run Button */}
                  <Button
                    onClick={() => runAgent(agent.id, getTaskDataForAgent(agent.id))}
                    disabled={isRunning || !agent.is_enabled}
                    className="w-full"
                    variant={isRunning ? 'secondary' : 'default'}
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        {language === 'ar' ? 'جاري التشغيل...' : 'En cours...'}
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2" />
                        {language === 'ar' ? 'تشغيل' : 'Exécuter'}
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {language === 'ar' ? 'إجراءات سريعة' : 'Actions Rapides'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => runAgent('daily_automation')}
                disabled={runningAgent === 'daily_automation'}
              >
                <Clock className="h-6 w-6 text-indigo-500" />
                <span>{language === 'ar' ? 'تشغيل التحليل اليومي' : 'Exécuter l\'analyse quotidienne'}</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => runAgent('fraud_detector', { days: 30 })}
                disabled={runningAgent === 'fraud_detector'}
              >
                <Shield className="h-6 w-6 text-red-500" />
                <span>{language === 'ar' ? 'فحص الاحتيال' : 'Scan de fraude'}</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => runAgent('smart_reporter', { 
                  report_type: 'profit_loss',
                  start: new Date().toISOString().slice(0, 7) + '-01',
                  end: new Date().toISOString().split('T')[0]
                })}
                disabled={runningAgent === 'smart_reporter'}
              >
                <FileBarChart className="h-6 w-6 text-orange-500" />
                <span>{language === 'ar' ? 'تقرير الأرباح والخسائر' : 'Rapport P&L'}</span>
              </Button>
              
              <Button
                variant="outline"
                className="h-auto py-4 flex-col gap-2"
                onClick={() => runAgent('forecaster', { forecast_type: 'revenue', periods: 6 })}
                disabled={runningAgent === 'forecaster'}
              >
                <LineChart className="h-6 w-6 text-cyan-500" />
                <span>{language === 'ar' ? 'تنبؤ الإيرادات' : 'Prévision des revenus'}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import { Layout } from '../components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { ScrollArea } from '../components/ui/scroll-area';
import {
  MessageCircle,
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  History,
  Plus,
  Trash2,
  ChevronRight,
  HelpCircle,
  TrendingUp,
  DollarSign,
  Users,
  Package
} from 'lucide-react';

export default function AIChatPage() {
  const { t, isRTL, language } = useLanguage();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Suggested questions
  const suggestedQuestions = language === 'ar' ? [
    { icon: TrendingUp, text: 'ما هي أرباح هذا الشهر؟', category: 'profit' },
    { icon: DollarSign, text: 'كم مبيعات اليوم؟', category: 'sales' },
    { icon: Users, text: 'من هم أفضل 5 عملاء؟', category: 'customers' },
    { icon: Package, text: 'ما هي المنتجات الأكثر مبيعاً؟', category: 'products' },
    { icon: HelpCircle, text: 'ما هي الفواتير المتأخرة؟', category: 'invoices' },
    { icon: TrendingUp, text: 'كيف حال التدفق النقدي؟', category: 'cashflow' }
  ] : [
    { icon: TrendingUp, text: 'Quels sont les bénéfices ce mois-ci?', category: 'profit' },
    { icon: DollarSign, text: 'Combien de ventes aujourd\'hui?', category: 'sales' },
    { icon: Users, text: 'Qui sont les 5 meilleurs clients?', category: 'customers' },
    { icon: Package, text: 'Quels sont les produits les plus vendus?', category: 'products' },
    { icon: HelpCircle, text: 'Quelles sont les factures en retard?', category: 'invoices' },
    { icon: TrendingUp, text: 'Comment va la trésorerie?', category: 'cashflow' }
  ];

  // Fetch chat sessions
  const fetchSessions = useCallback(async () => {
    try {
      const res = await apiClient.get(`/ai/chat/sessions`);
      setSessions(res.data || []);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load session messages
  const loadSession = async (id) => {
    try {
      const res = await apiClient.get(`/ai/chat/sessions/${id}`);
      setSessionId(id);
      setMessages(res.data?.messages || []);
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  // Start new chat
  const startNewChat = () => {
    setSessionId(null);
    setMessages([]);
    inputRef.current?.focus();
  };

  // Send message
  const sendMessage = async (text = input) => {
    if (!text.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const res = await apiClient.post(`/ai/chat`, {
        message: text,
        session_id: sessionId || ""
      });

      if (res.data) {
        setSessionId(res.data.session_id);
        
        const assistantMessage = {
          role: 'assistant',
          content: res.data.response,
          timestamp: new Date().toISOString(),
          data: res.data.data,
          suggestions: res.data.suggestions
        };

        setMessages(prev => [...prev, assistantMessage]);
        fetchSessions(); // Refresh sessions list
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage = {
        role: 'assistant',
        content: language === 'ar' 
          ? 'عذراً، حدث خطأ. يرجى المحاولة مرة أخرى.'
          : 'Désolé, une erreur s\'est produite. Veuillez réessayer.',
        timestamp: new Date().toISOString(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString(language === 'ar' ? 'ar' : 'fr', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Layout>
      <div className="flex h-[calc(100vh-120px)] gap-4" data-testid="ai-chat-page">
        {/* Sidebar - Sessions */}
        {showSidebar && (
          <Card className="w-80 flex-shrink-0 hidden md:flex flex-col">
            <CardHeader className="p-4 border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="h-5 w-5" />
                  {language === 'ar' ? 'المحادثات' : 'Conversations'}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={startNewChat} data-testid="new-chat-btn">
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <ScrollArea className="flex-1">
              <div className="p-2 space-y-1">
                {sessions.map((session) => (
                  <Button
                    key={session.id}
                    variant={sessionId === session.id ? 'secondary' : 'ghost'}
                    className="w-full justify-start text-sm"
                    onClick={() => loadSession(session.id)}
                  >
                    <MessageCircle className="h-4 w-4 mr-2" />
                    <span className="truncate">
                      {session.title || (language === 'ar' ? 'محادثة جديدة' : 'Nouvelle conversation')}
                    </span>
                  </Button>
                ))}
                {sessions.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-8">
                    {language === 'ar' ? 'لا توجد محادثات سابقة' : 'Pas de conversations précédentes'}
                  </p>
                )}
              </div>
            </ScrollArea>
          </Card>
        )}

        {/* Main Chat Area */}
        <Card className="flex-1 flex flex-col">
          {/* Chat Header */}
          <CardHeader className="p-4 border-b">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-full">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">
                  {language === 'ar' ? 'المحاسب الذكي' : 'Comptable Intelligent'}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {language === 'ar' ? 'مدعوم بـ GPT-4o' : 'Propulsé par GPT-4o'}
                </p>
              </div>
              <Badge variant="secondary" className="ml-auto">
                <Sparkles className="h-3 w-3 mr-1" />
                AI
              </Badge>
            </div>
          </CardHeader>

          {/* Messages Area */}
          <ScrollArea className="flex-1 p-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="p-4 bg-primary/10 rounded-full mb-4">
                  <Bot className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {language === 'ar' ? 'مرحباً! أنا محاسبك الذكي' : 'Bonjour! Je suis votre comptable intelligent'}
                </h3>
                <p className="text-muted-foreground mb-6 max-w-md">
                  {language === 'ar' 
                    ? 'اسألني عن أي شيء يتعلق بحساباتك: الأرباح، المبيعات، العملاء، الفواتير، وأكثر!'
                    : 'Demandez-moi tout ce qui concerne vos comptes: bénéfices, ventes, clients, factures, et plus!'}
                </p>
                
                {/* Suggested Questions */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                  {suggestedQuestions.map((q, index) => (
                    <Button
                      key={`msg-user-${msg.id || index}`}
                      variant="outline"
                      className="justify-start text-sm h-auto py-3 px-4"
                      onClick={() => sendMessage(q.text)}
                      data-testid={`suggested-q-${index}`}
                    >
                      <q.icon className="h-4 w-4 mr-2 text-primary" />
                      <span className="text-right">{q.text}</span>
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message, index) => (
                  <div
                    key={`msg-${message.id || message.role}-${index}`}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-4 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : message.isError
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200'
                          : 'bg-muted'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        {message.role === 'assistant' && (
                          <Bot className="h-5 w-5 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <p className="whitespace-pre-wrap">{message.content}</p>
                          
                          {/* Suggestions */}
                          {message.suggestions?.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-border/50">
                              <p className="text-xs mb-2 opacity-70">
                                {language === 'ar' ? 'أسئلة مقترحة:' : 'Questions suggérées:'}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {message.suggestions.map((suggestion, i) => (
                                  <Button
                                    key={`suggest-${suggestion.slice(0,10)}-${i}`}
                                    variant="ghost"
                                    size="sm"
                                    className="h-auto py-1 px-2 text-xs"
                                    onClick={() => sendMessage(suggestion)}
                                  >
                                    <ChevronRight className="h-3 w-3 mr-1" />
                                    {suggestion}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <p className="text-xs mt-2 opacity-50">
                            {formatTime(message.timestamp)}
                          </p>
                        </div>
                        {message.role === 'user' && (
                          <User className="h-5 w-5 mt-0.5 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {loading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <Bot className="h-5 w-5" />
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">
                          {language === 'ar' ? 'جاري التفكير...' : 'Réflexion en cours...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t">
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={language === 'ar' ? 'اكتب سؤالك هنا...' : 'Tapez votre question ici...'}
                disabled={loading}
                className="flex-1"
                data-testid="chat-input"
              />
              <Button 
                onClick={() => sendMessage()} 
                disabled={!input.trim() || loading}
                data-testid="send-message-btn"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {language === 'ar' 
                ? 'المحاسب الذكي يستخدم AI لتحليل بياناتك المالية'
                : 'Le comptable intelligent utilise l\'IA pour analyser vos données financières'}
            </p>
          </div>
        </Card>
      </div>
    </Layout>
  );
}

import { useState, useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';
import { useLanguage } from '../contexts/LanguageContext';
import { formatTime as globalFormatTime } from '../utils/globalDateFormatter';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ScrollArea } from './ui/scroll-area';
import { toast } from 'sonner';
import {
  Bot,
  Send,
  Trash2,
  Loader2,
  User,
  Sparkles,
  Terminal,
  HelpCircle,
  RefreshCw
} from 'lucide-react';

const QUICK_COMMANDS = [
  { cmd: '/status', label: 'حالة النظام', icon: '🖥️' },
  { cmd: '/stats', label: 'الإحصائيات', icon: '📊' },
  { cmd: '/errors', label: 'الأخطاء', icon: '⚠️' },
  { cmd: '/help', label: 'المساعدة', icon: '❓' },
];

export function AIAssistant() {
  const { language } = useLanguage();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    // Generate session ID
    const sid = `admin-${Date.now()}`;
    setSessionId(sid);
    
    // Add welcome message
    setMessages([{
      type: 'ai',
      content: `مرحباً! أنا المساعد الذكي لنظام NT Commerce. 🤖

يمكنني مساعدتك في:
• تشخيص وإصلاح المشاكل
• عرض إحصائيات النظام
• تنفيذ مهام الصيانة
• الإجابة على استفساراتك

استخدم الأوامر السريعة أدناه أو اكتب سؤالك مباشرة!`,
      timestamp: new Date()
    }]);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async (text = input) => {
    if (!text.trim()) return;
    
    const userMessage = {
      type: 'user',
      content: text,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    
    try {
      const response = await apiClient.post(`/ai-assistant/chat`, {
        message: text,
        session_id: sessionId
      }, { headers });
      
      const aiMessage = {
        type: 'ai',
        content: response.data.response,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      if (response.data.session_id) {
        setSessionId(response.data.session_id);
      }
    } catch (error) {
      console.error('AI Assistant error:', error);
      const errorMessage = {
        type: 'ai',
        content: 'عذراً، حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      type: 'ai',
      content: 'تم مسح المحادثة. كيف يمكنني مساعدتك؟',
      timestamp: new Date()
    }]);
    toast.success('تم مسح المحادثة');
  };

  const formatTime = (date) => {
    return globalFormatTime(date);
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <span>{language === 'ar' ? 'المساعد الذكي' : 'Assistant IA'}</span>
              <p className="text-xs text-muted-foreground font-normal">GPT-5.2 Powered</p>
            </div>
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={clearChat} title="مسح المحادثة">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-3 ${msg.type === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  msg.type === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white'
                }`}>
                  {msg.type === 'user' ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                </div>
                <div className={`flex-1 max-w-[80%] ${msg.type === 'user' ? 'text-left' : ''}`}>
                  <div className={`rounded-2xl px-4 py-3 ${
                    msg.type === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : msg.isError
                        ? 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-200 rounded-tl-sm'
                        : 'bg-muted rounded-tl-sm'
                  }`}>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>
                  </div>
                  <p className={`text-xs text-muted-foreground mt-1 ${msg.type === 'user' ? 'text-left' : ''}`}>
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))}
            
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 text-white animate-spin" />
                </div>
                <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
        
        {/* Quick Commands */}
        <div className="px-4 py-2 border-t bg-muted/30">
          <div className="flex gap-2 flex-wrap">
            {QUICK_COMMANDS.map((cmd) => (
              <Button
                key={cmd.cmd}
                variant="outline"
                size="sm"
                className="text-xs gap-1"
                onClick={() => sendMessage(cmd.cmd)}
                disabled={loading}
              >
                <span>{cmd.icon}</span>
                {cmd.label}
              </Button>
            ))}
          </div>
        </div>
        
        {/* Input Area */}
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={language === 'ar' ? 'اكتب رسالتك أو أمر...' : 'Écrivez votre message...'}
              disabled={loading}
              className="flex-1"
            />
            <Button onClick={() => sendMessage()} disabled={loading || !input.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default AIAssistant;

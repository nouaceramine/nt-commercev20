/**
 * EcomCopilotChat — AI conversational analytics assistant.
 * Embedded inside /ecom-hub/analytics. Uses Emergent LLM via /api/ecom/analytics/copilot.
 */
import { useState, useRef, useEffect } from 'react';
import apiClient from '../../lib/apiClient';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Button } from '../../components/ui/button';
import { Sparkles, Send, Loader2, Bot, User as UserIcon } from 'lucide-react';

const QUICK_PROMPTS = [
  'ما هي أفضل قناة بيع لديّ هذا الشهر؟',
  'لماذا انخفضت مبيعاتي مؤخراً؟',
  'كيف أزيد التحويل من Facebook؟',
  'ما هي المنتجات التي يجب تخفيض سعرها؟',
];

export function EcomCopilotChat({ days = 30 }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'مرحباً! أنا مساعد التحليلات الذكي. اسألني عن أداء متجرك بأي لغة أو سؤال — مثل: «أفضل منتج بِعته هذا الشهر؟»',
    },
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const ask = async (question) => {
    const q = (question || input).trim();
    if (!q || sending) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setSending(true);
    try {
      const res = await apiClient.post('/ecom/analytics/copilot', {
        question: q,
        session_id: sessionId,
        days,
      });
      if (res.data?.session_id) setSessionId(res.data.session_id);
      setMessages((m) => [...m, {
        role: 'assistant',
        text: res.data?.answer || 'لا توجد إجابة.',
        source: res.data?.source,
      }]);
    } catch (err) {
      setMessages((m) => [...m, {
        role: 'assistant',
        text: 'تعذّر الوصول للخدمة مؤقتاً. حاول مجدداً بعد قليل.',
        source: 'error',
      }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Card className="border-violet-200 bg-gradient-to-br from-violet-50/50 to-white" data-testid="ecom-copilot-chat">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-violet-600" />
          مساعد التحليلات الذكي
          <span className="text-xs font-normal text-muted-foreground">— اسأل بأي صيغة</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Messages */}
        <div className="space-y-3 max-h-80 overflow-y-auto pe-2" data-testid="copilot-messages">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                m.role === 'user' ? 'bg-blue-100 text-blue-700' : 'bg-violet-100 text-violet-700'
              }`}>
                {m.role === 'user' ? <UserIcon className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>
              <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tl-none'
                  : 'bg-white border border-violet-200 rounded-tr-none'
              }`}>
                {m.text}
                {m.source && m.source !== 'llm' && (
                  <div className="mt-1 text-[10px] opacity-70">
                    {m.source === 'heuristic' ? 'إجابة حسابية' : m.source === 'error' ? 'خطأ' : m.source}
                  </div>
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex gap-2 items-center text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              يفكّر...
            </div>
          )}
          <div ref={endRef} />
        </div>

        {/* Quick prompts (only show when there's just the welcome message) */}
        {messages.length === 1 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((p, i) => (
              <button
                key={i}
                onClick={() => ask(p)}
                className="text-xs px-2 py-1 rounded-full bg-violet-100 text-violet-800 hover:bg-violet-200 transition-colors"
                data-testid={`copilot-quick-prompt-${i}`}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="mt-3 flex items-center gap-2">
          <Input
            placeholder="اكتب سؤالك بالعربي..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            disabled={sending}
            data-testid="copilot-input"
            dir="rtl"
          />
          <Button onClick={() => ask()} disabled={sending || !input.trim()} data-testid="copilot-send-btn">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

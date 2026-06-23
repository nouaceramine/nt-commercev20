import { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { MessageCircle, Plus, Send, Users } from 'lucide-react';

export default function InternalChatPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [rooms, setRooms] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchRooms = async () => {
    try {
      const res = await apiClient.get(`/chat/rooms`, { headers });
      setRooms(res.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const fetchMessages = async (roomId) => {
    try {
      const res = await apiClient.get(`/chat/rooms/${roomId}/messages`, { headers });
      setMessages(res.data.reverse());
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchRooms(); }, []);
  useEffect(() => { if (activeRoom) fetchMessages(activeRoom.id); }, [activeRoom]);

  const createRoom = async () => {
    try {
      const res = await apiClient.post(`/chat/rooms`, { name_ar: roomName || (isAr ? 'غرفة جديدة' : 'Nouvelle salle') }, { headers });
      toast.success(isAr ? 'تم إنشاء الغرفة' : 'Salle créée');
      setShowCreate(false);
      setRoomName('');
      fetchRooms();
      setActiveRoom(res.data);
    } catch (e) { toast.error('Error'); }
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !activeRoom) return;
    try {
      await apiClient.post(`/chat/rooms/${activeRoom.id}/messages`, { content: newMsg }, { headers });
      setNewMsg('');
      fetchMessages(activeRoom.id);
    } catch (e) { toast.error('Error'); }
  };

  return (
    <Layout>
      <div className="p-4 md:p-6 h-[calc(100vh-80px)]" data-testid="internal-chat-page">
        <div className="flex flex-col md:flex-row gap-4 h-full">
          {/* Rooms Sidebar */}
          <div className="w-full md:w-72 flex-shrink-0 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">{isAr ? 'الغرف' : 'Salles'}</h2>
              <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1" data-testid="create-room-btn"><Plus className="w-3 h-3" />{isAr ? 'جديد' : 'Nouveau'}</Button>
            </div>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto">
              {loading ? <p className="text-gray-400 text-center py-4">{isAr ? 'جاري التحميل...' : 'Chargement...'}</p> :
               rooms.length === 0 ? <p className="text-gray-400 text-center py-4">{isAr ? 'لا توجد غرف' : 'Aucune salle'}</p> :
               rooms.map(room => (
                <Card key={room.id} className={`cursor-pointer transition-colors ${activeRoom?.id === room.id ? 'bg-blue-600/20 border-blue-500/50' : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'}`} onClick={() => setActiveRoom(room)} data-testid={`room-${room.id}`}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2"><MessageCircle className="w-4 h-4 text-blue-400" /><span className="text-white text-sm font-medium">{room.name_ar}</span></div>
                      {room.unread > 0 && <Badge className="bg-blue-500 text-white text-xs">{room.unread}</Badge>}
                    </div>
                    {room.last_message && <p className="text-xs text-gray-400 mt-1 line-clamp-1">{room.last_message.content}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col bg-gray-800/30 rounded-lg border border-gray-700 overflow-hidden">
            {activeRoom ? (
              <>
                <div className="p-4 border-b border-gray-700 flex items-center gap-3">
                  <MessageCircle className="w-5 h-5 text-blue-400" />
                  <h3 className="text-white font-medium">{activeRoom.name_ar}</h3>
                  <Badge className="bg-gray-700 text-gray-300 text-xs"><Users className="w-3 h-3 mr-1 inline" />{activeRoom.members?.length || 1}</Badge>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                  {messages.length === 0 ? <p className="text-gray-500 text-center py-8">{isAr ? 'لا توجد رسائل بعد' : 'Aucun message'}</p> :
                   messages.map(m => (
                    <div key={m.id} className="flex flex-col" data-testid={`msg-${m.id}`}>
                      <div className="flex items-center gap-2"><span className="text-xs font-medium text-blue-400">{m.user_name}</span><span className="text-xs text-gray-600">{new Date(m.created_at).toLocaleTimeString()}</span></div>
                      <div className="bg-gray-700/50 rounded-lg px-3 py-2 mt-1 max-w-[80%]"><p className="text-sm text-white">{m.content}</p></div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-3 border-t border-gray-700 flex gap-2">
                  <Input placeholder={isAr ? 'اكتب رسالة...' : 'Écrire un message...'} value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} className="bg-gray-800 border-gray-700 text-white" data-testid="chat-input" />
                  <Button onClick={sendMessage} size="sm" data-testid="send-msg-btn"><Send className="w-4 h-4" /></Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center"><p className="text-gray-500">{isAr ? 'اختر غرفة للمحادثة' : 'Sélectionner une salle'}</p></div>
            )}
          </div>
        </div>

        {/* Create Room Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
            <DialogHeader><DialogTitle>{isAr ? 'غرفة جديدة' : 'Nouvelle salle'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder={isAr ? 'اسم الغرفة' : 'Nom de la salle'} value={roomName} onChange={e => setRoomName(e.target.value)} className="bg-gray-800 border-gray-700" data-testid="room-name-input" />
              <Button onClick={createRoom} className="w-full" data-testid="submit-room-btn">{isAr ? 'إنشاء' : 'Créer'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

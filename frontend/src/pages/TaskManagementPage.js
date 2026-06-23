import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { toast } from 'sonner';
import apiClient from '../lib/apiClient';
import { CheckSquare, Plus, Clock, AlertCircle, CheckCircle2, ListTodo, MessageSquare } from 'lucide-react';

export default function TaskManagementPage() {
  const { language } = useLanguage();
  const isAr = language === 'ar';
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [form, setForm] = useState({ title_ar: '', description_ar: '', priority: 'medium', task_type: 'general' });

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchData = async () => {
    try {
      const params = {};
      if (filterStatus !== 'all') params.status = filterStatus;
      if (filterPriority !== 'all') params.priority = filterPriority;
      const [tRes, sRes] = await Promise.all([
        apiClient.get(`/tasks`, { headers, params }),
        apiClient.get(`/tasks/stats/summary`, { headers }),
      ]);
      setTasks(tRes.data);
      setStats(sRes.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [filterStatus, filterPriority]);

  const createTask = async () => {
    try {
      await apiClient.post(`/tasks`, form, { headers });
      toast.success(isAr ? 'تم إنشاء المهمة' : 'Tâche créée');
      setShowCreate(false);
      setForm({ title_ar: '', description_ar: '', priority: 'medium', task_type: 'general' });
      fetchData();
    } catch (e) { toast.error('Error'); }
  };

  const updateTaskStatus = async (id, status) => {
    try {
      await apiClient.put(`/tasks/${id}`, { status }, { headers });
      toast.success(isAr ? 'تم التحديث' : 'Mis à jour');
      fetchData();
      if (showDetail?.id === id) openDetail({ ...showDetail, status });
    } catch (e) { toast.error('Error'); }
  };

  const openDetail = async (task) => {
    try {
      const res = await apiClient.get(`/tasks/${task.id}`, { headers });
      setShowDetail(res.data);
      setComments(res.data.comments || []);
    } catch (e) { setShowDetail(task); setComments([]); }
  };

  const addComment = async () => {
    if (!newComment.trim() || !showDetail) return;
    try {
      await apiClient.post(`/tasks/${showDetail.id}/comments`, { content: newComment }, { headers });
      setNewComment('');
      openDetail(showDetail);
    } catch (e) { toast.error('Error'); }
  };

  const priorityColor = (p) => ({ high: 'bg-red-500/10 text-red-400 border-red-500/30', medium: 'bg-amber-500/10 text-amber-400 border-amber-500/30', low: 'bg-blue-500/10 text-blue-400 border-blue-500/30' }[p] || 'bg-gray-500/10 text-gray-400');
  const statusIcon = (s) => ({ pending: Clock, in_progress: AlertCircle, completed: CheckCircle2 }[s] || ListTodo);
  const statusColor = (s) => ({ pending: 'text-amber-400', in_progress: 'text-blue-400', completed: 'text-emerald-400' }[s] || 'text-gray-400');

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6" data-testid="task-management-page">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h1 className="text-2xl font-bold text-white">{isAr ? 'إدارة المهام' : 'Gestion des Tâches'}</h1>
          <Button onClick={() => setShowCreate(true)} className="gap-2" data-testid="create-task-btn"><Plus className="w-4 h-4" />{isAr ? 'مهمة جديدة' : 'Nouvelle tâche'}</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: isAr ? 'الإجمالي' : 'Total', value: stats.total || 0, icon: ListTodo, color: 'text-blue-400' },
            { label: isAr ? 'معلقة' : 'En attente', value: stats.pending || 0, icon: Clock, color: 'text-amber-400' },
            { label: isAr ? 'قيد التنفيذ' : 'En cours', value: stats.in_progress || 0, icon: AlertCircle, color: 'text-blue-400' },
            { label: isAr ? 'مكتملة' : 'Terminées', value: stats.completed || 0, icon: CheckCircle2, color: 'text-emerald-400' },
          ].map((s, i) => (
            <Card key={`item-${i}`} className="bg-gray-800/50 border-gray-700"><CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`w-8 h-8 ${s.color}`} />
              <div><p className="text-xs text-gray-400">{s.label}</p><p className="text-xl font-bold text-white">{s.value}</p></div>
            </CardContent></Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}><SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{isAr ? 'الكل' : 'Tous'}</SelectItem><SelectItem value="pending">{isAr ? 'معلقة' : 'En attente'}</SelectItem><SelectItem value="in_progress">{isAr ? 'قيد التنفيذ' : 'En cours'}</SelectItem><SelectItem value="completed">{isAr ? 'مكتملة' : 'Terminées'}</SelectItem></SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}><SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{isAr ? 'الكل' : 'Toutes'}</SelectItem><SelectItem value="high">{isAr ? 'عالية' : 'Haute'}</SelectItem><SelectItem value="medium">{isAr ? 'متوسطة' : 'Moyenne'}</SelectItem><SelectItem value="low">{isAr ? 'منخفضة' : 'Basse'}</SelectItem></SelectContent>
          </Select>
        </div>

        {/* Tasks List */}
        <div className="space-y-3">
          {loading ? <p className="text-gray-400 text-center py-8">{isAr ? 'جاري التحميل...' : 'Chargement...'}</p> :
           tasks.length === 0 ? <p className="text-gray-400 text-center py-8">{isAr ? 'لا توجد مهام' : 'Aucune tâche'}</p> :
           tasks.map(task => {
             const SIcon = statusIcon(task.status);
             return (
              <Card key={task.id} className="bg-gray-800/50 border-gray-700 hover:border-gray-600 transition-colors cursor-pointer" onClick={() => openDetail(task)} data-testid={`task-${task.id}`}>
                <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                  <div className="flex items-start gap-3">
                    <SIcon className={`w-5 h-5 mt-0.5 ${statusColor(task.status)}`} />
                    <div>
                      <div className="flex items-center gap-2"><span className="text-xs font-mono text-gray-500">{task.task_number}</span><Badge className={priorityColor(task.priority)}>{task.priority}</Badge></div>
                      <h3 className="text-white font-medium">{task.title_ar}</h3>
                      {task.description_ar && <p className="text-sm text-gray-400 line-clamp-1">{task.description_ar}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {task.status !== 'completed' && (
                      <Button size="sm" variant="outline" className="text-xs border-gray-600" onClick={e => { e.stopPropagation(); updateTaskStatus(task.id, task.status === 'pending' ? 'in_progress' : 'completed'); }} data-testid={`task-action-${task.id}`}>
                        {task.status === 'pending' ? (isAr ? 'بدء' : 'Démarrer') : (isAr ? 'إكمال' : 'Terminer')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
             );
           })}
        </div>

        {/* Create Task Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-md">
            <DialogHeader><DialogTitle>{isAr ? 'مهمة جديدة' : 'Nouvelle tâche'}</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Input placeholder={isAr ? 'عنوان المهمة' : 'Titre'} value={form.title_ar} onChange={e => setForm({...form, title_ar: e.target.value})} className="bg-gray-800 border-gray-700" data-testid="task-title-input" />
              <Input placeholder={isAr ? 'الوصف' : 'Description'} value={form.description_ar} onChange={e => setForm({...form, description_ar: e.target.value})} className="bg-gray-800 border-gray-700" />
              <Select value={form.priority} onValueChange={v => setForm({...form, priority: v})}><SelectTrigger className="bg-gray-800 border-gray-700"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="high">{isAr ? 'عالية' : 'Haute'}</SelectItem><SelectItem value="medium">{isAr ? 'متوسطة' : 'Moyenne'}</SelectItem><SelectItem value="low">{isAr ? 'منخفضة' : 'Basse'}</SelectItem></SelectContent>
              </Select>
              <Button onClick={createTask} className="w-full" data-testid="submit-task-btn">{isAr ? 'إنشاء' : 'Créer'}</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Task Detail Dialog */}
        <Dialog open={!!showDetail} onOpenChange={() => setShowDetail(null)}>
          <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-lg">
            {showDetail && (
              <>
                <DialogHeader><DialogTitle className="flex items-center gap-2"><span className="text-xs font-mono text-gray-500">{showDetail.task_number}</span>{showDetail.title_ar}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="flex gap-2"><Badge className={priorityColor(showDetail.priority)}>{showDetail.priority}</Badge><Badge className={`${statusColor(showDetail.status)} bg-opacity-10`}>{showDetail.status}</Badge></div>
                  {showDetail.description_ar && <p className="text-gray-300">{showDetail.description_ar}</p>}
                  <p className="text-xs text-gray-500">{isAr ? 'أنشئت بواسطة' : 'Créé par'}: {showDetail.created_by} | {new Date(showDetail.created_at).toLocaleString()}</p>
                  {/* Comments */}
                  <div className="border-t border-gray-700 pt-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2"><MessageSquare className="w-4 h-4" />{isAr ? 'التعليقات' : 'Commentaires'} ({comments.length})</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {comments.map(c => (
                        <div key={c.id} className="bg-gray-800 rounded p-2"><p className="text-xs text-gray-400">{c.user_name} - {new Date(c.created_at).toLocaleString()}</p><p className="text-sm text-white">{c.content}</p></div>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Input placeholder={isAr ? 'أضف تعليق...' : 'Ajouter un commentaire...'} value={newComment} onChange={e => setNewComment(e.target.value)} className="bg-gray-800 border-gray-700 flex-1" onKeyDown={e => e.key === 'Enter' && addComment()} data-testid="comment-input" />
                      <Button size="sm" onClick={addComment} data-testid="submit-comment-btn">{isAr ? 'إرسال' : 'Envoyer'}</Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

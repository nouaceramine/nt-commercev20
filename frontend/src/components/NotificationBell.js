import { useState, useEffect, useRef } from 'react';
import apiClient from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { formatShortDate } from '../utils/globalDateFormatter';

export function NotificationBell() {
  const { isSuperAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (isSuperAdmin) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [isSuperAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getHeaders = () => ({
    Authorization: `Bearer ${localStorage.getItem('token')}`,
  });

  const fetchUnreadCount = async () => {
    if (isSuperAdmin) return;
    try {
      const res = await apiClient.get(`/notifications/unread-count`, { headers: getHeaders() });
      setUnreadCount(res.data.count);
    } catch (err) {
      // silent
    }
  };

  const fetchNotifications = async () => {
    if (isSuperAdmin) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/notifications/?limit=20`, { headers: getHeaders() });
      setNotifications(res.data);
    } catch (err) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const togglePanel = () => {
    if (!open) fetchNotifications();
    setOpen(!open);
  };

  const markRead = async (id) => {
    try {
      await apiClient.put(`/notifications/${id}/read`, {}, { headers: getHeaders() });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {}
  };

  const markAllRead = async () => {
    try {
      await apiClient.put(`/notifications/read-all`, {}, { headers: getHeaders() });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {}
  };

  const deleteNotif = async (id) => {
    try {
      await apiClient.delete(`/notifications/${id}`, { headers: getHeaders() });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {}
  };

  const typeColors = {
    info: 'bg-blue-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    success: 'bg-green-500',
  };

  return (
    <div className="relative" ref={ref} data-testid="notification-bell">
      <button
        onClick={togglePanel}
        className="relative p-2 rounded-lg hover:bg-muted transition-colors"
        data-testid="notification-bell-btn"
      >
        <Bell className="h-5 w-5 text-muted-foreground" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 bg-background border rounded-xl shadow-xl z-50 overflow-hidden" data-testid="notification-panel">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <span className="font-semibold text-sm">الإشعارات</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7 px-2" data-testid="mark-all-read">
                  <CheckCheck className="h-3.5 w-3.5 ml-1" /> قراءة الكل
                </Button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">جاري التحميل...</div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">لا توجد إشعارات</p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b last:border-0 hover:bg-muted/30 transition-colors ${!n.is_read ? 'bg-primary/5' : ''}`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${typeColors[n.type] || 'bg-gray-400'}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{n.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-xs text-muted-foreground mt-1">{formatShortDate(n.created_at)}</p>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      {!n.is_read && (
                        <button onClick={() => markRead(n.id)} className="p-1 rounded hover:bg-muted" title="تعليم كمقروء">
                          <Check className="h-3.5 w-3.5 text-blue-500" />
                        </button>
                      )}
                      <button onClick={() => deleteNotif(n.id)} className="p-1 rounded hover:bg-muted" title="حذف">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

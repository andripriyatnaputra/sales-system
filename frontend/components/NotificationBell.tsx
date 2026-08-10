"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  apiGetNotifications,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  NotificationItem,
  WorkQueueItem,
} from "@/lib/api";

// NotificationBell: SATU-SATUNYA polling di frontend sepanjang sesi ini
// (Fase 4 Langkah 4) -- refresh ringan tiap 60 detik, WAJIB clearInterval
// di cleanup supaya tidak leak antar navigasi. Badge cuma dari bagian
// "Notifikasi" (event-driven approval_pending, punya status baca/belum),
// BUKAN dari "Reminder" (computed, sama seperti My Work/Document Expiry
// yang sudah ada) -- supaya tidak duplikat/berisik.
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [reminders, setReminders] = useState<WorkQueueItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    try {
      const data = await apiGetNotifications();
      setNotifications(data.notifications || []);
      setReminders(data.reminders || []);
      setUnreadCount(data.unread_count || 0);
    } catch {
      // silent -- notifikasi bersifat pelengkap, jangan ganggu UI utama kalau gagal
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const handleNotificationClick = async (n: NotificationItem) => {
    if (!n.is_read) {
      await apiMarkNotificationRead(n.id);
      load();
    }
    setOpen(false);
  };

  const handleMarkAllRead = async () => {
    await apiMarkAllNotificationsRead();
    load();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="relative p-2 rounded-md hover:bg-gray-100 text-gray-600"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifikasi"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-rose-600 text-white text-[10px] font-semibold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white border rounded-lg shadow-lg z-50 max-h-[70vh] overflow-auto">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-sm font-semibold">Notifikasi</span>
            {unreadCount > 0 && (
              <button className="text-xs text-blue-600 hover:underline" onClick={handleMarkAllRead}>
                Tandai semua dibaca
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Tidak ada notifikasi.</div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <Link
                  key={n.id}
                  href={n.link}
                  onClick={() => handleNotificationClick(n)}
                  className={`block px-3 py-2 text-sm hover:bg-gray-50 ${!n.is_read ? "bg-blue-50/50" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />}
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 truncate">{n.title}</div>
                      {n.detail && <div className="text-xs text-muted-foreground">{n.detail}</div>}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}

          <div className="px-3 py-2 border-t border-b bg-gray-50">
            <span className="text-xs font-semibold text-gray-500">Reminder</span>
          </div>
          {reminders.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Tidak ada reminder.</div>
          ) : (
            <div className="divide-y">
              {reminders.slice(0, 10).map((r) => (
                <Link
                  key={`${r.entity_type}-${r.entity_id}`}
                  href={r.link}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-sm hover:bg-gray-50"
                >
                  <div className="font-medium text-gray-900 truncate">{r.title}</div>
                  {r.detail && <div className="text-xs text-muted-foreground">{r.detail}</div>}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

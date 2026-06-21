import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { connectSocket } from "../services/socket.js";
import Icon from "./Icon.jsx";
import {
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  notificationReceived
} from "../store/notificationSlice.js";

const ICON_NAME = { sos: "sos", ride: "ride", payment: "payment", support: "support", system: "system", promo: "promo" };
const timeAgo = (d) => {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function NotificationBell() {
  const dispatch = useDispatch();
  const authenticated = useSelector((s) => s.auth.authenticated);
  const { items, unread } = useSelector((s) => s.notifications);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Initial load + live updates over the socket.
  useEffect(() => {
    if (!authenticated) return undefined;
    dispatch(fetchNotifications());
    const socket = connectSocket();
    const onNew = (n) => dispatch(notificationReceived(n));
    socket.on("notification:new", onNew);
    return () => socket.off("notification:new", onNew);
  }, [authenticated, dispatch]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const onItemClick = (n) => { if (!n.readAt) dispatch(markNotificationRead(n._id)); };

  return (
    <div className="notif" ref={ref}>
      <button className="notif-trigger" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {open && (
        <div className="notif-menu">
          <div className="notif-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="link-button" onClick={() => dispatch(markAllNotificationsRead())}>Mark all read</button>
            )}
          </div>
          <div className="notif-list">
            {items.length === 0 && <p className="muted-text notif-empty">You're all caught up.</p>}
            {items.map((n) => (
              <button
                key={n._id}
                className={`notif-item ${n.readAt ? "" : "unread"}`}
                onClick={() => onItemClick(n)}
              >
                <span className="notif-icon" aria-hidden><Icon name={ICON_NAME[n.type] || "system"} size={18} /></span>
                <span className="notif-body">
                  <strong>{n.title}</strong>
                  <small>{n.message}</small>
                  <small className="muted-text">{timeAgo(n.createdAt)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

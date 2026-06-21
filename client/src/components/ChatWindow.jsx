import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { connectSocket } from "../services/socket.js";
import { fetchMessages, sendMessage, messageReceived, resetChat } from "../store/chatSlice.js";

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}
function fmtTime(d) {
  return new Date(d).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export default function ChatWindow({ tripId }) {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const { messages, status, error } = useSelector((s) => s.chat);
  const [draft, setDraft] = useState("");
  const endRef = useRef(null);
  const myId = user?.id || user?._id;

  useEffect(() => {
    dispatch(fetchMessages(tripId));
    const socket = connectSocket();
    socket.emit("chat:join", { tripId });
    const onMessage = (payload) => {
      if (payload.tripId === String(tripId)) dispatch(messageReceived(payload.message));
    };
    socket.on("chat:message", onMessage);
    return () => {
      socket.off("chat:message", onMessage);
      dispatch(resetChat());
    };
  }, [dispatch, tripId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submit = (e) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    dispatch(sendMessage({ tripId, body }));
  };

  return (
    <section className="panel chat-panel">
      <p className="eyebrow">Trip chat</p>

      <div className="chat-log">
        {status === "loading" && <small className="muted-text">Loading messages…</small>}
        {error && <div className="alert error">{error}</div>}
        {status === "succeeded" && messages.length === 0 && (
          <small className="muted-text">No messages yet. Say hello 👋</small>
        )}
        {messages.map((m) => {
          const mine = (m.sender?._id || m.sender) === myId;
          return (
            <div key={m._id} className={`chat-msg ${mine ? "mine" : ""}`}>
              {!mine && (
                <span className="avatar sm" aria-hidden>
                  {initials(m.sender?.name)}
                </span>
              )}
              <div className="chat-bubble">
                {!mine && <strong className="chat-author">{m.sender?.name || "Member"}</strong>}
                <span className="chat-body">{m.body}</span>
                <small className="chat-time">{fmtTime(m.createdAt)}</small>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form className="chat-input" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message participants…"
          maxLength={2000}
        />
        <button className="primary" type="submit" disabled={!draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

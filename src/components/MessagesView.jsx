// Messages — organizer inbox for Open Play Messaging (Player <-> Session
// Organizer). No Realtime here — see the migration's own header comment
// for why (Pro has no Supabase Auth, so an anon SELECT policy strong
// enough for Realtime would leak across sessions). Instead: fetch on
// open, lightweight polling while this view is mounted, and an immediate
// refresh right after sending a reply. ONE poll timer total, centralized
// in the conversation-LIST effect (depends only on session identity, not
// which thread is open) — switching threads never spins up a second timer.
import { useEffect, useRef, useState } from "react";
import { styles } from "../styles.js";
import { fetchConversationsForSession, fetchThreadForPlayer, replyToPlayer } from "../lib/messagingApi.js";

const POLL_INTERVAL_MS = 8000;

function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function MessagesView({ sessionCode, sessionStartedAt, onUnreadCountChange }) {
  const hasSession = Boolean(sessionCode && sessionStartedAt);
  const [status, setStatus] = useState(hasSession ? "loading" : "no-session");
  const [conversations, setConversations] = useState([]);
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [thread, setThread] = useState([]);
  const [threadStatus, setThreadStatus] = useState("idle"); // 'idle' | 'loading' | 'ready' | 'error'
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState(null);
  const pollRef = useRef(null);

  function loadConversations() {
    if (!hasSession) return;
    fetchConversationsForSession(sessionCode, sessionStartedAt)
      .then((data) => {
        setConversations(data);
        setStatus("ready");
        onUnreadCountChange?.(data.filter((c) => c.has_unread).length);
      })
      .catch(() => setStatus("error"));
  }

  // Initial fetch + a single centralized poll timer, both keyed only on
  // session identity — cleared on unmount AND whenever the organizer
  // starts/ends a session (a fresh sessionCode/sessionStartedAt pair),
  // so leaving Messages or the session changing never leaves a stale
  // timer running.
  useEffect(() => {
    if (!hasSession) {
      setStatus("no-session");
      setConversations([]);
      setSelectedPlayerId(null);
      setThread([]);
      onUnreadCountChange?.(0); // no session running -- never leave a stale badge from a prior/ended session
      return undefined;
    }
    setStatus("loading");
    loadConversations();
    pollRef.current = setInterval(loadConversations, POLL_INTERVAL_MS);
    return () => {
      clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCode, sessionStartedAt]);

  function openThread(playerId) {
    setSelectedPlayerId(playerId);
    setThreadStatus("loading");
    setReplyError(null);
    fetchThreadForPlayer(sessionCode, sessionStartedAt, playerId)
      .then((data) => {
        setThread(data);
        setThreadStatus("ready");
        loadConversations(); // reading the thread just marked it read server-side — refresh the list's unread dot immediately
      })
      .catch(() => setThreadStatus("error"));
  }

  async function handleReply(e) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sending || !selectedPlayerId) return; // duplicate-tap guard
    setSending(true);
    setReplyError(null);
    try {
      await replyToPlayer(sessionCode, sessionStartedAt, selectedPlayerId, trimmed);
      setDraft("");
      openThread(selectedPlayerId); // refresh immediately after sending, per direction
    } catch (err) {
      setReplyError(err.message || "Couldn't send your reply. Please try again.");
    } finally {
      setSending(false);
    }
  }

  if (status === "no-session") {
    return (
      <div>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13.5 }}>
          Start an Open Play session to see and reply to player messages.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return <div style={{ color: "var(--coral)", fontSize: 13.5 }}>Couldn't load messages. Please try again.</div>;
  }

  const selectedConversation = conversations.find((c) => c.player_id === selectedPlayerId);

  return (
    <div style={styles.messagesLayout}>
      <div style={styles.messagesListPane}>
        {status === "loading" && conversations.length === 0 && (
          <p style={{ color: "var(--color-text-faint)", fontSize: 13 }}>Loading…</p>
        )}
        {status === "ready" && conversations.length === 0 && (
          <p style={{ color: "var(--color-text-faint)", fontSize: 13 }}>No player messages yet this session.</p>
        )}
        {conversations.map((c) => (
          <button
            key={c.player_id}
            type="button"
            style={styles.conversationRow(c.player_id === selectedPlayerId)}
            onClick={() => openThread(c.player_id)}
          >
            <div style={styles.conversationRowHead}>
              <span style={styles.conversationPlayerName}>{c.display_name || "Player"}</span>
              {c.has_unread && <span style={styles.unreadDot} aria-label="unread" />}
            </div>
            {c.last_message_body && <span style={styles.conversationPreview}>{c.last_message_body}</span>}
            {c.last_message_at && <span style={styles.conversationTime}>{formatTime(c.last_message_at)}</span>}
          </button>
        ))}
      </div>

      <div style={styles.messagesThreadPane}>
        {!selectedPlayerId && <p style={{ color: "var(--color-text-faint)", fontSize: 13 }}>Select a conversation to read and reply.</p>}

        {selectedPlayerId && (
          <>
            <p style={{ fontWeight: 700, fontSize: 14, marginTop: 0 }}>{selectedConversation?.display_name || "Player"}</p>

            {threadStatus === "loading" && <p style={{ color: "var(--color-text-faint)", fontSize: 13 }}>Loading…</p>}
            {threadStatus === "error" && <div style={{ color: "var(--coral)", fontSize: 13.5 }}>Couldn't load this conversation.</div>}

            {threadStatus === "ready" && (
              <div style={styles.messageThreadList}>
                {thread.length === 0 && <p style={{ color: "var(--color-text-faint)", fontSize: 13 }}>No messages yet.</p>}
                <div style={styles.messageThreadListContainer}>
                  {thread.map((m) => (
                    <div key={m.id} style={styles.messageBubble(m.sender_role === "organizer")}>
                      {m.body}
                      <span style={styles.messageBubbleTime}>
                        {m.sender_role === "organizer" ? "You" : selectedConversation?.display_name || "Player"} · {formatTime(m.created_at)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleReply} style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Reply…"
                maxLength={1000}
                disabled={sending}
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--line)", background: "var(--color-surface)", color: "var(--ink)" }}
              />
              <button type="submit" style={{ ...styles.primaryBtn, ...((!draft.trim() || sending) ? styles.btnDisabled : {}) }} disabled={!draft.trim() || sending}>
                {sending ? "Sending…" : "Reply"}
              </button>
            </form>
            {replyError && <p style={{ color: "var(--coral)", fontSize: 12.5, marginTop: 6 }}>{replyError}</p>}
          </>
        )}
      </div>
    </div>
  );
}

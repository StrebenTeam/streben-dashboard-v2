'use client';

import { useState, useEffect, useRef } from 'react';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [convId, setConvId] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send() {
    const msg = input.trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(p => p.concat([{ role: 'user', text: msg }]));
    setLoading(true);

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, conversationId: convId })
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setMessages(p => p.concat([{ role: 'error', text: data.error }]));
        } else {
          setConvId(data.conversationId);
          const newMsgs = [{ role: 'assistant', text: data.response }];
          if (data.actions && data.actions.length > 0) {
            data.actions.forEach(a => {
              newMsgs.push({ role: 'action', action: a, cid: data.conversationId });
            });
          }
          setMessages(p => p.concat(newMsgs));
        }
        setLoading(false);
      })
      .catch(e => {
        setMessages(p => p.concat([{ role: 'error', text: e.message }]));
        setLoading(false);
      });
  }

  function confirm(actionMsg) {
    fetch('/api/chat/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: actionMsg.cid, actionId: actionMsg.action.actionId })
    })
      .then(r => r.json())
      .then(data => {
        setMessages(p =>
          p.map(m => {
            if (m.action && m.action.actionId === actionMsg.action.actionId) {
              return { role: 'system', text: data.success ? 'Executed: ' + actionMsg.action.title : 'Failed: ' + (data.error || 'Unknown') };
            }
            return m;
          })
        );
      });
  }

  function dismiss(actionId) {
    setMessages(p => p.filter(m => !(m.action && m.action.actionId === actionId)));
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // Closed state: floating button
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 56, height: 56,
          borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff', fontSize: 24, zIndex: 9999,
          boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        {'\uD83D\uDCAC'}
      </button>
    );
  }

  function renderMessage(m, i) {
    if (m.role === 'user') {
      return (
        <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <div style={{
            background: '#6366f1', color: '#fff', padding: '8px 14px',
            borderRadius: '16px 16px 4px 16px', maxWidth: '80%',
            fontSize: 13, lineHeight: '1.5'
          }}>{m.text}</div>
        </div>
      );
    }

    if (m.role === 'assistant') {
      return (
        <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
          <div style={{
            background: '#1e1e2e', color: '#e2e8f0', padding: '8px 14px',
            borderRadius: '16px 16px 16px 4px', maxWidth: '80%',
            fontSize: 13, lineHeight: '1.5', whiteSpace: 'pre-wrap'
          }}>{m.text}</div>
        </div>
      );
    }

    if (m.role === 'action') {
      return (
        <div key={i} style={{
          background: '#1a1a2e', border: '1px solid #6366f1',
          borderRadius: 12, padding: 12, marginBottom: 8
        }}>
          <div style={{ color: '#a5b4fc', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
            {'\u26A1'} {m.action.title}
          </div>
          <div style={{ color: '#94a3b8', fontSize: 12, marginBottom: 8 }}>
            {m.action.description}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => confirm(m)}
              style={{
                background: '#22c55e', color: '#fff', border: 'none',
                borderRadius: 6, padding: '5px 12px', fontSize: 12,
                cursor: 'pointer', fontWeight: 600
              }}
            >Confirm &amp; Execute</button>
            <button
              onClick={() => dismiss(m.action.actionId)}
              style={{
                background: 'transparent', color: '#64748b', border: '1px solid #334155',
                borderRadius: 6, padding: '5px 12px', fontSize: 12,
                cursor: 'pointer'
              }}
            >Dismiss</button>
          </div>
        </div>
      );
    }

    if (m.role === 'error') {
      return (
        <div key={i} style={{
          background: 'rgba(239,68,68,0.1)', color: '#f87171',
          padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 8
        }}>{m.text}</div>
      );
    }

    if (m.role === 'system') {
      return (
        <div key={i} style={{
          background: 'rgba(34,197,94,0.1)', color: '#4ade80',
          padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 8
        }}>{m.text}</div>
      );
    }

    return null;
  }

  // Open panel
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, width: 380, height: 520,
      background: '#0f0f1a', border: '1px solid #1e1e3a',
      borderRadius: 16, zIndex: 9999, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.5)', fontFamily: 'system-ui, sans-serif'
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #1e1e3a',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
        borderRadius: '16px 16px 0 0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 14 }}>Streben AI</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'none', border: 'none', color: '#64748b',
            fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1
          }}
        >{'\u00D7'}</button>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.length === 0
          ? (
            <div style={{ color: '#64748b', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{'\uD83E\uDD16'}</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Ask me anything about your accounts</div>
              <div style={{ fontSize: 12 }}>I can analyze performance, find negatives, adjust budgets, and more.</div>
            </div>
          )
          : messages.map((m, i) => renderMessage(m, i))
        }
        {loading && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 0' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: 'pulse 1s infinite' }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: 'pulse 1s infinite 0.2s' }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6366f1', animation: 'pulse 1s infinite 0.4s' }} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid #1e1e3a',
        display: 'flex', gap: 8, alignItems: 'flex-end'
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask about your accounts..."
          rows={1}
          style={{
            flex: 1, background: '#1a1a2e', border: '1px solid #2d2d4a',
            borderRadius: 10, padding: '10px 12px', color: '#e2e8f0',
            fontSize: 13, resize: 'none', outline: 'none',
            fontFamily: 'inherit', lineHeight: '1.4'
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            background: (loading || !input.trim()) ? '#334155' : '#6366f1',
            color: '#fff', border: 'none', borderRadius: 10,
            width: 36, height: 36, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0
          }}
        >{'\u27A4'}</button>
      </div>
    </div>
  );
}

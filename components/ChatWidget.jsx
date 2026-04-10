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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 24, right: 24, width: 56, height: 56,
          borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: 'linear-gradient(135deg, #8AC245, #6EC1E4)',
          color: '#fff', fontSize: 24, zIndex: 9999,
          boxShadow: '0 4px 20px rgba(138,194,69,0.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease'
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; e.currentTarget.style.boxShadow = '0 6px 28px rgba(138,194,69,0.5)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(138,194,69,0.35)'; }}
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
            background: '#8AC245', color: '#0A0A0A', padding: '8px 14px',
            borderRadius: '16px 16px 4px 16px', maxWidth: '80%',
            fontSize: 13, lineHeight: '1.5', fontWeight: 600
          }}>{m.text}</div>
        </div>
      );
    }

    if (m.role === 'assistant') {
      return (
        <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 8 }}>
          <div style={{
            background: '#1A1A1A', color: 'rgba(255,255,255,0.85)', padding: '8px 14px',
            borderRadius: '16px 16px 16px 4px', maxWidth: '80%',
            fontSize: 13, lineHeight: '1.5', whiteSpace: 'pre-wrap'
          }}>{m.text}</div>
        </div>
      );
    }

    if (m.role === 'action') {
      return (
        <div key={i} style={{
          background: '#111111', border: '1px solid #2A2A2A',
          borderRadius: 12, padding: 12, marginBottom: 8
        }}>
          <div style={{ color: '#6EC1E4', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
            {'\u26A1'} {m.action.title}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginBottom: 8 }}>
            {m.action.description}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => confirm(m)}
              style={{
                background: '#8AC245', color: '#0A0A0A', border: 'none',
                borderRadius: 25, padding: '5px 14px', fontSize: 12,
                cursor: 'pointer', fontWeight: 600, letterSpacing: '0.5px'
              }}
            >Confirm &amp; Execute</button>
            <button
              onClick={() => dismiss(m.action.actionId)}
              style={{
                background: 'transparent', color: 'rgba(255,255,255,0.4)', border: '1px solid #2A2A2A',
                borderRadius: 25, padding: '5px 14px', fontSize: 12,
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
          background: 'rgba(229,77,77,0.1)', color: '#E54D4D',
          padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 8
        }}>{m.text}</div>
      );
    }

    if (m.role === 'system') {
      return (
        <div key={i} style={{
          background: 'rgba(138,194,69,0.1)', color: '#8AC245',
          padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 8
        }}>{m.text}</div>
      );
    }

    return null;
  }

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, width: 380, height: 520,
      background: '#0A0A0A', border: '1px solid #2A2A2A',
      borderRadius: 16, zIndex: 9999, display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)', fontFamily: 'Urbanist, sans-serif'
    }}>
      <div style={{
        padding: '14px 16px', borderBottom: '1px solid #2A2A2A',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'linear-gradient(135deg, rgba(138,194,69,0.08), rgba(110,193,228,0.06))',
        borderRadius: '16px 16px 0 0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#8AC245' }} />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14, letterSpacing: '1px' }}>Streben AI</span>
        </div>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)',
            fontSize: 20, cursor: 'pointer', padding: '0 4px', lineHeight: 1
          }}
        >{'\u00D7'}</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {messages.length === 0
          ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>{'\uD83E\uDD16'}</div>
              <div style={{ fontWeight: 600, marginBottom: 4, color: 'rgba(255,255,255,0.6)' }}>Ask me anything about your accounts</div>
              <div style={{ fontSize: 12 }}>I can analyze performance, find negatives, adjust budgets, and more.</div>
            </div>
          )
          : messages.map((m, i) => renderMessage(m, i))
        }
        {loading && (
          <div style={{ display: 'flex', gap: 4, padding: '8px 0' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8AC245', animation: 'pulse 1s infinite' }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8AC245', animation: 'pulse 1s infinite 0.2s' }} />
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#8AC245', animation: 'pulse 1s infinite 0.4s' }} />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{
        padding: '12px 16px', borderTop: '1px solid #2A2A2A',
        display: 'flex', gap: 8, alignItems: 'flex-end'
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask about your accounts..."
          rows={1}
          style={{
            flex: 1, background: '#111111', border: '1px solid #2A2A2A',
            borderRadius: 10, padding: '10px 12px', color: '#fff',
            fontSize: 13, resize: 'none', outline: 'none',
            fontFamily: 'inherit', lineHeight: '1.4', letterSpacing: '0.5px'
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          style={{
            background: (loading || !input.trim()) ? '#1A1A1A' : '#8AC245',
            color: (loading || !input.trim()) ? 'rgba(255,255,255,0.3)' : '#0A0A0A',
            border: 'none', borderRadius: 10,
            width: 36, height: 36, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0, fontWeight: 700,
            transition: 'background 0.2s ease'
          }}
        >{'\u27A4'}</button>
      </div>
    </div>
  );
}

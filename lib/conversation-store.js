/**
 * conversation-store.js - In-memory multi-turn conversation manager
 */

const crypto = require('crypto');

class ConversationStore {
  constructor() {
    this.conversations = new Map();
    // Cleanup every 30 min
    setInterval(() => this.cleanup(), 30 * 60 * 1000);
  }

  create(accountId) {
    var id = crypto.randomUUID();
    this.conversations.set(id, {
      id: id,
      accountId: accountId,
      messages: [], // {role, content}
      pendingActions: {}, // actionId -> action definition
      createdAt: Date.now(),
      lastActivity: Date.now()
    });
    return id;
  }

  get(id) {
    var conv = this.conversations.get(id);
    if (conv) conv.lastActivity = Date.now();
    return conv || null;
  }
  addMessage(id, role, content) {
    var conv = this.conversations.get(id);
    if (!conv) return;
    conv.messages.push({ role: role, content: content });
    conv.lastActivity = Date.now();
    // Keep last 20 messages to control token usage
    if (conv.messages.length > 20) {
      conv.messages = conv.messages.slice(-20);
    }
  }

  getMessages(id) {
    var conv = this.conversations.get(id);
    return conv ? conv.messages : [];
  }

  storeAction(convId, action) {
    var conv = this.conversations.get(convId);
    if (!conv) return;
    conv.pendingActions[action.actionId] = action;
  }

  getAction(convId, actionId) {
    var conv = this.conversations.get(convId);
    if (!conv) return null;
    return conv.pendingActions[actionId] || null;
  }

  removeAction(convId, actionId) {
    var conv = this.conversations.get(convId);
    if (conv) delete conv.pendingActions[actionId];
  }

  cleanup() {
    var now = Date.now();
    var maxAge = 24 * 60 * 60 * 1000; // 24 hours
    for (var [id, conv] of this.conversations) {
      if (now - conv.lastActivity > maxAge) {
        this.conversations.delete(id);
      }
    }
  }
}

module.exports = new ConversationStore();

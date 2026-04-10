import conversationStore from '@/lib/conversation-store';

async function mcpProxy(toolName, params) {
  return { pending: true, tool: toolName, params: params };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { conversationId, actionId } = body;

    if (!conversationId || !actionId) {
      return Response.json({ error: 'conversationId and actionId required' }, { status: 400 });
    }

    const action = conversationStore.getAction(conversationId, actionId);
    if (!action) {
      return Response.json({ error: 'Action not found or expired' }, { status: 404 });
    }

    const result = await mcpProxy(action.type, action.parameters);
    conversationStore.removeAction(conversationId, actionId);

    return Response.json({
      success: true,
      actionId,
      type: action.type,
      result,
      message: 'Action queued for execution: ' + action.title
    });
  } catch (err) {
    return Response.json({ error: 'Action execution failed: ' + err.message }, { status: 500 });
  }
}

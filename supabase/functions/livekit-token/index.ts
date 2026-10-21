import { createClient } from 'npm:@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk@2';

// No service-role key: all channel reads use the caller's JWT and RLS.
Deno.serve(async (req: Request) => {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(x => x.trim());
  const origin = req.headers.get('Origin') || '';
  const headers: Record<string,string> = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0], 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.includes(origin)) return json(403, { error: 'Origin is not allowed' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return json(405, { error: 'POST required' });
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Sign in required' });
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !user) return json(401, { error: 'Invalid session' });
    let body;
    try { body = await req.json(); } catch { return json(400, { error: 'Invalid JSON' }); }
    const channelId = body?.channelId;
    if (typeof channelId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(channelId)) return json(400, { error: 'Valid channelId required' });
    const { data: channel, error: channelError } = await client.from('channels').select('id').eq('id', channelId).single();
    if (channelError || !channel) return json(403, { error: 'Channel membership required' });
    const key = Deno.env.get('LIVEKIT_API_KEY');
    const secret = Deno.env.get('LIVEKIT_API_SECRET');
    if (!key || !secret) return json(503, { error: 'LiveKit secrets are missing' });
    // Per-tab identity permits the same account on multiple devices.
    const token = new AccessToken(key, secret, { identity: `${user.id}:${crypto.randomUUID()}`, name: String(user.user_metadata?.display_name || user.email?.split('@')[0] || 'Teammate').slice(0,60), ttl: '10m' });
    token.addGrant({ roomJoin: true, room: `channel-${channel.id}`, canPublish: true, canSubscribe: true, canPublishData: true });
    return json(200, { token: await token.toJwt() });
  } catch (e) {
    console.error('Meeting token error', e instanceof Error ? e.message : 'Unknown error');
    return json(500, { error: 'Meeting service failed. Check function logs.' });
  }
});

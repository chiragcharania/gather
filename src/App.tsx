import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
const Meeting = lazy(() => import('./Meeting'));

import { Hash, Users, Video, MessageSquare, Search, Plus, Send, Paperclip, LogOut, X, ArrowRight, Copy, Menu } from 'lucide-react';
import { configured, supabase, initials, validMessage, type Team, type Channel, type Message } from './lib';

const demoTeam: Team = { id: 'demo', name: 'Design Studio', owner_id: 'demo' };
const demoChannels: Channel[] = ['General', 'Design feedback', 'Inspiration'].map((name, i) => ({ id: `demo-${i}`, team_id: 'demo', name }));
const demoMessages: Message[] = [
  { id: '1', channel_id: 'demo-0', user_id: 'Alex Morgan', body: 'Welcome to our little corner of the internet. A place to share ideas, make things, and stay connected. 👋', created_at: new Date(Date.now() - 3600000).toISOString(), attachment_path: null, attachment_name: null },
  { id: '2', channel_id: 'demo-0', user_id: 'Jamie Chen', body: 'The new workspace is looking good! I’ve created a channel for design feedback. Drop your work in there whenever you’re ready.', created_at: new Date(Date.now() - 2400000).toISOString(), attachment_path: null, attachment_name: null },
  { id: '3', channel_id: 'demo-0', user_id: 'Alex Morgan', body: 'Quick catch-up later? Hit Meet now above and we can walk through everything together.', created_at: new Date(Date.now() - 1200000).toISOString(), attachment_path: null, attachment_name: null },
];

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(configured);
  const [demo, setDemo] = useState(!configured);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [body, setBody] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'team' | 'channel' | 'invite' | 'join' | null>(null);
  const [value, setValue] = useState('');
  const [invite, setInvite] = useState('');
  const [meeting, setMeeting] = useState<{ token: string; room: string } | null>(null);
  const [mobile, setMobile] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const user = session?.user;
  const activeTeam = teams.find(t => t.id === teamId);
  const activeChannel = channels.find(c => c.id === channelId);
  const displayName = user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'You';

  function fail(e: unknown) { setError(e instanceof Error ? e.message : String((e as { message?: string })?.message || e)); }
  useEffect(() => {
    if (!configured) return;
    supabase.auth.getSession().then(({ data, error }) => { if (error) fail(error); setSession(data.session); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (next) setDemo(false); });
    return () => data.subscription.unsubscribe();
  }, []);
  async function loadTeams() {
    const { data, error } = await supabase.from('teams').select('*').order('created_at');
    if (error) throw error;
    setTeams(data || []); setTeamId(current => data?.some(t => t.id === current) ? current : data?.[0]?.id || '');
  }
  useEffect(() => {
    setMeeting(null); setMessages([]); setChannels([]); setTeamId(''); setChannelId('');
    if (demo) { setTeams([demoTeam]); setTeamId('demo'); return; }
    setTeams([]);
    if (user) loadTeams().catch(fail);
  }, [user?.id, demo]);
  useEffect(() => {
    setChannels([]); setChannelId(''); setMessages([]);
    if (!teamId) return;
    if (demo) { setChannels(demoChannels); setChannelId('demo-0'); return; }
    let alive = true;
    const reload = async () => {
      const { data, error } = await supabase.from('channels').select('*').eq('team_id', teamId).order('created_at');
      if (!alive) return;
      if (error) return fail(error);
      setChannels(data || []); setChannelId(current => data?.some(c => c.id === current) ? current : data?.[0]?.id || '');
    };
    void reload();
    const sub = supabase.channel(`channels-${teamId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'channels', filter: `team_id=eq.${teamId}` }, reload).subscribe();
    return () => { alive = false; void supabase.removeChannel(sub); };
  }, [teamId, demo]);
  useEffect(() => {
    setMessages([]); setBody(''); setFile(null);
    if (!channelId) return;
    if (demo) { setMessages(channelId === 'demo-0' ? demoMessages : []); return; }
    let alive = true;
    const reload = async () => {
      const { data, error } = await supabase.from('messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(200);
      if (!alive) return;
      if (error) return fail(error);
      setMessages((data || []).reverse());
      const ids = [...new Set((data || []).map(m => m.user_id))];
      if (ids.length) {
        const result = await supabase.from('profiles').select('id, display_name').in('id', ids);
        if (alive && result.data) setNames(Object.fromEntries(result.data.map(p => [p.id, p.display_name])));
      }
    };
    const sub = supabase.channel(`messages-${channelId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, reload).subscribe(status => { if (status === 'SUBSCRIBED') void reload(); if (status === 'CHANNEL_ERROR') setError('Chat connection interrupted. Refresh to reconnect.'); });
    void reload();
    return () => { alive = false; void supabase.removeChannel(sub); };
  }, [channelId, demo]);
  useEffect(() => { const list = end.current?.parentElement; list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' }); }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault(); if (!channelId || busy || !validMessage(body, !!file)) return;
    setBusy(true); setError('');
    let path: string | null = null;
    try {
      if (demo) {
        if (file) throw new Error('Attachments need a connected Supabase project.');
        setMessages(m => [...m, { id: crypto.randomUUID(), channel_id: channelId, user_id: 'You', body: body.trim(), created_at: new Date().toISOString(), attachment_path: null, attachment_name: null }]); setBody(''); return;
      }
      if (!user) return;
      if (file) {
        if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.');
        path = `${teamId}/${channelId}/${user.id}/${crypto.randomUUID()}`;
        const result = await supabase.storage.from('attachments').upload(path, file, { contentType: 'application/octet-stream' });
        if (result.error) throw result.error;
      }
      const { data, error } = await supabase.from('messages').insert({ channel_id: channelId, user_id: user.id, body: body.trim(), attachment_path: path, attachment_name: file?.name || null }).select().single();
      if (error) throw error;
      setMessages(m => m.some(x => x.id === data.id) ? m : [...m, data]); setBody(''); setFile(null);
    } catch (e) { if (path) await supabase.storage.from('attachments').remove([path]); fail(e); } finally { setBusy(false); }
  }
  async function openAttachment(m: Message) {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(m.attachment_path!, 60, { download: m.attachment_name || true });
    if (error) return fail(error);
    const a = document.createElement('a'); a.href = data.signedUrl; a.rel = 'noopener noreferrer'; a.target = '_blank'; a.click();
  }
  async function submitModal(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      if (demo) throw new Error('Connect Supabase and sign in to manage your workspace.');
      if (modal === 'team') {
        const { data, error } = await supabase.rpc('create_team', { team_name: value.trim() }); if (error) throw error;
        await loadTeams(); setTeamId(data);
      } else if (modal === 'channel') {
        const { data, error } = await supabase.from('channels').insert({ team_id: teamId, name: value.trim() }).select().single(); if (error) throw error;
        setChannels(c => c.some(x => x.id === data.id) ? c : [...c, data]); setChannelId(data.id);
      } else if (modal === 'join') {
        const { data, error } = await supabase.rpc('join_team', { invite_token: value.trim() }); if (error) throw error;
        await loadTeams(); setTeamId(data);
      } else if (modal === 'invite') {
        const { data, error } = await supabase.rpc('create_invite', { target_team: teamId }); if (error) throw error;
        setInvite(data); return;
      }
      setModal(null); setValue('');
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function meet() {
    if (demo) return setError('Meetings need Supabase sign-in and LiveKit Cloud credentials.');
    if (!import.meta.env.VITE_LIVEKIT_URL) return setError('Set VITE_LIVEKIT_URL in .env to enable meetings.');
    setBusy(true); setError('');
    try {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) throw refreshError || new Error('Sign in again to join.');
      const { data, error } = await supabase.functions.invoke('livekit-token', { body: { channelId } });
      if (error) throw error;
      if (!data?.token) throw new Error('Meeting service returned no token. Check the Edge Function secrets.');
      setMeeting({ token: data.token, room: channelId });
    } catch (e) { fail(e); } finally { setBusy(false); }
  }
  if (loading) return <div className="auth-screen">Opening your workspace…</div>;
  if (!demo && !session) return <Auth onDemo={() => setDemo(true)} />;
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">g</span> gather<span className="brand-tag">PERSONAL</span></div><div className="search-box"><Search size={17}/><input aria-label="Search loaded messages" placeholder="Search this conversation" value={search} onChange={e => setSearch(e.target.value)}/><kbd>⌕</kbd></div><div className="top-profile"><span className="online-dot"/> {demo ? 'Demo workspace' : displayName}<span className="avatar small">{initials(displayName)}</span></div></header>
    <nav className="rail" aria-label="App navigation"><button className="rail-item selected" onClick={() => setMobile(!mobile)}><Users/><span>Teams</span></button><button className="rail-item" onClick={() => channelId && document.getElementById('composer')?.focus()}><MessageSquare/><span>Chat</span></button><button className="rail-item" onClick={() => channelId ? void meet() : setError('Create a team and channel first.')} disabled={busy}><Video/><span>Meet</span></button><div className="rail-bottom"><button className="rail-item" title={demo ? 'Sign in' : 'Sign out'} onClick={async () => { if (demo) { if (configured) setDemo(false); else setError('Add Supabase credentials in .env, then restart the app to sign in.'); } else { const { error } = await supabase.auth.signOut(); if (error) fail(error); } }}><LogOut/><span>{demo ? 'Sign in' : 'Sign out'}</span></button></div></nav>
    <aside className={`sidebar ${mobile ? 'mobile-open' : ''}`}><div className="sidebar-title"><h2>Your workspace</h2><button className="icon-button" title="Create team" onClick={() => { setValue(''); setModal('team'); }}><Plus size={19}/></button></div><p className="eyebrow">TEAMS & CHANNELS</p><div className="team-list">{teams.map(t => <div key={t.id}><button className={`team-button ${teamId === t.id ? 'active' : ''}`} disabled={busy} onClick={() => setTeamId(t.id)}><span className="team-icon">{initials(t.name)}</span><span>{t.name}</span><span className="chevron">⌄</span></button>{teamId === t.id && <div className="channels">{channels.map(c => <button key={c.id} className={`channel-button ${channelId === c.id ? 'active' : ''}`} disabled={busy} onClick={() => { setChannelId(c.id); setMobile(false); }}><Hash size={17}/>{c.name}</button>)}{(demo || t.owner_id === user?.id) && <button className="channel-button muted" onClick={() => { setValue(''); setModal('channel'); }}><Plus size={16}/>Add channel</button>}</div>}</div>)}</div><button className="join-team" onClick={() => { setValue(''); setModal('join'); }}><Plus size={17}/> Join a team</button><div className="sidebar-card"><span className="card-spark">✦</span><strong>Good things happen together.</strong><p>Your people. Your ideas.<br/>One little workspace.</p></div><div className="sidebar-footer"><span className="online-dot"/> All together, wherever you are</div></aside>
    <main className="main"><div className="channel-header"><div className="channel-heading"><button className="icon-button mobile-toggle" onClick={() => setMobile(!mobile)} aria-label="Toggle channels"><Menu/></button><span className="channel-hash"><Hash size={25}/></span><div><h1>{activeChannel?.name || 'Welcome to Gather'}</h1><p>{activeTeam?.name || 'Create a team to get started'}<span> / </span>Team channel</p></div></div><div className="header-actions">{activeTeam?.owner_id === user?.id && <button className="secondary-button" onClick={() => { setInvite(''); setModal('invite'); }}><Users size={16}/> Invite</button>}<button className="primary-button" disabled={!channelId || busy} onClick={meet}><Video size={17}/> Meet now</button></div></div>
    {demo && <div className="demo-banner"><span><strong>You’re exploring demo mode.</strong> Messages stay here until you switch channels or refresh.</span><span>{configured ? <button onClick={() => setDemo(false)}>Sign in <ArrowRight size={14}/></button> : 'Connect Supabase to make it yours →'}</span></div>}
    {error && <div role="alert" className="error-banner">{error}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
    <div className="channel-tabs"><span className="tab active">Posts</span><span className="channel-note">A little space for big ideas</span></div>
    <section className="conversation" aria-label="Channel messages"><div className="welcome"><div className="welcome-art"><MessageSquare size={31}/><span>✦</span></div><p className="eyebrow">THIS IS WHERE IT STARTS</p><h2>Welcome to {activeChannel ? `#${activeChannel.name}` : 'your workspace'}</h2><p>Share an update, ask a question, or just say hello.<br/>You’re in good company.</p></div><div className="day-divider"><span>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span></div>
    {messages.filter(m => `${m.body} ${names[m.user_id] || m.user_id}`.toLowerCase().includes(search.toLowerCase())).map((m, i) => { const name = demo ? m.user_id : m.user_id === user?.id ? displayName : names[m.user_id] || 'Teammate'; return <article className="message" key={m.id}><div className={`avatar color-${i % 4}`}>{initials(name)}</div><div className="message-content"><div className="message-meta"><strong>{name}</strong>{m.user_id === user?.id || name === 'You' ? <span className="you-label">you</span> : null}<time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div><p>{m.body}</p>{m.attachment_path && <button className="attachment" onClick={() => void openAttachment(m)}><Paperclip size={15}/>{m.attachment_name}</button>}</div></article>; })}<div ref={end}/></section>
    <form className="composer-area" onSubmit={send}><div className="composer"><textarea id="composer" aria-label="Message" placeholder={activeChannel ? `Message #${activeChannel.name}` : 'Create a team and channel to start chatting'} value={body} disabled={!channelId || busy} maxLength={4000} onChange={e => setBody(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}/>{file && <div className="selected-file">{file.name}<button type="button" aria-label="Remove attachment" onClick={() => setFile(null)}><X size={14}/></button></div>}<div className="composer-toolbar"><label className="icon-button attachment-input" title="Attach a file"><Paperclip size={19}/><input type="file" aria-label="Attach a file" disabled={!channelId || busy} onChange={e => { setFile(e.target.files?.[0] || null); e.target.value = ''; }}/></label><span className="composer-hint">Make yourself at home.</span><button className="send-button" type="submit" disabled={!channelId || busy || !validMessage(body, !!file)} aria-label="Send message"><Send size={17}/></button></div></div><div className="composer-footer"><span><strong>Enter</strong> to send · <strong>Shift + Enter</strong> for a new line</span><span>{body.length}/4000</span></div></form></main>
    {modal && <div className="overlay"><form className="modal" role="dialog" aria-modal="true" aria-label="Workspace action" onSubmit={submitModal}><button type="button" className="modal-close icon-button" aria-label="Close dialog" onClick={() => setModal(null)}><X/></button><h2>{({ team: 'Create a team', channel: 'Create a channel', join: 'Join a team', invite: 'Invite your people' })[modal]}</h2><p>{modal === 'invite' ? 'Generate a single-use code, valid for 24 hours. Share it privately with one person.' : modal === 'join' ? 'Paste the invitation code shared by your team owner.' : 'Give your new space a name.'}</p>{modal !== 'invite' && <input aria-label={modal === 'join' ? 'Invitation code' : 'Name'} autoFocus required maxLength={modal === 'join' ? 100 : 60} value={value} onChange={e => setValue(e.target.value)}/>} {invite && <div className="invite-code"><code>{invite}</code><button type="button" className="icon-button" aria-label="Copy invitation" onClick={() => navigator.clipboard.writeText(invite).catch(fail)}><Copy size={17}/></button></div>}<div role="status" className="modal-error">{error}</div><button className="primary-button" disabled={busy || (modal !== 'invite' && !value.trim())}>{busy ? 'Working…' : modal === 'invite' ? 'Generate code' : 'Continue'}<ArrowRight size={16}/></button></form></div>}
    {meeting && <div className="meeting-overlay"><div className="meeting-top"><strong>{activeChannel?.name} · Live meeting</strong><button className="secondary-button" onClick={() => setMeeting(null)}>Leave meeting <X size={16}/></button></div><Suspense fallback={<div className="auth-screen">Loading meeting…</div>}><Meeting token={meeting.token} serverUrl={import.meta.env.VITE_LIVEKIT_URL} connect video={false} audio={false} data-lk-theme="default" onDisconnected={() => setMeeting(null)} onError={e => { fail(e); setMeeting(null); }}/></Suspense></div>}
  </div>;
}

function Auth({ onDemo }: { onDemo: () => void }) {
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setNotice('');
    try {
      const { data, error } = signup ? await supabase.auth.signUp({ email, password, options: { data: { display_name: name.trim() || email.split('@')[0] }, emailRedirectTo: window.location.origin } }) : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (signup && !data.session) setNotice('Check your email to confirm your account, then sign in.');
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Authentication failed. Try again.'); } finally { setBusy(false); }
  }
  return <div className="auth-screen"><form className="auth-card" onSubmit={submit}><span className="brand-mark">g</span><p className="eyebrow">A SPACE FOR YOUR PEOPLE</p><h1>{signup ? 'Make yourself at home.' : 'Together starts here.'}</h1><p>Chat, share, and meet in your personal workspace.</p>{signup && <label>Your name<input required value={name} onChange={e => setName(e.target.value)} maxLength={60} autoComplete="name"/></label>}<label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email"/></label><label>Password<input type="password" minLength={8} required value={password} onChange={e => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'}/></label>{notice && <p role="status" className="auth-notice">{notice}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}<ArrowRight size={17}/></button><button type="button" className="text-button" onClick={() => { setSignup(!signup); setNotice(''); }}>{signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</button><button type="button" className="text-button muted" onClick={onDemo}>Explore the demo first</button></form></div>;
}


import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_'));
export const supabase = createClient(configured ? url : 'https://placeholder.supabase.co', configured ? key : 'placeholder');
export type Team = { id: string; name: string; owner_id: string };
export type Channel = { id: string; team_id: string; name: string };
export type Message = { id: string; channel_id: string; user_id: string; body: string; created_at: string; attachment_path: string | null; attachment_name: string | null };
export function validMessage(body: string, attachment: boolean) { return (body.trim().length > 0 || attachment) && body.length <= 4000; }
export function initials(name: string) { return name.split(/[ @._-]+/).filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase() || '?'; }

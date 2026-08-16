import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { Group, Profile } from '../lib/types';

function generateInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

interface AuthState {
  loading: boolean;
  error: string | null;
  profile: Profile | null;
  group: Group | null;
  init: () => Promise<void>;
  createGroup: (groupName: string, playerName: string, color: string) => Promise<void>;
  joinGroup: (inviteCode: string, playerName: string, color: string) => Promise<void>;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  loading: true,
  error: null,
  profile: null,
  group: null,

  init: async () => {
    set({ loading: true, error: null });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      let userId = sessionData.session?.user.id;

      if (!userId) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        userId = data.user?.id;
      }
      if (!userId) throw new Error('Could not establish a session.');

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (profileErr) throw profileErr;

      if (!profile || !profile.group_id) {
        set({ loading: false, profile: profile ?? null, group: null });
        return;
      }

      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .select('*')
        .eq('id', profile.group_id)
        .maybeSingle();
      if (groupErr) throw groupErr;

      set({ loading: false, profile, group: group ?? null });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  createGroup: async (groupName, playerName, color) => {
    set({ loading: true, error: null });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error('Not signed in.');

      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .insert({ name: groupName, invite_code: generateInviteCode() })
        .select('*')
        .single();
      if (groupErr) throw groupErr;

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .upsert({ id: userId, name: playerName, color, group_id: group.id })
        .select('*')
        .single();
      if (profileErr) throw profileErr;

      set({ loading: false, profile, group });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  joinGroup: async (inviteCode, playerName, color) => {
    set({ loading: true, error: null });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData.session?.user.id;
      if (!userId) throw new Error('Not signed in.');

      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .select('*')
        .eq('invite_code', inviteCode.trim().toUpperCase())
        .maybeSingle();
      if (groupErr) throw groupErr;
      if (!group) throw new Error('No group found with that invite code.');

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .upsert({ id: userId, name: playerName, color, group_id: group.id })
        .select('*')
        .single();
      if (profileErr) throw profileErr;

      set({ loading: false, profile, group });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
    }
  },

  signOut: () => {
    supabase.auth.signOut();
    set({ profile: null, group: null });
  },
}));

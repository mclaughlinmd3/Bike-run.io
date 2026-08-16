import { create } from 'zustand';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ActivityType, Profile, TerritoryStateRow } from '../lib/types';
import type { Feature, Polygon } from 'geojson';

interface TerritoryState {
  groupId: string | null;
  activityType: ActivityType;
  rows: TerritoryStateRow[];
  profiles: Record<string, Profile>;
  loading: boolean;
  error: string | null;
  channel: RealtimeChannel | null;

  connect: (groupId: string) => Promise<void>;
  disconnect: () => void;
  setActivityType: (type: ActivityType) => void;
  submitClaims: (activityId: string, claims: Feature<Polygon>[]) => Promise<void>;
}

export const useTerritoryStore = create<TerritoryState>((set, get) => ({
  groupId: null,
  activityType: 'run',
  rows: [],
  profiles: {},
  loading: false,
  error: null,
  channel: null,

  connect: async (groupId: string) => {
    get().disconnect();
    set({ groupId, loading: true, error: null });

    try {
      const [{ data: rows, error: rowsErr }, { data: profiles, error: profilesErr }] = await Promise.all([
        supabase.from('territory_state').select('*').eq('group_id', groupId),
        supabase.from('profiles').select('*').eq('group_id', groupId),
      ]);
      if (rowsErr) throw rowsErr;
      if (profilesErr) throw profilesErr;

      const profileMap: Record<string, Profile> = {};
      for (const p of profiles ?? []) profileMap[p.id] = p;

      set({ rows: rows ?? [], profiles: profileMap, loading: false });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }

    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'territory_state', filter: `group_id=eq.${groupId}` },
        (payload) => {
          set((state) => {
            const rows = [...state.rows];
            const idx = rows.findIndex((r) => r.id === (payload.new as TerritoryStateRow)?.id);
            if (payload.eventType === 'DELETE') {
              const oldId = (payload.old as TerritoryStateRow).id;
              return { rows: rows.filter((r) => r.id !== oldId) };
            }
            const next = payload.new as TerritoryStateRow;
            if (idx >= 0) rows[idx] = next;
            else rows.push(next);
            return { rows };
          });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `group_id=eq.${groupId}` },
        (payload) => {
          set((state) => {
            const next = payload.new as Profile;
            if (!next?.id) return state;
            return { profiles: { ...state.profiles, [next.id]: next } };
          });
        },
      )
      .subscribe();

    set({ channel });
  },

  disconnect: () => {
    const { channel } = get();
    if (channel) supabase.removeChannel(channel);
    set({ channel: null });
  },

  setActivityType: (type) => set({ activityType: type }),

  submitClaims: async (activityId, claims) => {
    for (const claim of claims) {
      const { error } = await supabase.rpc('apply_territory_claim', {
        p_activity_id: activityId,
        p_claim_geojson: claim.geometry,
      });
      if (error) throw error;
    }
    // Realtime will push the authoritative rows too; refetch immediately so
    // the claiming player sees their own result without waiting on the socket.
    const { groupId } = get();
    if (groupId) {
      const { data } = await supabase.from('territory_state').select('*').eq('group_id', groupId);
      if (data) set({ rows: data });
    }
  },
}));

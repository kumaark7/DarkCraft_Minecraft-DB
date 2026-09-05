import { useState, useEffect, useCallback } from 'react';
import { playerService } from '@/services';
import type { Player, BannedIP } from '@/types';

export function usePlayers(serverId: string) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [bannedIPs, setBannedIPs] = useState<BannedIP[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    const [data, banned] = await Promise.all([
      playerService.getPlayers(serverId),
      playerService.getBannedIPs(serverId),
    ]);
    setPlayers(data);
    setBannedIPs(banned);
    setLoading(false);
  }, [serverId]);

  useEffect(() => {
    void load(true);
    const timer = setInterval(() => { void load(); }, 3000);
    return () => clearInterval(timer);
  }, [load]);

  const kick = useCallback(async (username: string, reason?: string) => {
    await playerService.kickPlayer(serverId, username, reason);
    await load();
  }, [serverId, load]);

  const ban = useCallback(async (username: string, reason?: string) => {
    await playerService.banPlayer(serverId, username, reason);
    await load();
  }, [serverId, load]);

  const unban = useCallback(async (username: string) => {
    await playerService.unbanPlayer(serverId, username);
    await load();
  }, [serverId, load]);

  const op = useCallback(async (username: string) => {
    await playerService.opPlayer(serverId, username);
    await load();
  }, [serverId, load]);

  const deop = useCallback(async (username: string) => {
    await playerService.deopPlayer(serverId, username);
    await load();
  }, [serverId, load]);

  const addWhitelist = useCallback(async (username: string, edition: 'java' | 'bedrock' = 'java') => {
    await playerService.addWhitelistPlayer(serverId, username, edition);
    await load();
  }, [serverId, load]);

  const removeWhitelist = useCallback(async (username: string, edition: 'java' | 'bedrock' = 'java', uuid?: string) => {
    await playerService.removeWhitelistPlayer(serverId, username, edition, uuid);
    await load();
  }, [serverId, load]);

  const unbanIP = useCallback(async (ip: string) => {
    await playerService.unbanIP(serverId, ip);
    const data = await playerService.getBannedIPs(serverId);
    setBannedIPs(data);
  }, [serverId]);

  return {
    players, loading, reload: load,
    online: players.filter(p => p.online),
    whitelist: players.filter(p => p.isWhitelisted),
    operators: players.filter(p => p.isOp),
    banned: players.filter(p => p.isBanned),
    bannedIPs,
    kick, ban, unban, op, deop, addWhitelist, removeWhitelist, unbanIP,
  };
}

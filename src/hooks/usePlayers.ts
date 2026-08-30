import { useState, useEffect, useCallback } from 'react';
import { playerService } from '@/services';
import type { Player, BannedIP } from '@/types';

export function usePlayers(serverId: string) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const data = await playerService.getPlayers(serverId);
    setPlayers(data);
    setLoading(false);
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

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

  const addWhitelist = useCallback(async (username: string) => {
    await playerService.addWhitelistPlayer(serverId, username);
    await load();
  }, [serverId, load]);

  const removeWhitelist = useCallback(async (username: string) => {
    await playerService.removeWhitelistPlayer(serverId, username);
    await load();
  }, [serverId, load]);

  const [bannedIPs, setBannedIPs] = useState<BannedIP[]>([]);
  useEffect(() => { playerService.getBannedIPs(serverId).then(setBannedIPs); }, [serverId]);

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

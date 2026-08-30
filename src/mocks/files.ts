import type { ServerFile } from '@/types';

export const MOCK_FILES: Record<string, Record<string, ServerFile[]>> = {
  'server-1': {
    '/': [
      { name: 'plugins', path: '/plugins', type: 'directory', modified: '2026-08-30T15:30:00Z' },
      { name: 'world', path: '/world', type: 'directory', modified: '2026-08-30T20:10:00Z' },
      { name: 'world_nether', path: '/world_nether', type: 'directory', modified: '2026-08-30T18:00:00Z' },
      { name: 'world_the_end', path: '/world_the_end', type: 'directory', modified: '2026-08-29T12:00:00Z' },
      { name: 'logs', path: '/logs', type: 'directory', modified: '2026-08-30T20:13:00Z' },
      { name: 'config', path: '/config', type: 'directory', modified: '2026-08-28T10:00:00Z' },
      { name: 'cache', path: '/cache', type: 'directory', modified: '2026-08-27T08:00:00Z' },
      { name: 'paper.jar', path: '/paper.jar', type: 'file', size: 16384000, modified: '2026-08-01T00:00:00Z', extension: 'jar' },
      { name: 'server.properties', path: '/server.properties', type: 'file', size: 1842, modified: '2026-08-30T19:58:00Z', extension: 'properties' },
      { name: 'whitelist.json', path: '/whitelist.json', type: 'file', size: 312, modified: '2026-08-30T16:00:00Z', extension: 'json' },
      { name: 'ops.json', path: '/ops.json', type: 'file', size: 198, modified: '2026-08-30T16:45:00Z', extension: 'json' },
      { name: 'banned-players.json', path: '/banned-players.json', type: 'file', size: 244, modified: '2026-08-29T20:00:00Z', extension: 'json' },
      { name: 'banned-ips.json', path: '/banned-ips.json', type: 'file', size: 156, modified: '2026-08-18T12:00:00Z', extension: 'json' },
      { name: 'eula.txt', path: '/eula.txt', type: 'file', size: 158, modified: '2024-01-15T10:00:00Z', extension: 'txt' },
    ],
    '/plugins': [
      { name: 'EssentialsX-2.20.1.jar', path: '/plugins/EssentialsX-2.20.1.jar', type: 'file', size: 2048000, modified: '2026-08-01T00:00:00Z', extension: 'jar' },
      { name: 'WorldGuard-7.0.9.jar', path: '/plugins/WorldGuard-7.0.9.jar', type: 'file', size: 1536000, modified: '2026-08-30T15:30:00Z', extension: 'jar' },
      { name: 'WorldEdit-7.2.15.jar', path: '/plugins/WorldEdit-7.2.15.jar', type: 'file', size: 4096000, modified: '2026-08-01T00:00:00Z', extension: 'jar' },
      { name: 'LuckPerms-5.4.102.jar', path: '/plugins/LuckPerms-5.4.102.jar', type: 'file', size: 3200000, modified: '2026-08-01T00:00:00Z', extension: 'jar' },
      { name: 'Essentials', path: '/plugins/Essentials', type: 'directory', modified: '2026-08-30T04:00:00Z' },
    ],
    '/logs': [
      { name: 'latest.log', path: '/logs/latest.log', type: 'file', size: 524288, modified: '2026-08-30T20:13:00Z', extension: 'log' },
      { name: '2026-08-29-1.log.gz', path: '/logs/2026-08-29-1.log.gz', type: 'file', size: 102400, modified: '2026-08-29T23:59:59Z', extension: 'gz' },
      { name: '2026-08-28-1.log.gz', path: '/logs/2026-08-28-1.log.gz', type: 'file', size: 98304, modified: '2026-08-28T23:59:59Z', extension: 'gz' },
    ],
    '/config': [
      { name: 'paper-global.yml', path: '/config/paper-global.yml', type: 'file', size: 8192, modified: '2026-08-28T10:00:00Z', extension: 'yml' },
      { name: 'paper-world.yml', path: '/config/paper-world.yml', type: 'file', size: 4096, modified: '2026-08-28T10:00:00Z', extension: 'yml' },
    ],
  },
};

export const MOCK_FILE_CONTENTS: Record<string, string> = {
  '/server.properties': `# Minecraft server properties
# Generated on Fri Aug 30 20:00:00 UTC 2026
enable-jmx-monitoring=false
rcon.port=25575
gamemode=survival
enable-command-block=true
enable-query=false
generator-settings={}
enforce-secure-profile=true
level-seed=
allow-flight=false
server-port=25565
level-type=minecraft\\:normal
enable-rcon=false
sync-chunk-writes=true
op-permission-level=4
prevent-proxy-connections=false
hide-online-players=false
resource-pack=
entity-broadcast-range-percentage=100
simulation-distance=8
rcon.password=
player-idle-timeout=0
force-gamemode=false
rate-limit=0
hardcore=false
white-list=false
broadcast-console-to-ops=true
spawn-npcs=true
previews-chat=false
spawn-animals=true
function-permission-level=2
level-name=world
text-filtering-config=
motd=\\u00a76Welcome to \\u00a7bDARK CRAFT\\u00a7r!
query.port=25565
require-resource-pack=false
spawn-monsters=true
max-chained-neighbor-updates=1000000
difficulty=normal
network-compression-threshold=256
max-tick-time=60000
require-resource-pack-prompt=
max-players=20
use-native-transport=true
online-mode=true
enable-status=true
allow-nether=true
server-ip=
pvp=true
max-world-size=29999984
view-distance=10
server-name=DARK CRAFT
spawn-protection=16
max-build-height=320`,
  '/whitelist.json': `[
  {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "KeerDubi"
  },
  {
    "uuid": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "name": "Jai"
  },
  {
    "uuid": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "name": "Kesavan"
  }
]`,
  '/ops.json': `[
  {
    "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "KeerDubi",
    "level": 4,
    "bypassesPlayerLimit": false
  },
  {
    "uuid": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "name": "Jai",
    "level": 4,
    "bypassesPlayerLimit": false
  }
]`,
};

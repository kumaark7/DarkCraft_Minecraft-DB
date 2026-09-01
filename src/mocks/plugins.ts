import type { Plugin, Mod } from '@/types';

export const MOCK_PLUGINS: Record<string, Plugin[]> = {
  'server-1': [
    { id: 'pl-1', name: 'EssentialsX', version: '2.20.1', filename: 'EssentialsX-2.20.1.jar', size: 2048000, status: 'enabled', description: 'The essential plugin for Spigot/Paper servers', author: 'EssentialsX Team' },
    { id: 'pl-2', name: 'WorldGuard', version: '7.0.9', filename: 'WorldGuard-7.0.9.jar', size: 1536000, status: 'enabled', description: 'Region and in-game map editor', author: 'sk89q' },
    { id: 'pl-3', name: 'WorldEdit', version: '7.2.15', filename: 'WorldEdit-7.2.15.jar', size: 4096000, status: 'enabled', description: 'In-game map editor', author: 'sk89q' },
    { id: 'pl-4', name: 'LuckPerms', version: '5.4.102', filename: 'LuckPerms-5.4.102.jar', size: 3200000, status: 'enabled', description: 'A permissions plugin', author: 'Luck' },
    { id: 'pl-5', name: 'Vault', version: '1.7.3', filename: 'Vault-1.7.3.jar', size: 256000, status: 'enabled', description: 'Economy/Permission/Chat API', author: 'MilkBowl' },
    { id: 'pl-6', name: 'CoreProtect', version: '22.1', filename: 'CoreProtect-22.1.jar', size: 1024000, status: 'enabled', description: 'Fast, efficient block logging', author: 'Intelli' },
    { id: 'pl-7', name: 'DynMap', version: '3.6', filename: 'dynmap-3.6.jar', size: 8192000, status: 'disabled', description: 'Dynamic web maps for Minecraft', author: 'mikeprimm' },
    { id: 'pl-8', name: 'OldPlugin', version: '1.0.0', filename: 'OldPlugin-1.0.0.jar', size: 128000, status: 'disabled', description: 'An outdated plugin', author: 'Unknown' },
  ],
};

export const MOCK_MODS: Record<string, Mod[]> = {
  'server-3': [
    { id: 'md-1', name: 'Fabric API', version: '0.100.4', filename: 'fabric-api-0.100.4.jar', size: 2048000, status: 'Active', loader: 'Fabric', description: 'Core Fabric API', author: 'FabricMC' },
    { id: 'md-2', name: 'Sodium', version: '0.5.11', filename: 'sodium-0.5.11.jar', size: 1024000, status: 'Active', loader: 'Fabric', description: 'Modern rendering engine replacement', author: 'JellySquid3' },
    { id: 'md-3', name: 'Lithium', version: '0.12.1', filename: 'lithium-0.12.1.jar', size: 512000, status: 'Active', loader: 'Fabric', description: 'Game logic optimization mod', author: 'CaffeineMC' },
    { id: 'md-4', name: 'Create', version: '0.5.1f', filename: 'create-0.5.1f.jar', size: 4096000, status: 'Active', loader: 'Fabric', description: 'Factory machines and automation', author: 'SimplyMiPri' },
  ],
  'server-4': [
    { id: 'md-5', name: 'Forge', version: '47.2.0', filename: 'forge-47.2.0-universal.jar', size: 3000000, status: 'Active', loader: 'Forge', description: 'Minecraft Forge core', author: 'Forge Team' },
    { id: 'md-6', name: 'Applied Energistics 2', version: '15.0.9', filename: 'appliedenergistics2-15.0.9.jar', size: 6144000, status: 'Active', loader: 'Forge', description: 'Storage, processing and transport networks', author: 'TeamAE2' },
    { id: 'md-7', name: 'Mekanism', version: '10.4.4', filename: 'Mekanism-10.4.4.jar', size: 5120000, status: 'Active', loader: 'Forge', description: 'Energy, fluid and item transport', author: 'aidancbrady' },
    { id: 'md-8', name: 'Thermal Expansion', version: '10.2.1', filename: 'ThermalExpansion-10.2.1.jar', size: 4608000, status: 'Active', loader: 'Forge', description: 'Thermal Expansion mod', author: 'TeamCoFH' },
  ],
};

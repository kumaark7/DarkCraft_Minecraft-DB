export interface ModrinthInstallResult {
  installed: string[];
  alreadyPresent: string[];
  restartRequired: boolean;
}

export interface ModrinthMatch {
  projectId: string;
  title: string;
  description: string;
  versionId: string;
  versionNumber: string;
  minecraftVersion: string;
  loader: string;
  versionUrl: string;
  requiredDependencies: number;
  clientRequired: boolean;
}

export interface ModrinthSearch {
  supported: boolean;
  reason?: string;
  minecraftVersion: string;
  loader: string | null;
  matches: ModrinthMatch[];
  nextOffset: number | null;
  checkedAt: string;
}

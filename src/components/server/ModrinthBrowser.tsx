import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Package, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { pluginService } from '@/services';
import type { ModrinthSearch } from '@/types/modrinth';

export function ModrinthBrowser({ serverId, software, minecraftVersion }: {
  serverId: string; software: string; minecraftVersion: string;
}) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<ModrinthSearch | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const sequence = useRef(0);
  const supported = ['Fabric', 'Forge', 'NeoForge'].includes(software);
  useEffect(() => {
    sequence.current += 1;
    setResult(null); setError(''); setLoading(false); setQuery(''); setSubmittedQuery('');
    return () => { sequence.current += 1; };
  }, [serverId, software, minecraftVersion]);

  async function search(offset = 0) {
    const ticket = ++sequence.current;
    const term = offset ? submittedQuery : query.trim();
    setLoading(true); setError('');
    // Hide old results while searching; a failed request must not suggest stale matches.
    if (!offset) setResult(null);
    try {
      const data = await pluginService.searchModrinth(serverId, term, offset);
      if (ticket !== sequence.current) return;
      if (data.minecraftVersion !== minecraftVersion || data.loader !== software.toLowerCase()) {
        setResult(null); setError(data.reason ?? 'Server version changed. Refresh the page before searching again.'); return;
      }
      setSubmittedQuery(term);
      setResult(previous => offset && previous ? {
        ...data, matches: [...previous.matches, ...data.matches.filter(match => !previous.matches.some(old => old.projectId === match.projectId))],
      } : data);
    } catch (reason) {
      if (ticket === sequence.current) { setResult(null); setError(reason instanceof Error ? reason.message : 'Modrinth search failed. Please retry.'); }
    } finally { if (ticket === sequence.current) setLoading(false); }
  }

  return (
    <section className="bg-card border border-border rounded overflow-hidden" aria-labelledby="modrinth-title">
      <div className="p-3 md:p-4 space-y-3">
        <div>
          <h2 id="modrinth-title" className="text-xs font-semibold flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" aria-hidden="true" /> Modrinth
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {supported ? 'Find server-compatible releases for ' + software + ' · Minecraft ' + minecraftVersion : 'Mod browsing supports Fabric, Forge and NeoForge servers.'}
          </p>
        </div>
        {supported && <>
          <form className="flex flex-col sm:flex-row gap-2" onSubmit={event => { event.preventDefault(); void search(); }}>
            <div className="flex-1 min-w-0">
              <label htmlFor="modrinth-query" className="sr-only">Search Modrinth mods</label>
              <Input id="modrinth-query" type="search" maxLength={100} value={query} onChange={event => setQuery(event.target.value)}
                placeholder="Search mods, or browse popular releases" className="h-10 text-xs" />
            </div>
            <Button type="submit" variant="secondary" disabled={loading} className="h-10 text-xs gap-1.5">
              <Search className="w-3.5 h-3.5" aria-hidden="true" />{loading ? 'Checking versions…' : 'Search Modrinth'}
            </Button>
          </form>
          <p className="text-[10px] text-muted-foreground">
            Stable releases only. The same release must list this exact Minecraft version, loader and server support.
            Publisher compatibility is not a guarantee against conflicts; review dependencies before using the existing Upload Mod action.
            Browsing does not install, activate or update mods.
          </p>
          <div role="status" aria-live="polite" className="text-xs text-muted-foreground">
            {loading ? 'Checking release metadata on Modrinth…' : result ? (result.supported
              ? result.matches.length + ' matching releases. Metadata is cached for up to 5 minutes.'
              : result.reason) : !error ? 'Search to load compatible mods.' : ''}
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </>}
      </div>
      {result && result.matches.length === 0 && result.supported && !loading &&
        <p className="px-4 pb-4 text-xs text-muted-foreground">No verified stable server releases in this result page. Try another search{result.nextOffset !== null ? ' or check the next results' : ''}. Filters are never widened automatically.</p>}
      {result && result.matches.length > 0 && <ul className="divide-y divide-border border-t border-border">
        {result.matches.map(match => <li key={match.projectId} className="p-3 md:p-4 flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="text-xs font-medium break-words">{match.title}</h3>
            <p className="text-xs text-muted-foreground break-words">{match.description}</p>
            <p className="text-[10px] text-muted-foreground break-words">
              {match.loader} · Minecraft {match.minecraftVersion} · Release {match.versionNumber}
              {match.clientRequired ? ' · Also required on clients' : ''}
              {match.requiredDependencies > 0 ? ' · ' + match.requiredDependencies + ' required dependencies — review before upload' : ''}
            </p>
          </div>
          <Button variant="secondary" size="sm" className="h-10 md:h-8 text-xs gap-1.5 shrink-0" asChild>
            <a href={match.versionUrl} target="_blank" rel="noopener noreferrer" aria-label={'View ' + match.title + ' release ' + match.versionNumber + ' on Modrinth'}>
              View matching release <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </Button>
        </li>)}
      </ul>}
      {result?.nextOffset != null && <div className="p-3 border-t border-border">
        <Button type="button" variant="ghost" className="h-10 text-xs" disabled={loading} onClick={() => void search(result.nextOffset!)}>Check more results</Button>
      </div>}
    </section>
  );
}

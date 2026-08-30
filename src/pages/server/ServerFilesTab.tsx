import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  FolderOpen, File, FileCode, FileText, Settings, Package,
  Image, Archive, ChevronRight, Upload, Download, Plus, FolderPlus,
  Pencil, Copy, Trash2, RefreshCw, X,
  Save, RotateCcw, Search as SearchIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState, LoadingState } from '@/components/shared/States';
import { fileService } from '@/services';
import { formatBytes, formatDate, isEditableFile, cn } from '@/utils';
import { toast } from 'sonner';
import type { ServerFile } from '@/types';

function getFileIcon(ext?: string): React.ReactNode {
  if (!ext) return <FolderOpen className="w-4 h-4 text-yellow-400" />;
  const map: Record<string, React.ReactNode> = {
    jar: <Package className="w-4 h-4 text-orange-400" />,
    json: <FileCode className="w-4 h-4 text-accent" />,
    yml: <FileCode className="w-4 h-4 text-accent" />,
    yaml: <FileCode className="w-4 h-4 text-accent" />,
    properties: <Settings className="w-4 h-4 text-muted-foreground" />,
    toml: <FileCode className="w-4 h-4 text-accent" />,
    txt: <FileText className="w-4 h-4 text-muted-foreground" />,
    log: <FileText className="w-4 h-4 text-muted-foreground" />,
    conf: <Settings className="w-4 h-4 text-muted-foreground" />,
    cfg: <Settings className="w-4 h-4 text-muted-foreground" />,
    zip: <Archive className="w-4 h-4 text-yellow-400" />,
    gz: <Archive className="w-4 h-4 text-yellow-400" />,
    png: <Image className="w-4 h-4 text-pink-400" />,
  };
  return map[ext.toLowerCase()] ?? <File className="w-4 h-4 text-muted-foreground" />;
}

export default function ServerFilesTab() {
  const { id } = useParams<{ id: string }>();
  const [path, setPath] = useState('/');
  const [files, setFiles] = useState<ServerFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ file: ServerFile; content: string; original: string } | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorSearch, setEditorSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ServerFile | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: ServerFile } | null>(null);
  const [createDialog, setCreateDialog] = useState<'file' | 'folder' | null>(null);
  const [newName, setNewName] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    const data = await fileService.getFiles(id!, path);
    setFiles(data);
    setLoading(false);
  }, [id, path]);

  useEffect(() => { load(); }, [load]);

  const openFile = async (file: ServerFile) => {
    if (file.type === 'directory') { setPath(file.path); return; }
    if (!isEditableFile(file.name)) { toast.info(`Cannot edit binary file: ${file.name}. Download to view.`); return; }
    const content = await fileService.getFileContent(id!, file.path);
    setEditor({ file, content, original: content });
    setEditorDirty(false);
    setEditorSearch('');
  };

  const saveFile = async () => {
    if (!editor) return;
    setSaving(true);
    await fileService.saveFile(id!, editor.file.path, editor.content);
    setEditor(e => e ? { ...e, original: e.content } : null);
    setEditorDirty(false);
    setSaving(false);
    toast.success('File saved');
  };

  const reloadFile = async () => {
    if (!editor) return;
    const content = await fileService.getFileContent(id!, editor.file.path);
    setEditor(e => e ? { ...e, content, original: content } : null);
    setEditorDirty(false);
  };

  const handleDelete = async (file: ServerFile) => {
    await fileService.deleteFile(id!, file.path);
    toast.success(`${file.name} deleted`);
    setDeleteTarget(null);
    load();
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (createDialog === 'file') {
      await fileService.createFile(id!, path, newName);
      toast.success('File created');
    } else {
      await fileService.createFolder(id!, path, newName);
      toast.success('Folder created');
    }
    setNewName('');
    setCreateDialog(null);
    load();
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await fileService.uploadFile(id!, path, file);
    toast.success(`${file.name} uploaded`);
    load();
  };

  const breadcrumbs = path === '/' ? ['Server'] : ['Server', ...path.replace(/^\//, '').split('/')];

  const toggleSelect = (p: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  };

  // Close context menu on click
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  // Editor highlight colors (simple CSS-based for properties/json)
  const getEditorContent = () => {
    if (!editor) return '';
    if (editorSearch) {
      return editor.content.split('\n').filter(l => l.toLowerCase().includes(editorSearch.toLowerCase())).join('\n');
    }
    return editor.content;
  };

  if (editor) {
    const lines = (editorSearch ? getEditorContent() : editor.content).split('\n');
    return (
      <div className="flex flex-col h-full min-h-0" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Editor toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-card/50 shrink-0 flex-wrap">
          <button onClick={() => setEditor(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-foreground">{editor.file.name}</span>
          {editorDirty && <span className="text-xs text-yellow-400">● Unsaved changes</span>}
          <div className="relative ml-2">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <Input placeholder="Search…" value={editorSearch} onChange={e => setEditorSearch(e.target.value)} className="pl-6 h-6 text-xs bg-input w-32" />
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={reloadFile}><RotateCcw className="w-3 h-3" /> Reload</Button>
            <Button size="sm" className="h-7 text-xs gap-1" onClick={saveFile} disabled={!editorDirty || saving}>
              <Save className="w-3 h-3" /> {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
        {/* Editor body */}
        <div className="flex-1 overflow-auto min-h-0 flex font-mono text-xs bg-background">
          {/* Line numbers */}
          <div className="shrink-0 px-3 py-3 text-right text-muted-foreground/40 border-r border-border select-none bg-card/30">
            {lines.map((_, i) => <div key={i} className="leading-6">{i + 1}</div>)}
          </div>
          {/* Content */}
          <textarea
            value={editorSearch ? getEditorContent() : editor.content}
            onChange={e => {
              if (editorSearch) return;
              setEditor(prev => prev ? { ...prev, content: e.target.value } : null);
              setEditorDirty(true);
            }}
            readOnly={!!editorSearch}
            spellCheck={false}
            className="flex-1 resize-none bg-transparent text-foreground/90 leading-6 p-3 focus:outline-none whitespace-pre"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-3 animate-fade-in">
      {/* Breadcrumbs + toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
          {breadcrumbs.map((crumb, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3 shrink-0" />}
              <button
                className={cn('hover:text-foreground transition-colors', i === breadcrumbs.length - 1 ? 'text-foreground font-medium' : 'hover:text-foreground')}
                onClick={() => {
                  if (i === 0) { setPath('/'); return; }
                  const parts = path.split('/').filter(Boolean);
                  setPath('/' + parts.slice(0, i).join('/'));
                }}
              >
                {crumb}
              </button>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <input ref={uploadRef} type="file" className="hidden" onChange={handleUpload} />
          <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => uploadRef.current?.click()}>
            <Upload className="w-3 h-3" /><span className="sr-only md:not-sr-only">Upload</span>
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => fileService.downloadFile(id!, [...selected][0])}>
              <Download className="w-3 h-3" /> Download ({selected.size})
            </Button>
          )}
          <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => { setNewName(''); setCreateDialog('file'); }}>
            <Plus className="w-3 h-3" /><span className="sr-only md:not-sr-only">File</span>
          </Button>
          <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => { setNewName(''); setCreateDialog('folder'); }}>
            <FolderPlus className="w-3 h-3" /><span className="sr-only md:not-sr-only">Folder</span>
          </Button>
          {selected.size > 0 && (
            <Button size="sm" variant="secondary" className="h-7 text-xs gap-1" onClick={() => {}}>
              <Archive className="w-3 h-3" /> ZIP
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 w-7 px-0" onClick={load}>
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* File list */}
      <div className="bg-card border border-border rounded overflow-hidden">
        {loading ? (
          <LoadingState message="Loading files…" />
        ) : files.length === 0 ? (
          <EmptyState icon={<FolderOpen className="w-8 h-8" />} title="Empty directory" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs whitespace-nowrap">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-8 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={selected.size === files.length && files.length > 0}
                      onChange={e => setSelected(e.target.checked ? new Set(files.map(f => f.path)) : new Set())}
                    />
                  </th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Name</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Size</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Modified</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {/* Directories first */}
                {[...files].sort((a, b) => {
                  if (a.type === 'directory' && b.type !== 'directory') return -1;
                  if (b.type === 'directory' && a.type !== 'directory') return 1;
                  return a.name.localeCompare(b.name);
                }).map(file => (
                  <tr
                    key={file.path}
                    className={cn(
                      'border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer',
                      selected.has(file.path) && 'bg-primary/5'
                    )}
                    onContextMenu={e => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, file }); }}
                  >
                    <td className="px-3 py-2" onClick={e => { e.stopPropagation(); toggleSelect(file.path); }}>
                      <input type="checkbox" className="accent-primary" checked={selected.has(file.path)} readOnly />
                    </td>
                    <td className="px-3 py-2" onClick={() => openFile(file)}>
                      <div className="flex items-center gap-2">
                        {file.type === 'directory'
                          ? <FolderOpen className="w-4 h-4 text-yellow-400 shrink-0" />
                          : getFileIcon(file.extension)}
                        <span className={cn('font-medium', file.type === 'directory' ? 'text-foreground' : 'text-foreground/90')}>
                          {file.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {file.type === 'directory' ? '—' : file.size !== undefined ? formatBytes(file.size) : '—'}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{file.modified ? formatDate(file.modified) : '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-0.5">
                        {file.type === 'file' && isEditableFile(file.name) && (
                          <Button size="sm" variant="ghost" className="h-6 w-6 px-0" onClick={() => openFile(file)}>
                            <Pencil className="w-3 h-3" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-6 w-6 px-0" onClick={() => fileService.downloadFile(id!, file.path)}>
                          <Download className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 px-0 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(file)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-popover border border-border rounded shadow-xl py-1 text-xs"
          style={{ left: contextMenu.x, top: contextMenu.y, minWidth: 140 }}
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.file.type === 'file' && isEditableFile(contextMenu.file.name) && (
            <button className="flex items-center gap-2 px-3 py-1.5 w-full hover:bg-muted/50 text-foreground" onClick={() => { openFile(contextMenu.file); setContextMenu(null); }}>
              <Pencil className="w-3 h-3" /> Edit
            </button>
          )}
          <button className="flex items-center gap-2 px-3 py-1.5 w-full hover:bg-muted/50 text-foreground" onClick={() => { fileService.downloadFile(id!, contextMenu.file.path); setContextMenu(null); }}>
            <Download className="w-3 h-3" /> Download
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 w-full hover:bg-muted/50 text-foreground" onClick={() => { setContextMenu(null); }}>
            <Copy className="w-3 h-3" /> Copy
          </button>
          <button className="flex items-center gap-2 px-3 py-1.5 w-full hover:bg-muted/50 text-foreground" onClick={() => { setContextMenu(null); }}>
            <Pencil className="w-3 h-3" /> Rename
          </button>
          <div className="border-t border-border my-1" />
          <button className="flex items-center gap-2 px-3 py-1.5 w-full hover:bg-muted/50 text-destructive" onClick={() => { setDeleteTarget(contextMenu.file); setContextMenu(null); }}>
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      )}

      {/* Create dialog */}
      {createDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card border border-border rounded p-5 w-80 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              {createDialog === 'file' ? 'Create File' : 'Create Folder'}
            </h2>
            <Input autoFocus value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()} placeholder={createDialog === 'file' ? 'filename.txt' : 'folder-name'} className="bg-input" />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCreateDialog(null)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={o => { if (!o) setDeleteTarget(null); }}
        title={`Delete ${deleteTarget?.name ?? ''}?`}
        description={deleteTarget?.type === 'directory' ? 'This will permanently delete the folder and all its contents.' : 'This file will be permanently deleted.'}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
      />
    </div>
  );
}

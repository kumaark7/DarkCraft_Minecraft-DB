import { useNavigate } from 'react-router-dom';
import { Plus, Upload, Server, ArrowLeft } from 'lucide-react';
import { Layout } from '@/layouts/Layout';

export default function AddServerPage() {
  const navigate = useNavigate();
  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-xl mx-auto space-y-6 animate-fade-in">
        <button
          onClick={() => navigate('/servers')}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Servers
        </button>

        <div>
          <h1 className="text-lg font-bold text-foreground">Add Server</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Create a new server or import an existing one</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Create card */}
          <button
            onClick={() => navigate('/servers/new/create')}
            className="group bg-card border border-border rounded p-6 text-left hover:border-primary/50 hover:bg-card/80 transition-all"
          >
            <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <h2 className="font-semibold text-foreground mb-1.5">Create New Server</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Configure a brand-new Minecraft server from scratch. Choose server type, version, RAM, and game settings.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-primary font-medium">
              <Server className="w-3.5 h-3.5" /> Configure & Create
            </div>
          </button>

          {/* Import card */}
          <button
            onClick={() => navigate('/servers/new/import')}
            className="group bg-card border border-border rounded p-6 text-left hover:border-accent/50 hover:bg-card/80 transition-all"
          >
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mb-4 group-hover:bg-accent/20 transition-colors">
              <Upload className="w-6 h-6 text-accent" />
            </div>
            <h2 className="font-semibold text-foreground mb-1.5">Import Existing Server</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Upload a ZIP archive of an existing server. NETHERCRAFT will detect the configuration and import it safely.
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-accent font-medium">
              <Upload className="w-3.5 h-3.5" /> Upload ZIP
            </div>
          </button>
        </div>
      </div>
    </Layout>
  );
}

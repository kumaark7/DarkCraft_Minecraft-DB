import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Sword } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth, type SetupDetails } from '@/contexts/AuthContext';

export default function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [credential, setCredential] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [setup, setSetup] = useState<SetupDetails | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (auth.setupRequired && !setup) {
      auth.startSetup().then(setSetup).catch(() => setError('Unable to start secure setup. Please try again.'));
    }
  }, [auth, setup]);

  if (!auth.loading && auth.authenticated) {
    const destination = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={destination} replace />;
  }

  const submitLogin = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await auth.login('admin', credential); navigate('/', { replace: true }); }
    catch { setError('Authentication failed. Check your credential and try again.'); }
    finally { setBusy(false); }
  };

  const submitSetup = async (event: FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (!setup) { setError('Secure setup is not ready.'); return; }
    setBusy(true); setError('');
    try { await auth.completeSetup(setup.setupToken, password, totpCode); navigate('/', { replace: true }); }
    catch { setError('Setup could not be completed. Check the password and authenticator code.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-card border border-border rounded p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-primary rounded flex items-center justify-center"><Sword className="w-5 h-5 text-primary-foreground" /></div>
          <div><h1 className="text-base font-bold tracking-widest">NETHERCRAFT</h1><p className="text-xs text-muted-foreground">Secure Control Panel</p></div>
        </div>

        {auth.loading ? <p className="text-sm text-muted-foreground">Checking authentication…</p> : auth.setupRequired ? (
          <form onSubmit={submitSetup} className="space-y-4">
            <div><h2 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-primary" />First-run security setup</h2><p className="text-xs text-muted-foreground mt-1">Create the owner password and link an authenticator before continuing.</p></div>
            {setup && <div className="bg-muted border border-border rounded p-3 text-center"><img src={setup.qrDataUrl} alt="Authenticator setup QR code" className="w-44 h-44 mx-auto bg-white" /><p className="text-[10px] text-muted-foreground mt-2">Manual key</p><code className="text-xs break-all select-all">{setup.manualKey}</code></div>}
            <div className="space-y-1.5"><Label htmlFor="setup-password">Owner password</Label><Input id="setup-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="confirm-password">Confirm password</Label><Input id="confirm-password" type="password" autoComplete="new-password" minLength={12} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="setup-code">Authenticator code</Label><Input id="setup-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={totpCode} onChange={(event) => setTotpCode(event.target.value.replace(/\D/g, ''))} /></div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <Button className="w-full" disabled={busy || !setup}>{busy ? 'Securing dashboard…' : 'Complete setup'}</Button>
          </form>
        ) : (
          <form onSubmit={submitLogin} className="space-y-4">
            <div><h2 className="text-sm font-semibold">Sign in</h2><p className="text-xs text-muted-foreground mt-1">Use the owner password or current authenticator code.</p></div>
            <div className="space-y-1.5"><Label htmlFor="username">Username</Label><Input id="username" autoComplete="username" value="admin" readOnly /></div>
            <div className="space-y-1.5"><Label htmlFor="credential">Password or authenticator code</Label><Input id="credential" type="password" autoComplete="current-password" required autoFocus value={credential} onChange={(event) => setCredential(event.target.value)} /></div>
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <Button className="w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
          </form>
        )}
      </div>
    </div>
  );
}

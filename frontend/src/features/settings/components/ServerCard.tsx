import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/api/client';
import { getApiBaseUrl, setApiBaseUrl, normalizeApiBaseUrl } from '../../../shared/api/baseUrl';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
import { useToast } from '../../../shared/ui/Toast';
import {
  getShell,
  isServedByShell,
  shellServerUrl,
  switchShellServer,
  switchToBundledUi,
  toOrigin,
} from '../../../shared/lib/shell';

interface ServerCardProps {
  onSaved?: () => void;
}

export function ServerCard({ onSaved }: ServerCardProps) {
  return isServedByShell() ? <ShellServerCard /> : <ApiServerCard onSaved={onSaved} />;
}

/**
 * The app is loaded from a server by the Android shell (B3). The API is same-origin, so the
 * only setting is which server the shell loads — changing it restarts the app on that server.
 */
function ShellServerCard() {
  const current = shellServerUrl() ?? '';
  const [url, setUrl] = useState(current);
  const toast = useToast();
  const target = toOrigin(url);

  const handleSwitch = () => {
    if (!target) {
      toast.error('Enter a server address, e.g. https://gym.example.com');
      return;
    }
    if (target === current) return;
    if (!confirm(`Restart the app on ${target}? Profile and other settings on this phone are kept per server, so you may need to set them up there.`)) return;
    if (!switchShellServer(target)) toast.error('Could not switch server');
  };

  const handleBundled = () => {
    if (!confirm('Restart the app using the copy built into this APK? Its screens are only as new as the APK.')) return;
    switchToBundledUi();
  };

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Server</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          The app loads from <span className="font-medium text-gray-700 dark:text-gray-300">{current}</span>,
          so updates there reach this phone without a new APK. Changing it restarts the app — not mid-workout.
        </p>
      </div>

      <Input
        label="Server address"
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://gym.example.com"
      />

      <div className="flex gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={handleSwitch}
          disabled={!target || target === current}
          className="flex-1"
        >
          Switch server
        </Button>
        <Button type="button" variant="secondary" onClick={handleBundled} className="flex-1">
          Use built-in app
        </Button>
      </div>
    </div>
  );
}

/** Browser, bundled UI, or an older APK: the API base URL, as before. */
function ApiServerCard({ onSaved }: ServerCardProps) {
  const [url, setUrl] = useState(() => getApiBaseUrl());
  const [isTesting, setIsTesting] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const handleSave = () => {
    setApiBaseUrl(url);
    const normalized = getApiBaseUrl();
    setUrl(normalized);
    // A B3 shell running the bundled UI: load the UI from that server from now on.
    if (normalized && getShell() && switchShellServer(normalized)) return;
    queryClient.invalidateQueries();
    toast.success('Server URL saved');
    onSaved?.();
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const targetBase = normalizeApiBaseUrl(url);
      const res = await api.get('/health', {
        baseURL: targetBase ? `${targetBase}/api` : '/api',
      });
      if (res.status === 200 && res.data?.status === 'ok') {
        toast.success('Connection successful');
      } else {
        toast.error('Unexpected response from server');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      toast.error(`Connection failed: ${message}`);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Server</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Leave blank to use this site. In the Android app, enter the server address, e.g. http://10.x.x.x:8037
        </p>
      </div>

      <Input
        label="Server address"
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="http://10.x.x.x:8037"
      />

      <div className="flex gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          className="flex-1"
        >
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handleTest}
          disabled={isTesting}
          className="flex-1"
        >
          {isTesting ? 'Testing...' : 'Test connection'}
        </Button>
      </div>
    </div>
  );
}

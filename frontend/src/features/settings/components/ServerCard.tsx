import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../../shared/api/client';
import { getApiBaseUrl, setApiBaseUrl, normalizeApiBaseUrl } from '../../../shared/api/baseUrl';
import { Button } from '../../../shared/ui/Button';
import { Input } from '../../../shared/ui/Input';
import { useToast } from '../../../shared/ui/Toast';

interface ServerCardProps {
  onSaved?: () => void;
}

export function ServerCard({ onSaved }: ServerCardProps) {
  const [url, setUrl] = useState(() => getApiBaseUrl());
  const [isTesting, setIsTesting] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const handleSave = () => {
    setApiBaseUrl(url);
    const normalized = getApiBaseUrl();
    setUrl(normalized);
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

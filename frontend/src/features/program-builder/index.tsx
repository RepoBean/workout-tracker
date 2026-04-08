import { useState, useMemo, useRef } from 'react';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { Input } from '../../shared/ui/Input';
import { usePrograms } from '../../shared/api/queries';
import { useProgramMutations } from './hooks/usePrograms';
import { ProgramCard } from './components/ProgramCard';
import { useToast } from '../../shared/ui/Toast';
import type { ProgramExportPayload } from '../../shared/api/types';

export default function ProgramBuilder() {
  const { data: programs, isLoading, error } = usePrograms();
  const { createProgram, importProgram } = useProgramMutations();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ProgramExportPayload | null>(null);

  const sortedPrograms = useMemo(() => {
    if (!programs) return [];
    return [...programs].sort((a, b) => {
      if (a.isActive && !b.isActive) return -1;
      if (!a.isActive && b.isActive) return 1;
      if (a.isArchived && !b.isArchived) return 1;
      if (!a.isArchived && b.isArchived) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [programs]);

  const visiblePrograms = showArchived
    ? sortedPrograms
    : sortedPrograms.filter(p => !p.isArchived);

  const archivedCount = sortedPrograms.filter(p => p.isArchived).length;

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProgram.mutate({ name: newName.trim() }, {
      onSuccess: () => {
        setNewName('');
        setShowCreate(false);
      },
    });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.version !== 1 || !data.program?.name) {
        toast.error('Invalid program file');
        return;
      }

      setImportPreview(data as ProgramExportPayload);
    } catch {
      toast.error('Invalid program file');
    }

    e.target.value = '';
  };

  const handleConfirmImport = () => {
    if (importPreview) {
      importProgram.mutate(importPreview, {
        onSuccess: () => setImportPreview(null),
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-display font-bold">Programs</h1>
        </div>
        {[1, 2, 3].map(i => (
          <div key={i} className="card animate-pulse">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-48" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-display font-bold">Programs</h1>
        <div className="card text-red-600 dark:text-red-400">
          Failed to load programs. Make sure the backend is running.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">Programs</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={handleImportClick}>
            Import
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            + New Program
          </Button>
        </div>
      </div>

      {visiblePrograms.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No programs yet</p>
          <Button onClick={() => setShowCreate(true)}>Create Your First Program</Button>
        </div>
      )}

      {visiblePrograms.map(program => (
        <ProgramCard key={program.id} program={program} />
      ))}

      {archivedCount > 0 && (
        <button
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          onClick={() => setShowArchived(!showArchived)}
        >
          {showArchived ? 'Hide' : 'Show'} {archivedCount} archived program{archivedCount !== 1 ? 's' : ''}
        </button>
      )}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Program">
        <div className="space-y-4">
          <Input
            label="Program Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Push Pull Legs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={!newName.trim() || createProgram.isPending}>
              Create
            </Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!importPreview} onClose={() => setImportPreview(null)} title="Import Program">
        {importPreview && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p><span className="font-medium">Program:</span> {importPreview.program.name}</p>
              <p><span className="font-medium">Workouts:</span> {importPreview.program.workouts.length}</p>
              <p><span className="font-medium">Total exercises:</span> {importPreview.program.workouts.reduce((sum, w) => sum + w.exercises.length, 0)}</p>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleConfirmImport} disabled={importProgram.isPending}>
                Import
              </Button>
              <Button variant="secondary" onClick={() => setImportPreview(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <input
        type="file"
        accept=".json"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}

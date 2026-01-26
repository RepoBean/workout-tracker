import { useState, useMemo } from 'react';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { Input } from '../../shared/ui/Input';
import { usePrograms } from '../../shared/api/queries';
import { useProgramMutations } from './hooks/usePrograms';
import { ProgramCard } from './components/ProgramCard';

export default function ProgramBuilder() {
  const { data: programs, isLoading, error } = usePrograms();
  const { createProgram } = useProgramMutations();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [showArchived, setShowArchived] = useState(false);

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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Programs</h1>
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
        <h1 className="text-2xl font-bold">Programs</h1>
        <div className="card text-red-600 dark:text-red-400">
          Failed to load programs. Make sure the backend is running.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Programs</h1>
        <Button onClick={() => setShowCreate(true)}>
          + New Program
        </Button>
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
    </div>
  );
}

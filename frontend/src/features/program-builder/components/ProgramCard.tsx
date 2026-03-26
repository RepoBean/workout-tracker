import { useState } from 'react';
import { Button } from '../../../shared/ui/Button';
import { Modal } from '../../../shared/ui/Modal';
import { Input } from '../../../shared/ui/Input';
import { useProgramMutations } from '../hooks/usePrograms';
import { WorkoutCard } from './WorkoutCard';
import { api } from '../../../shared/api/client';
import { useToast } from '../../../shared/ui/Toast';
import type { Program } from '../../../shared/api/types';

interface ProgramCardProps {
  program: Program;
}

export function ProgramCard({ program }: ProgramCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(program.name);
  const [showAddWorkout, setShowAddWorkout] = useState(false);
  const [newWorkoutName, setNewWorkoutName] = useState('');

  const { updateProgram, deleteProgram, activateProgram, duplicateProgram, createWorkout, reorderWorkouts } = useProgramMutations();
  const toast = useToast();
  const workouts = program.workouts || [];

  const handleSaveName = () => {
    if (editName.trim() && editName.trim() !== program.name) {
      updateProgram.mutate({ id: program.id, name: editName.trim() });
    }
    setIsEditingName(false);
  };

  const handleArchive = () => {
    if (confirm(`Archive program "${program.name}"?`)) {
      deleteProgram.mutate(program.id);
    }
  };

  const handleAddWorkout = () => {
    setNewWorkoutName('');
    setShowAddWorkout(true);
  };

  const handleCreateWorkout = () => {
    if (!newWorkoutName.trim()) return;
    createWorkout.mutate(
      {
        programId: program.id,
        name: newWorkoutName.trim(),
        orderIndex: workouts.length,
      },
      {
        onSuccess: () => {
          setNewWorkoutName('');
          setShowAddWorkout(false);
        },
      }
    );
  };

  const handleExport = async () => {
    try {
      const { data } = await api.get(`/programs/${program.id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${program.name.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 50)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Program exported');
    } catch {
      toast.error('Failed to export program');
    }
  };

  const handleMoveWorkout = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= workouts.length) return;

    const reordered = [...workouts];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    reorderWorkouts.mutate(reordered.map(w => w.id));
  };

  return (
    <div
      className={`card overflow-hidden ${
        program.isActive
          ? 'border-l-4 border-l-primary-600'
          : program.isArchived
          ? 'opacity-60'
          : ''
      }`}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          {isEditingName ? (
            <input
              className="flex-1 px-2 py-1 text-lg font-bold border rounded dark:bg-gray-700 dark:border-gray-600"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveName();
                if (e.key === 'Escape') {
                  setEditName(program.name);
                  setIsEditingName(false);
                }
              }}
              onClick={(e) => e.stopPropagation()}
              autoFocus
            />
          ) : (
            <h3
              className="text-lg font-bold truncate"
              onClick={(e) => {
                e.stopPropagation();
                setEditName(program.name);
                setIsEditingName(true);
              }}
            >
              {program.name}
            </h3>
          )}

          {program.isActive && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 flex-shrink-0">
              Active
            </span>
          )}
          {program.isArchived && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 flex-shrink-0">
              Archived
            </span>
          )}
        </div>

        <span className="text-sm text-gray-500 flex-shrink-0 ml-2">
          {workouts.length} workout{workouts.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="mt-4 space-y-4">
          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            {!program.isActive && (
              <Button
                size="sm"
                onClick={() => activateProgram.mutate(program.id)}
                disabled={activateProgram.isPending}
              >
                Activate
              </Button>
            )}
            {!program.isArchived && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleArchive}
                disabled={deleteProgram.isPending}
              >
                Archive
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={handleExport}
            >
              Export
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => duplicateProgram.mutate(program.id)}
              disabled={duplicateProgram.isPending}
            >
              Duplicate
            </Button>
          </div>

          {/* Workouts List */}
          <div className="space-y-2">
            {workouts.map((workout, index) => (
              <div key={workout.id} className="flex items-start gap-1">
                <div className="flex flex-col flex-shrink-0 pt-2">
                  <button
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    disabled={index === 0}
                    onClick={() => handleMoveWorkout(index, 'up')}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  <button
                    className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    disabled={index === workouts.length - 1}
                    onClick={() => handleMoveWorkout(index, 'down')}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
                <div className="flex-1">
                  <WorkoutCard workout={workout} />
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddWorkout}
            className="w-full"
            disabled={createWorkout.isPending}
          >
            + Add Workout
          </Button>
        </div>
      )}

      <Modal isOpen={showAddWorkout} onClose={() => setShowAddWorkout(false)} title="New Workout">
        <div className="space-y-4">
          <Input
            label="Workout Name"
            value={newWorkoutName}
            onChange={(e) => setNewWorkoutName(e.target.value)}
            placeholder="e.g. Push Day"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateWorkout();
            }}
            autoFocus
          />
          <div className="flex gap-2">
            <Button onClick={handleCreateWorkout} disabled={!newWorkoutName.trim() || createWorkout.isPending}>
              Create
            </Button>
            <Button variant="secondary" onClick={() => setShowAddWorkout(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

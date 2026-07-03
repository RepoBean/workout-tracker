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
  variant?: 'default' | 'hero';
}

export function ProgramCard({ program, variant = 'default' }: ProgramCardProps) {
  const isHero = variant === 'hero';
  const [isExpanded, setIsExpanded] = useState(isHero);
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

  const nextWorkout = workouts.length > 0
    ? workouts[program.currentWorkoutIndex % workouts.length]
    : null;
  const totalExercises = workouts.reduce((n, w) => n + (w.exercises?.length ?? 0), 0);

  return (
    <div
      className={`card overflow-hidden ${
        isHero
          ? 'p-5 border-l-[6px] border-l-primary-600 bg-gradient-to-br from-primary-50/70 to-white dark:from-primary-950/30 dark:to-surface-850'
          : program.isArchived
          ? 'opacity-60'
          : ''
      }`}
    >
      {/* Header */}
      <div
        className="flex items-start justify-between cursor-pointer gap-2"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <svg
            className={`${isHero ? 'w-6 h-6 mt-1' : 'w-5 h-5 mt-0.5'} text-gray-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {isEditingName ? (
                <input
                  className={`flex-1 px-2 py-1 ${isHero ? 'text-2xl' : 'text-lg'} font-bold border rounded dark:bg-surface-900 dark:border-surface-800`}
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
                  className={`${isHero ? 'text-2xl font-display' : 'text-lg'} font-bold truncate`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditName(program.name);
                    setIsEditingName(true);
                  }}
                >
                  {program.name}
                </h3>
              )}

              {program.isActive && !isHero && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 flex-shrink-0">
                  Active
                </span>
              )}
              {program.isArchived && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:bg-surface-700 dark:text-gray-400 flex-shrink-0">
                  Archived
                </span>
              )}
            </div>

            {isHero ? (
              <div className="mt-1 text-sm text-gray-600 dark:text-gray-400 truncate">
                {nextWorkout ? (
                  <>
                    <span className="text-xs uppercase tracking-wider text-primary-700 dark:text-primary-400 font-semibold">Up next</span>
                    <span className="mx-1.5">·</span>
                    <span className="font-medium text-gray-800 dark:text-gray-200">{nextWorkout.name}</span>
                    <span className="mx-1.5">·</span>
                    <span>{workouts.length} workout{workouts.length !== 1 ? 's' : ''}</span>
                  </>
                ) : (
                  <span className="italic">No workouts yet — add one below</span>
                )}
              </div>
            ) : (
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400 truncate">
                {workouts.length === 0
                  ? 'No workouts yet'
                  : `${workouts.length} workout${workouts.length !== 1 ? 's' : ''} · ${totalExercises} exercise${totalExercises !== 1 ? 's' : ''}`}
              </p>
            )}
          </div>
        </div>
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
              <WorkoutCard
                key={workout.id}
                workout={workout}
                isUpNext={program.isActive && nextWorkout?.id === workout.id}
                onMoveUp={() => handleMoveWorkout(index, 'up')}
                onMoveDown={() => handleMoveWorkout(index, 'down')}
                canMoveUp={index > 0}
                canMoveDown={index < workouts.length - 1}
              />
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

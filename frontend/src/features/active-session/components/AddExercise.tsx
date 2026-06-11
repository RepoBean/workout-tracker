import { useState, useRef, useEffect } from 'react';
import { useExerciseSuggestions } from '../../../shared/api/queries';
import { Button } from '../../../shared/ui/Button';

import type { CardioModality, ExerciseType } from '../../../shared/api/types';

interface AdHocExercise {
  tempId: string;
  name: string;
  exerciseType?: ExerciseType;
  cardioModality?: CardioModality | null;
  targetDurationSec?: number | null;
  targetDistance?: number | null;
}

interface AddExerciseProps {
  onAdd: (exercise: AdHocExercise) => void;
}

export type { AdHocExercise };

export function AddExercise({ onAdd }: AddExerciseProps) {
  const [name, setName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { data: suggestions } = useExerciseSuggestions(name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (suggestions && suggestions.length > 0 && name.length >= 2) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [suggestions, name]);

  const handleSubmit = (exerciseName?: string) => {
    const finalName = (exerciseName || name).trim();
    if (!finalName) return;

    onAdd({
      tempId: `adhoc-${Date.now()}`,
      name: finalName,
    });
    setName('');
    setShowSuggestions(false);
  };

  return (
    <div className="card">
      <h3 className="font-semibold mb-3">Add Exercise</h3>
      <div className="relative">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit();
              }
            }}
            onFocus={() => {
              if (suggestions && suggestions.length > 0 && name.length >= 2) {
                setShowSuggestions(true);
              }
            }}
            placeholder="Exercise name..."
            className="flex-1 px-3 py-2 border rounded-lg dark:bg-surface-900
                       dark:border-surface-800 dark:text-white text-sm"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleSubmit()}
            disabled={!name.trim()}
          >
            Add
          </Button>
        </div>

        {/* Autocomplete suggestions */}
        {showSuggestions && suggestions && suggestions.length > 0 && (
          <div className="absolute z-10 left-0 right-12 mt-1 bg-white dark:bg-surface-800
                          border dark:border-surface-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100
                           dark:hover:bg-surface-700 transition-colors"
                onClick={() => {
                  handleSubmit(suggestion);
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

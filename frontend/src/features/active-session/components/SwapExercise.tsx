import { useState, useRef, useEffect } from 'react';
import { useExerciseSuggestions } from '../../../shared/api/queries';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';

interface SwapExerciseProps {
  isOpen: boolean;
  currentExerciseName: string;
  // Sets already logged for the outgoing exercise — when > 0 the modal offers
  // to carry them over to the new exercise (default on).
  loggedSetCount: number;
  onSwap: (newName: string, moveSets: boolean) => void;
  onCancel: () => void;
}

export function SwapExercise({ isOpen, currentExerciseName, loggedSetCount, onSwap, onCancel }: SwapExerciseProps) {
  const [name, setName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [moveSets, setMoveSets] = useState(true);
  const { data: suggestions } = useExerciseSuggestions(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setShowSuggestions(false);
      setMoveSets(true);
      // Focus input after modal renders
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (suggestions && suggestions.length > 0 && name.length >= 2) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
  }, [suggestions, name]);

  const handleSwap = (exerciseName?: string) => {
    const finalName = (exerciseName || name).trim();
    if (!finalName) return;
    onSwap(finalName, loggedSetCount > 0 && moveSets);
  };

  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={`Replace ${currentExerciseName}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSwap();
            }
          }}
          onFocus={() => {
            if (suggestions && suggestions.length > 0 && name.length >= 2) {
              setShowSuggestions(true);
            }
          }}
          placeholder="New exercise name..."
          className="w-full px-3 py-3 border rounded-lg dark:bg-surface-900
                     dark:border-surface-800 dark:text-white text-base"
        />

        {/* Autocomplete suggestions */}
        {showSuggestions && suggestions && suggestions.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-surface-800
                          border dark:border-surface-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-3 text-base hover:bg-gray-100
                           dark:hover:bg-surface-700 transition-colors min-h-[44px]"
                onClick={() => handleSwap(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

      {loggedSetCount > 0 && (
        <label className="flex items-center gap-3 mt-4 min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            checked={moveSets}
            onChange={(e) => setMoveSets(e.target.checked)}
            className="w-5 h-5 rounded text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Move {loggedSetCount} logged set{loggedSetCount !== 1 ? 's' : ''} to the new exercise
          </span>
        </label>
      )}

      <div className="flex gap-3 mt-4">
        <Button
          variant="secondary"
          onClick={onCancel}
          className="flex-1 min-h-[44px]"
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => handleSwap()}
          disabled={!name.trim()}
          className="flex-1 min-h-[44px]"
        >
          Swap
        </Button>
      </div>
    </Modal>
  );
}

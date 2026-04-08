import { useState, useRef, useEffect } from 'react';
import { useExerciseSuggestions } from '../../../shared/api/queries';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';

interface SwapExerciseProps {
  isOpen: boolean;
  currentExerciseName: string;
  onSwap: (newName: string) => void;
  onCancel: () => void;
}

export function SwapExercise({ isOpen, currentExerciseName, onSwap, onCancel }: SwapExerciseProps) {
  const [name, setName] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { data: suggestions } = useExerciseSuggestions(name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setName('');
      setShowSuggestions(false);
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
    onSwap(finalName);
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
          className="w-full px-3 py-3 border rounded-lg dark:bg-gray-700
                     dark:border-gray-600 dark:text-white text-base"
        />

        {/* Autocomplete suggestions */}
        {showSuggestions && suggestions && suggestions.length > 0 && (
          <div className="absolute z-10 left-0 right-0 mt-1 bg-white dark:bg-surface-800
                          border dark:border-gray-600 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                className="w-full text-left px-3 py-3 text-base hover:bg-gray-100
                           dark:hover:bg-gray-700 transition-colors min-h-[44px]"
                onClick={() => handleSwap(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>

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

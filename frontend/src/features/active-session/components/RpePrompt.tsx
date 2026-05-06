import { useState } from 'react';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';

interface RpePromptProps {
    exerciseName: string;
    onSubmit: (rpe: number, note: string | null) => void;
    onSkip: () => void;
    isOpen: boolean;
}

/**
 * Modal prompt for per-exercise RPE rating (1-10 scale)
 * Shown when all target sets for an exercise are completed
 */
export function RpePrompt({ exerciseName, onSubmit, onSkip, isOpen }: RpePromptProps) {
    const [selectedRpe, setSelectedRpe] = useState<number | null>(null);
    const [note, setNote] = useState('');

    const handleSubmit = () => {
        if (selectedRpe !== null) {
            const trimmed = note.trim();
            onSubmit(selectedRpe, trimmed.length > 0 ? trimmed : null);
            setSelectedRpe(null);
            setNote('');
        }
    };

    const handleSkip = () => {
        setSelectedRpe(null);
        setNote('');
        onSkip();
    };

    return (
        <Modal isOpen={isOpen} onClose={handleSkip} title={`How hard was ${exerciseName}?`}>
            <div className="space-y-6">
                {/* RPE scale explanation */}
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Rate your perceived effort for this exercise (1 = very easy, 10 = max effort)
                </p>

                {/* RPE buttons in 2x5 grid */}
                <div className="grid grid-cols-5 gap-2">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                        <button
                            key={value}
                            onClick={() => setSelectedRpe(value)}
                            className={`w-12 h-12 rounded-lg text-lg font-bold transition-colors
                ${selectedRpe === value
                                    ? 'bg-primary-600 text-white ring-2 ring-primary-400'
                                    : value >= 8
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                                        : value >= 6
                                            ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200 dark:hover:bg-yellow-900/50'
                                            : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                                }`}
                        >
                            {value}
                        </button>
                    ))}
                </div>

                {/* Optional note */}
                <div>
                    <label htmlFor="rpe-note" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Note (optional)
                    </label>
                    <textarea
                        id="rpe-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={500}
                        rows={2}
                        placeholder="How did this exercise feel? (optional)"
                        className="w-full px-3 py-2 text-sm border rounded-lg
                                   border-gray-300 dark:border-gray-600
                                   bg-white dark:bg-gray-800
                                   text-gray-900 dark:text-gray-100
                                   placeholder-gray-400 dark:placeholder-gray-500
                                   focus:outline-none focus:ring-2 focus:ring-primary-500
                                   resize-none"
                    />
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                    <Button
                        variant="secondary"
                        size="lg"
                        onClick={handleSkip}
                        className="flex-1"
                    >
                        Skip
                    </Button>
                    <Button
                        variant="primary"
                        size="lg"
                        onClick={handleSubmit}
                        disabled={selectedRpe === null}
                        className="flex-1"
                    >
                        Submit
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

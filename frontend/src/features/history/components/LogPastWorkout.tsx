import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../shared/api/client';
import { useInvalidateHistoryReaders } from '../../../shared/api/queries';
import type { ActiveSession, StartSessionRequest } from '../../../shared/api/types';
import { Modal } from '../../../shared/ui/Modal';
import { Button } from '../../../shared/ui/Button';
import { useToast } from '../../../shared/ui/Toast';
import { AdHocWorkoutPicker, type WorkoutChoice } from '../../dashboard/components/AdHocWorkoutPicker';
import { localDateTime, toLocalInputs } from '../logic/editSession';

interface LogPastWorkoutProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * "Log a past workout": pick when, then what. The server creates the session
 * already completed (never active, never advances the rotation), and it opens
 * in the history editor.
 */
export function LogPastWorkout({ isOpen, onClose }: LogPastWorkoutProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidateHistoryReaders();
  const [date, setDate] = useState(() => toLocalInputs(new Date().toISOString()).date);
  const [time, setTime] = useState('18:00');
  const [durationStr, setDurationStr] = useState('60');
  const [picking, setPicking] = useState(false);

  const when = localDateTime(date, time);
  const future = when != null && when.getTime() > Date.now();
  const durationMin = Number.parseInt(durationStr, 10);
  const validDuration = Number.isInteger(durationMin) && durationMin >= 1 && durationMin <= 600;

  const create = useMutation({
    mutationFn: async (choice: WorkoutChoice) => {
      const body: StartSessionRequest = {
        completedAt: (when as Date).toISOString(),
        durationMin,
        ...(choice.kind === 'workout' && { workoutId: choice.workoutId }),
      };
      const { data } = await api.post<ActiveSession>('/sessions/start', body);
      return { session: data, choice };
    },
    onSuccess: ({ session, choice }) => {
      invalidate();
      const cardio = choice.kind === 'cardio' ? `?cardio=${choice.modality}` : '';
      navigate(`/history/${session.id}/edit${cardio}`);
    },
    onError: () => toast.error('Failed to log the workout'),
  });

  const inputClass = `w-full min-h-[44px] px-2 rounded-lg border border-gray-200 dark:border-surface-700
                      bg-white dark:bg-surface-800`;

  return (
    <>
      <Modal isOpen={isOpen && !picking} onClose={onClose} title="Log past workout">
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-600 dark:text-gray-300">Date</span>
            <input type="date" value={date} max={toLocalInputs(new Date().toISOString()).date}
              onChange={(e) => setDate(e.target.value)} className={inputClass} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">Finished at</span>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputClass} />
            </label>
            <label className="block text-sm">
              <span className="text-gray-600 dark:text-gray-300">Minutes</span>
              <input inputMode="numeric" value={durationStr}
                onChange={(e) => setDurationStr(e.target.value)} className={inputClass} />
            </label>
          </div>
          {future && <p className="text-sm text-red-600 dark:text-red-400">Can't be in the future</p>}
          <Button className="w-full" disabled={!when || future || !validDuration || create.isPending}
            onClick={() => setPicking(true)}>
            Choose workout
          </Button>
        </div>
      </Modal>
      <AdHocWorkoutPicker
        isOpen={isOpen && picking}
        title="What did you do?"
        disabled={create.isPending}
        onClose={() => { setPicking(false); onClose(); }}
        onChoose={(choice) => create.mutate(choice)}
      />
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSession, useSetExerciseNote } from '../../shared/api/queries';
import { CARDIO_MODALITY_INFO } from '../../shared/api/cardio';
import { isCardioExercise } from '../../shared/api/predicates';
import type { ActiveSession, CardioModality, Set } from '../../shared/api/types';
import { Button } from '../../shared/ui/Button';
import { AddExercise } from '../active-session/components/AddExercise';
import { EditExerciseCard } from './components/edit/EditExerciseCard';
import { useSessionEdits } from './hooks/useSessionEdits';
import { useDeleteSession } from './hooks/useHistory';
import { groupSetsByExercise, localDateTime, toLocalInputs, unloggedSlots } from './logic/editSession';

interface ExtraCard {
  name: string;
  exerciseId: number | null;
  cardio: boolean;
}

/**
 * Edit a completed session (v4 C1): sets, notes, added exercises, the date.
 * Also where "Log past workout" lands. Shares nothing with the live session's
 * logging flow; no previous-session hints (they have no "before this session" bound).
 */
export default function SessionEditor() {
  const { id } = useParams<{ id: string }>();
  const sessionId = Number(id);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data, isLoading, error } = useSession(sessionId);
  const session = data as ActiveSession | undefined;
  const edits = useSessionEdits(sessionId);
  const setNote = useSetExerciseNote(sessionId);
  const deleteSession = useDeleteSession();

  // Cards with no sets yet: a picked program slot, an added exercise, or the
  // cardio choice from "Log past workout" (?cardio=<modality>).
  const [extras, setExtras] = useState<ExtraCard[]>(() => {
    const modality = searchParams.get('cardio') as CardioModality | null;
    return modality && CARDIO_MODALITY_INFO[modality]
      ? [{ name: CARDIO_MODALITY_INFO[modality].short, exerciseId: null, cardio: true }]
      : [];
  });

  const groups = useMemo(() => groupSetsByExercise(session?.sets ?? []), [session?.sets]);
  const loggedNames = groups.map(g => g.name);
  // A session that opens with no sets (a just-logged past workout) starts with every
  // program slot as a card; held in state so they don't collapse to chips mid-entry.
  const seededSlots = useRef(false);
  useEffect(() => {
    if (!session || seededSlots.current) return;
    seededSlots.current = true;
    if ((session.sets ?? []).length > 0) return;
    const slots = unloggedSlots(session.exercises, [])
      .map(ex => ({ name: ex.name, exerciseId: ex.id, cardio: isCardioExercise(ex) }));
    setExtras(prev => [...slots, ...prev]);
  }, [session]);

  const cards = [
    ...groups,
    ...extras
      .filter(e => !loggedNames.includes(e.name))
      .map(e => ({ ...e, sets: [] as Set[] })),
  ];
  const notLogged = unloggedSlots(session?.exercises, cards.map(c => c.name));

  const addCard = (card: ExtraCard) => {
    if (cards.some(c => c.name.toLowerCase() === card.name.toLowerCase())) return;
    setExtras(prev => [...prev, card]);
  };

  const handleDeleteSet = (set: Set) => {
    const group = groups.find(g => g.name === set.exerciseName);
    const lastOfExercise = group?.sets.length === 1;
    edits.deleteSet.mutate(set.id);
    // Notes are keyed by exercise name: the exercise leaves the session with its last set.
    if (lastOfExercise && session?.exerciseNotes?.[set.exerciseName]) {
      setNote.mutate({ exerciseName: set.exerciseName, note: null });
    }
  };

  if (isLoading) {
    return <div className="card animate-pulse h-32" />;
  }
  if (error || !session) {
    return (
      <div className="card text-red-600 dark:text-red-400">
        Couldn't load this session. <Link to="/history" className="underline">Back to history</Link>
      </div>
    );
  }
  if (!session.completedAt) {
    // In progress: edits happen in the live session.
    return (
      <div className="card">
        This workout is still in progress.{' '}
        <Link to={`/workout/${session.id}`} className="text-primary-600 underline">Resume it</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between gap-2">
        <Link to={`/history?sessionId=${session.id}`} className="text-sm text-primary-600 min-h-[44px] flex items-center">
          ← History
        </Link>
        <span className="text-xs text-gray-500 dark:text-gray-400">Editing</span>
      </div>

      <div className="card space-y-3">
        <div>
          <h1 className="text-xl font-display font-bold">{session.workoutName}</h1>
          {session.programName !== 'Ad-hoc' && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{session.programName}</p>
          )}
        </div>
        <SessionDateField
          key={session.completedAt}
          completedAt={session.completedAt}
          createdAt={session.createdAt}
          saving={edits.setDate.isPending}
          onSave={(iso) => edits.setDate.mutate(iso)}
        />
      </div>

      {cards.map(card => (
        <EditExerciseCard
          key={card.name}
          name={card.name}
          exerciseId={card.exerciseId}
          cardio={card.cardio}
          sets={card.sets}
          note={session.exerciseNotes?.[card.name]}
          onAddSet={(body) => edits.addSet.mutate(body)}
          onUpdateSet={(setId, patch) => edits.updateSet.mutate({ setId, patch })}
          onDeleteSet={handleDeleteSet}
          onSetNote={(note) => setNote.mutate({ exerciseName: card.name, note })}
        />
      ))}

      {cards.length === 0 && (
        <div className="card text-center text-sm text-gray-500 dark:text-gray-400">
          No sets in this session. Add an exercise below, or delete the session.
        </div>
      )}

      {notLogged.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm text-gray-500 dark:text-gray-400">Not logged</div>
          <div className="flex flex-wrap gap-2">
            {notLogged.map(ex => (
              <button
                key={ex.id}
                type="button"
                onClick={() => addCard({ name: ex.name, exerciseId: ex.id, cardio: isCardioExercise(ex) })}
                className="px-3 min-h-[44px] rounded-full text-sm bg-gray-100 dark:bg-surface-800
                           hover:bg-gray-200 dark:hover:bg-surface-700"
              >
                + {ex.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <AddExercise
        onAdd={(ex) => addCard({ name: ex.name, exerciseId: null, cardio: ex.exerciseType === 'cardio' })}
      />

      <Button
        variant="ghost"
        className="w-full text-red-600 dark:text-red-400"
        disabled={deleteSession.isPending}
        onClick={() => {
          if (!confirm('Delete this session and all its sets?')) return;
          deleteSession.mutate(session.id, { onSuccess: () => navigate('/history') });
        }}
      >
        Delete session
      </Button>
    </div>
  );
}

function SessionDateField({ completedAt, createdAt, saving, onSave }: {
  completedAt: string;
  createdAt: string;
  saving: boolean;
  onSave: (iso: string) => void;
}) {
  const initial = toLocalInputs(completedAt);
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const picked = localDateTime(date, time);
  const changed = date !== initial.date || time !== initial.time;
  const future = picked != null && picked.getTime() > Date.now();
  const minutes = Math.round((Date.parse(completedAt) - Date.parse(createdAt)) / 60000);
  const inputClass = `min-h-[44px] px-2 rounded-lg border border-gray-200 dark:border-surface-700
                      bg-white dark:bg-surface-800`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" aria-label="Date" value={date} max={toLocalInputs(new Date().toISOString()).date}
          onChange={(e) => setDate(e.target.value)} className={inputClass} />
        <input type="time" aria-label="Finished at" value={time}
          onChange={(e) => setTime(e.target.value)} className={inputClass} />
        <span className="text-sm text-gray-500 dark:text-gray-400">{minutes} min</span>
      </div>
      {changed && (
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!picked || future || saving} onClick={() => picked && onSave(picked.toISOString())}>
            {saving ? 'Saving…' : 'Save date'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setDate(initial.date); setTime(initial.time); }}>
            Cancel
          </Button>
          {future && <span className="text-sm text-red-600 dark:text-red-400">Can't be in the future</span>}
        </div>
      )}
    </div>
  );
}

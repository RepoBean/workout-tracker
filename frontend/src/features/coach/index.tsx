import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAiCoach, isCoachReady } from '../../shared/context/AiCoachContext';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import { useToast } from '../../shared/ui/Toast';
import type { ProgramExportPayload } from '../../shared/api/types';
import { useProgramMutations } from '../program-builder/hooks/usePrograms';
import { createProvider } from './lib/providers';
import { createCoachToolset } from './lib/tools';
import { runCoach } from './lib/coachLoop';
import { COACH_SYSTEM_PROMPT } from './lib/persona';
import {
  DisplayMessage,
  clearThread,
  loadThread,
  saveThread,
  toCoachMessages,
} from './lib/thread';

const STARTERS: Array<{ label: string; prompt: string }> = [
  { label: 'Plan next workout', prompt: 'What should I do in my next workout?' },
  { label: 'Review last week', prompt: 'Review how my training has gone over the last week.' },
  { label: 'Build a program', prompt: 'Help me build a new training program.' },
];

function DisabledState() {
  return (
    <div className="card max-w-md mx-auto text-center space-y-4">
      <h1 className="text-xl font-display font-bold">AI Coach</h1>
      <p className="text-gray-600 dark:text-gray-400">
        Add an API key and pick a model to start chatting with your coach.
      </p>
      <Link to="/settings" className="inline-block">
        <Button variant="primary">Open Settings</Button>
      </Link>
    </div>
  );
}

export default function Coach() {
  const { settings } = useAiCoach();
  const toast = useToast();
  const { importProgram } = useProgramMutations();

  const [thread, setThread] = useState<DisplayMessage[]>(() => loadThread());
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState('');
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<ProgramExportPayload | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const toolset = useMemo(
    () => createCoachToolset({ onProposeProgram: setImportPreview }),
    []
  );

  useEffect(() => {
    saveThread(thread);
  }, [thread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [thread, draft, toolStatus]);

  const ready = isCoachReady(settings);
  if (!ready) return <DisabledState />;

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const base: DisplayMessage[] = [...thread, { role: 'user', content }];
    setThread(base);
    setInput('');
    setBusy(true);
    setDraft('');
    setToolStatus(null);

    try {
      const provider = createProvider(settings);
      const result = await runCoach({
        provider,
        system: COACH_SYSTEM_PROMPT,
        messages: toCoachMessages(base),
        tools: toolset.defs,
        executeTool: toolset.execute,
        onTurnStart: () => setDraft(''),
        onTextDelta: (d) => setDraft((prev) => prev + d),
        onToolStart: (call) => setToolStatus(toolset.describe(call)),
      });
      setThread([...base, { role: 'assistant', content: result.finalText || '(no response)' }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(message);
      setThread([...base, { role: 'assistant', content: `⚠️ ${message}` }]);
    } finally {
      setBusy(false);
      setDraft('');
      setToolStatus(null);
    }
  }

  function handleNewChat() {
    if (busy) return;
    clearThread();
    setThread([]);
    setDraft('');
    setToolStatus(null);
  }

  function confirmImport() {
    if (!importPreview) return;
    importProgram.mutate(importPreview, { onSuccess: () => setImportPreview(null) });
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col min-h-[60vh]">
      <div className="flex items-center justify-between mb-3">
        <h1 className="text-2xl font-display font-bold">AI Coach</h1>
        <button
          onClick={handleNewChat}
          disabled={busy || thread.length === 0}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-40"
        >
          New chat
        </button>
      </div>

      <div className="flex-1 space-y-3">
        {thread.length === 0 && !busy && (
          <div className="card text-center text-gray-600 dark:text-gray-400">
            <p className="font-medium text-gray-800 dark:text-gray-200">Hey — ready to train?</p>
            <p className="text-sm mt-1">
              Ask me about your next workout, recent progress, or PRs. I read your logged history.
            </p>
          </div>
        )}

        {thread.map((msg, i) => (
          <div
            key={i}
            className={msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap break-words ${
                msg.role === 'user'
                  ? 'bg-primary-600 text-white rounded-br-sm'
                  : 'bg-white dark:bg-surface-800 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-white/[0.06] rounded-bl-sm'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm whitespace-pre-wrap break-words bg-white dark:bg-surface-800 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-white/[0.06]">
              {draft ? (
                draft
              ) : toolStatus ? (
                <span className="text-gray-500 dark:text-gray-400 italic">{toolStatus}</span>
              ) : (
                <span className="text-gray-400 dark:text-gray-500">Thinking…</span>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-20 mt-3 pt-2 bg-surface-50/90 dark:bg-surface-900/90 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {STARTERS.map((s) => (
            <button
              key={s.label}
              onClick={() => setInput(s.prompt)}
              disabled={busy}
              className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-gray-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-gray-700 dark:text-gray-300 hover:border-primary-300 dark:hover:border-primary-700 disabled:opacity-40"
            >
              {s.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex gap-2 items-end"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask your coach…"
            disabled={busy}
            className="flex-1 resize-none max-h-32 px-3 py-2.5 border-2 rounded-lg border-gray-200 dark:border-surface-800 bg-white dark:bg-surface-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
          <Button type="submit" variant="primary" disabled={busy || !input.trim()}>
            Send
          </Button>
        </form>
      </div>

      <Modal
        isOpen={!!importPreview}
        onClose={() => setImportPreview(null)}
        title="Add this workout?"
      >
        {importPreview && (
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Program:</span> {importPreview.program.name}
              </p>
              <p>
                <span className="font-medium">Workouts:</span>{' '}
                {importPreview.program.workouts.length}
              </p>
              <p>
                <span className="font-medium">Total exercises:</span>{' '}
                {importPreview.program.workouts.reduce((sum, w) => sum + w.exercises.length, 0)}
              </p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This creates a new program. Start it any time from Quick Workout on the home screen.
            </p>
            <div className="flex gap-2">
              <Button onClick={confirmImport} disabled={importProgram.isPending}>
                Import
              </Button>
              <Button variant="secondary" onClick={() => setImportPreview(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

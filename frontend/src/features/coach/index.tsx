import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAiCoach, isCoachReady } from '../../shared/context/AiCoachContext';
import { Button } from '../../shared/ui/Button';
import { Modal } from '../../shared/ui/Modal';
import type { ProgramExportPayload } from '../../shared/api/types';
import { exerciseTargetSummary } from '../../shared/api/cardio';
import { useImportProgram } from '../../shared/api/queries';
import { CoachMarkdown } from './components/CoachMarkdown';
import { createCoachToolset } from './lib/tools';
import { runCoach } from './lib/coachLoop';
import { COACH_SYSTEM_PROMPT } from './lib/persona';
import { useCoachDossier } from './hooks/useCoachDossier';
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
  const importProgram = useImportProgram();

  const [thread, setThread] = useState<DisplayMessage[]>(() => loadThread());
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState('');
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<ProgramExportPayload | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const { dossier, isReady, error: dossierError, retry: retryDossier } = useCoachDossier();
  // Pinned on the first send of a thread. The dossier is assembled from live queries, and a
  // background refetch mid-conversation would change it byte-for-byte and silently kill every
  // prompt-cache hit. Stability has to be structural, not a matter of discipline.
  const pinnedDossierRef = useRef<string | null>(null);

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

  // The persona promises a dossier follows; never call the provider without one. A thread
  // already in flight keeps its pinned copy even if the live one is momentarily rebuilding.
  const canSend = isReady || pinnedDossierRef.current !== null;

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    if (pinnedDossierRef.current === null) {
      if (!dossier) return;
      pinnedDossierRef.current = dossier;
    }
    const pinned = pinnedDossierRef.current;
    const base: DisplayMessage[] = [...thread, { role: 'user', content }];
    setThread(base);
    setInput('');
    setBusy(true);
    setDraft('');
    setToolStatus(null);

    try {
      // Provider stack (incl. @anthropic-ai/sdk) loads on first send, not with the page.
      const { createProvider } = await import('./lib/providers');
      const provider = createProvider(settings);
      const result = await runCoach({
        provider,
        system: COACH_SYSTEM_PROMPT,
        systemCacheable: pinned,
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
      setThread([...base, { role: 'assistant', content: `⚠️ ${message}`, error: true }]);
    } finally {
      setBusy(false);
      setDraft('');
      setToolStatus(null);
    }
  }

  function handleNewChat() {
    if (busy) return;
    // New conversation, new prefix — let the next send pin a fresh dossier.
    pinnedDossierRef.current = null;
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
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm break-words ${
                msg.role === 'user'
                  ? 'bg-primary-600 text-white rounded-br-sm whitespace-pre-wrap'
                  : 'bg-white dark:bg-surface-800 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-white/[0.06] rounded-bl-sm'
              }`}
            >
              {msg.error ? (
                <span className="text-red-600 dark:text-red-400">{msg.content}</span>
              ) : msg.role === 'assistant' ? (
                <CoachMarkdown content={msg.content} />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm break-words bg-white dark:bg-surface-800 text-gray-900 dark:text-gray-100 border border-gray-100 dark:border-white/[0.06]">
              {draft ? (
                <CoachMarkdown content={draft} />
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

      <div className="sticky bottom-[calc(56px+env(safe-area-inset-bottom))] mt-3 pt-2 bg-surface-50/90 dark:bg-surface-900/90 backdrop-blur">
        {!canSend && (
          dossierError ? (
            <div className="flex items-center justify-between gap-2 pb-2 text-xs text-red-600 dark:text-red-400">
              <span>Couldn't load your training history.</span>
              <button
                onClick={retryDossier}
                className="shrink-0 font-medium text-primary-600 dark:text-primary-400 hover:underline"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="pb-2 text-xs text-gray-500 dark:text-gray-400">Loading your training history…</p>
          )
        )}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
          {STARTERS.map((s) => (
            <button
              key={s.label}
              onClick={() => send(s.prompt)}
              disabled={busy || !canSend}
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
            disabled={busy || !canSend}
            className="flex-1 resize-none max-h-32 px-3 py-2.5 border-2 rounded-lg border-gray-200 dark:border-surface-800 bg-white dark:bg-surface-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-primary-500"
          />
          <Button type="submit" variant="primary" disabled={busy || !canSend || !input.trim()}>
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
            <p className="text-sm">
              <span className="font-medium">Program:</span> {importPreview.program.name}
            </p>
            {/* Model-generated — show exactly what will be created, not just counts. */}
            <div className="max-h-[45vh] overflow-y-auto space-y-3 rounded-lg border border-gray-200 dark:border-surface-700 p-3">
              {importPreview.program.workouts.map((w, wi) => (
                <div key={wi}>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{w.name}</p>
                  <ul className="mt-1 space-y-0.5">
                    {w.exercises.map((e, ei) => (
                      <li key={ei} className="flex justify-between gap-3 text-sm text-gray-600 dark:text-gray-400">
                        <span className="min-w-0 break-words">
                          {e.supersetGroup && (
                            <span className="mr-1 text-xs font-medium text-accent-600 dark:text-accent-400">
                              {e.supersetGroup}
                            </span>
                          )}
                          {e.name}
                        </span>
                        <span className="shrink-0 tabular-nums">{exerciseTargetSummary(e)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
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

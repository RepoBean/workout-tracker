import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { HeartRateProvider, useHeartRate } from '../../../shared/context/HeartRateContext';
import { encodeHrSamples, decodeHrSamples } from '../../../shared/utils/heartRate';
import { getHrSamplesStorageKey } from '../lib/sessionStorage';
import { useHrPersistence } from './useHrPersistence';

const SESSION_ID = 42;

const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(HeartRateProvider, null, children);

// Recent timestamps so restoreSamples' 3-hour retention window keeps them.
const base = () => Date.now() - 60_000;

function renderWithPersistence(sessionStartMs: number, isSessionActive = true) {
    return renderHook(
        () => {
            useHrPersistence({ sessionId: SESSION_ID, sessionStartMs, isSessionActive });
            return useHeartRate();
        },
        { wrapper }
    );
}

describe('HeartRateContext.restoreSamples', () => {
    beforeEach(() => localStorage.clear());

    it('merges, sorts, dedupes, and drops invalid samples', () => {
        const start = base();
        const { result } = renderHook(() => useHeartRate(), { wrapper });

        act(() => {
            result.current.restoreSamples([
                { ts: start + 2000, bpm: 120 },
                { ts: start + 1000, bpm: 110 },
                { ts: start + 1000, bpm: 110 }, // duplicate within batch
                { ts: NaN, bpm: 100 },
                { ts: start + 3000, bpm: 999 }, // implausible bpm
            ]);
        });

        expect(result.current.samplesSince(0)).toEqual([
            { ts: start + 1000, bpm: 110 },
            { ts: start + 2000, bpm: 120 },
        ]);
    });

    it('does not duplicate samples already in the buffer on a second restore', () => {
        const start = base();
        const { result } = renderHook(() => useHeartRate(), { wrapper });
        const samples = [{ ts: start + 1000, bpm: 110 }];

        act(() => result.current.restoreSamples(samples));
        act(() => result.current.restoreSamples(samples));

        expect(result.current.samplesSince(0)).toEqual(samples);
    });
});

describe('useHrPersistence', () => {
    beforeEach(() => localStorage.clear());

    it('restores persisted samples into the buffer on mount', () => {
        const start = base();
        const stored = [
            { ts: start + 1000, bpm: 98 },
            { ts: start + 2000, bpm: 104 },
        ];
        localStorage.setItem(
            getHrSamplesStorageKey(SESSION_ID),
            encodeHrSamples(stored, start)
        );

        const { result } = renderWithPersistence(start);

        expect(result.current.samplesSince(0)).toEqual(stored);
    });

    it('flushes the buffer back to localStorage on pagehide', () => {
        const start = base();
        const stored = [{ ts: start + 1000, bpm: 98 }];
        const key = getHrSamplesStorageKey(SESSION_ID);
        localStorage.setItem(key, encodeHrSamples(stored, start));

        renderWithPersistence(start);
        localStorage.removeItem(key);

        act(() => {
            window.dispatchEvent(new Event('pagehide'));
        });

        expect(decodeHrSamples(localStorage.getItem(key))).toEqual(stored);
    });

    it('does nothing while the session is not active', () => {
        const start = base();
        const stored = [{ ts: start + 1000, bpm: 98 }];
        const key = getHrSamplesStorageKey(SESSION_ID);
        localStorage.setItem(key, encodeHrSamples(stored, start));

        const { result } = renderWithPersistence(start, false);

        expect(result.current.samplesSince(0)).toEqual([]);

        localStorage.removeItem(key);
        act(() => {
            window.dispatchEvent(new Event('pagehide'));
        });
        expect(localStorage.getItem(key)).toBeNull();
    });
});

import { describe, expect, it } from 'vitest';
import type { CatalogEntry } from '../../../shared/api/types';
import { searchExerciseNames } from './exerciseSearch';

const entry = (id: number, name: string, aliases: string[] = []): CatalogEntry => ({
    id, name, aliases, setCount: 0, exerciseCount: 0, createdAt: '', updatedAt: '',
});

// Main's shape: the merge kept "Dumbbell", so "Low Incline DB Press" is only an alias.
const CATALOG = [
    entry(1, 'Low Incline Dumbbell Press', ['Low Incline DB Press']),
    entry(2, 'Leg Press'),
    entry(3, 'Dumbbell Row'),
    entry(4, 'Incline Bench'),
];
const CANDIDATES = ['Leg Press', 'Low Incline Dumbbell Press', 'Dumbbell Row', 'Incline Bench'];

describe('searchExerciseNames', () => {
    it('needs at least two characters', () => {
        expect(searchExerciseNames('', CANDIDATES, CATALOG)).toEqual([]);
        expect(searchExerciseNames('l', CANDIDATES, CATALOG)).toEqual([]);
    });

    it('matches case-insensitively, name prefix before word prefix before substring', () => {
        expect(searchExerciseNames('INC', CANDIDATES, CATALOG)).toEqual([
            'Incline Bench', 'Low Incline Dumbbell Press',
        ]);
        expect(searchExerciseNames('ress', CANDIDATES, CATALOG)).toEqual([
            'Leg Press', 'Low Incline Dumbbell Press',
        ]);
    });

    it('matches a catalog alias and returns the catalog name', () => {
        expect(searchExerciseNames('db', CANDIDATES, CATALOG)).toEqual(['Low Incline Dumbbell Press']);
        expect(searchExerciseNames('low incline db', CANDIDATES, CATALOG)).toEqual(['Low Incline Dumbbell Press']);
    });

    it('never offers a name outside the candidates (a merged alias is not one)', () => {
        expect(searchExerciseNames('Low', ['Leg Press'], CATALOG)).toEqual([]);
        expect(searchExerciseNames('Low Incline DB', CANDIDATES, CATALOG)).not.toContain('Low Incline DB Press');
    });

    it('works without a catalog and dedupes candidates', () => {
        expect(searchExerciseNames('press', ['Leg Press', 'Leg Press'], undefined)).toEqual(['Leg Press']);
    });

    it('caps the result list', () => {
        const many = Array.from({ length: 12 }, (_, i) => `Curl ${i}`);
        expect(searchExerciseNames('curl', many, [], 8)).toHaveLength(8);
    });
});

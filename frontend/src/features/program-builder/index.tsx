import { Link } from 'react-router-dom';

export default function ProgramBuilder() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Programs</h1>
        <button className="btn-primary" disabled>
          + New Program
        </button>
      </div>

      <div className="card">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Program builder will be implemented in Phase 5. This page will allow you to:
        </p>
        <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
          <li>Create and manage workout programs</li>
          <li>Add workouts to programs</li>
          <li>Configure exercises with target sets/reps</li>
          <li>Set up supersets</li>
          <li>Reorder workouts and exercises</li>
        </ul>
      </div>

      <Link
        to="/"
        className="inline-block text-primary-600 hover:text-primary-700 font-medium"
      >
        ← Back to Dashboard
      </Link>
    </div>
  );
}

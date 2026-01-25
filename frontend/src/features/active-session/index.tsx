import { useParams, Link } from 'react-router-dom';

export default function ActiveSession() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Workout Session</h1>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Session ID: {id}
        </span>
      </div>

      <div className="card">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          Active session UI will be implemented in Phase 2. This is the core gym experience
          and will include:
        </p>
        <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
          <li>Exercise cards with set logging</li>
          <li>Weight/reps/RPE input</li>
          <li>Previous workout data display</li>
          <li>Rest timer with notifications</li>
          <li>Plate calculator</li>
          <li>Optimistic UI updates</li>
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

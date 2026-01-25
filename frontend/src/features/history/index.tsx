import { Link } from 'react-router-dom';

export default function History() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Workout History</h1>

      <div className="card">
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          History view will be implemented in Phase 5. This page will show:
        </p>
        <ul className="list-disc list-inside text-gray-600 dark:text-gray-400 space-y-2">
          <li>Past workout sessions</li>
          <li>Exercise progress over time</li>
          <li>Volume and frequency analytics</li>
          <li>Calendar view with workout indicators</li>
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

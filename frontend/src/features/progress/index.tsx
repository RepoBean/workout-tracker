import { useState } from 'react';
import { ExerciseProgressTab } from './components/ExerciseProgressTab';
import { VolumeTrendsTab } from './components/VolumeTrendsTab';
import { PersonalRecordsTab } from './components/PersonalRecordsTab';

type TabId = 'exercise' | 'volume' | 'records';

const tabs: { id: TabId; label: string }[] = [
    { id: 'exercise', label: 'Exercise Progress' },
    { id: 'volume', label: 'Volume Trends' },
    { id: 'records', label: 'Personal Records' },
];

export default function Progress() {
    const [activeTab, setActiveTab] = useState<TabId>('exercise');

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-display font-bold">Progress</h1>

            {/* Tab navigation */}
            <div className="flex gap-2 overflow-x-auto pb-2">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap min-h-[44px]
              ${activeTab === tab.id
                                ? 'bg-primary-600 text-white'
                                : 'bg-gray-100 dark:bg-surface-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'exercise' && <ExerciseProgressTab />}

            {activeTab === 'volume' && <VolumeTrendsTab />}

            {activeTab === 'records' && <PersonalRecordsTab />}
        </div>
    );
}


import { sequelize, Session, Set } from '../src/models/index.js';

const CSV_DATA = `Date,Program,Workout,Exercise,SetNumber,Weight,Reps,RPE,Volume
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Pec fly",1,50,10,,500
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Pec fly",2,70,10,,700
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Pec fly",3,70,10,7,700
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Leg Press",1,165,10,,1650
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",1,100,10,,1000
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Leg Press",2,165,10,,1650
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",2,100,10,,1000
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Leg Press",3,165,10,7,1650
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",3,100,10,8,1000
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",1,55,12,,660
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",2,55,10,,550
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",3,55,10,8,550
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",1,52.5,12,,630
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",2,55,12,,660
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",3,55,12,7,660
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",1,90,10,,900
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",1,100,10,,1000
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",2,90,8,,720
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",2,100,10,,1000
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",3,90,6,10,540
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",3,100,10,8,1000
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Glute bridge",1,45,10,,450
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Glute bridge",2,40,10,,400
2026-01-28,"Full Body Strength (3 Days)","Full Body Day","Glute bridge",3,40,10,8,400
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Leg Press",1,165,10,,1650
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",1,100,10,,1000
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Leg Press",2,165,10,,1650
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",2,100,10,,1000
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Leg Press",3,165,10,7,1650
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",3,100,9,7,900
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",1,52.5,10,,525
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",2,52.5,10,,525
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",3,52.5,10,7,525
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",1,52.5,12,,630
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",2,52.5,12,,630
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",3,52.5,12,8,630
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",1,80,10,,800
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",1,100,10,,1000
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",2,80,10,,800
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",2,100,10,,1000
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",3,80,10,8,800
2026-01-26,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",3,100,10,8,1000
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Leg Press",1,160,10,,1600
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",1,100,10,,1000
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Leg Press",2,160,10,,1600
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",2,100,10,,1000
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Leg Press",3,160,12,8,1920
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",3,100,8,9,800
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",1,52.5,10,,525
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",2,52.5,10,,525
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",3,52.5,10,8,525
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",1,52.5,12,,630
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",2,52.5,12,,630
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",3,52.5,12,8,630
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",1,80,10,,800
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",1,100,10,,1000
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",2,80,10,,800
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",2,100,10,,1000
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",3,80,10,8,800
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",3,100,10,8,1000
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Hip Abduction Machine",1,67.5,10,,675
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Hip Abduction Machine",2,67.5,10,,675
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Hip Abduction Machine",3,67.5,10,6,675
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Tricep Extension Machine",1,40,12,,480
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Tricep Extension Machine",2,60,12,,720
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Tricep Extension Machine",3,70,12,7,840
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Pec fly",1,60,10,,600
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Pec fly",2,60,10,,600
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Pec fly",3,60,10,8,600
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Bicep Curl Machine",1,15,10,,150
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Bicep Curl Machine",2,30,6,,180
2026-01-23,"Full Body Strength (3 Days)","Full Body Day","Bicep Curl Machine",3,30,5,8,150
2026-01-22,"Kajja","Day 1","Hip abduction",1,10,10,,100
2026-01-22,"Kajja","Day 1","Hip abduction",2,10,10,,100
2026-01-22,"Kajja","Day 1","Hip abduction",3,10,10,7,100
2026-01-22,"Kajja","Day 1","Hip thrust",1,10,15,,150
2026-01-22,"Kajja","Day 1","Hip thrust",2,10,15,,150
2026-01-22,"Kajja","Day 1","Hip thrust",3,10,18,7,180
2026-01-22,"Kajja","Day 1","Hamstring stretch",1,20,30,,600
2026-01-22,"Kajja","Day 1","Hamstring stretch",2,20,30,,600
2026-01-22,"Kajja","Day 1","Hamstring stretch",3,20,30,7,600
2026-01-22,"Kajja","Day 1","Bird dog",1,10,10,,100
2026-01-22,"Kajja","Day 1","Bird dog",2,10,10,,100
2026-01-22,"Kajja","Day 1","Bird dog",3,10,10,7,100
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Leg Press",1,160,10,,1600
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",1,100,10,,1000
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Leg Press",2,160,10,,1600
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Leg Press",3,160,10,7,1600
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",2,105,10,,1050
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",3,100,8,7,800
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",1,50,10,,500
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",2,50,10,,500
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",3,52.5,10,8,525
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",1,52.5,12,,630
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",2,52.5,12,,630
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",3,52.5,12,8,630
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",1,80,12,,960
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",1,100,10,,1000
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",2,80,10,,800
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",2,100,10,,1000
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",3,80,9,9,720
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",3,100,10,8,1000
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Glute kick",1,50,8,,400
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Glute kick",2,50,10,,500
2026-01-21,"Full Body Strength (3 Days)","Full Body Day","Glute kick",3,50,10,7,500
2026-01-10,"Kajja","Day 1","Hip abduction",1,10,10,,100
2026-01-10,"Kajja","Day 1","Hip abduction",2,10,10,,100
2026-01-10,"Kajja","Day 1","Hip abduction",3,10,10,5,100
2026-01-10,"Kajja","Day 1","Hip thrust",1,10,10,,100
2026-01-10,"Kajja","Day 1","Hip thrust",2,10,10,,100
2026-01-10,"Kajja","Day 1","Hip thrust",3,10,10,5,100
2026-01-10,"Kajja","Day 1","Hamstring stretch",1,20,30,,600
2026-01-10,"Kajja","Day 1","Hamstring stretch",2,20,30,,600
2026-01-10,"Kajja","Day 1","Hamstring stretch",3,20,30,5,600
2026-01-10,"Kajja","Day 1","Bird dog",1,10,10,,100
2026-01-10,"Kajja","Day 1","Bird dog",2,10,10,,100
2026-01-10,"Kajja","Day 1","Bird dog",3,10,10,5,100
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Leg Press",1,160,10,,1600
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",1,100,10,,1000
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Leg Press",2,160,10,,1600
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",2,100,10,,1000
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Leg Press",3,160,12,7,1920
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",3,100,10,8,1000
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",1,50,10,,500
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",2,50,10,,500
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",3,50,10,6,500
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",1,50,12,,600
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",1,80,12,,960
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",1,100,10,,1000
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",2,80,10,,800
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",2,100,10,,1000
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",3,80,9,8,720
2026-01-09,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",3,100,10,9,1000
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Leg Press",1,140,10,,1400
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",1,100,10,,1000
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Leg Press",2,140,10,,1400
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",2,100,10,,1000
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Leg Press",3,140,13,3,1820
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",3,100,8,4,800
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",1,80,10,,800
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",2,90,10,,900
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",3,90,10,4,900
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",1,50,8,,400
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",2,50,8,,400
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",3,50,8,4,400
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",1,100,8,,800
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",2,100,10,,1000
2026-01-05,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",3,100,10,3,1000
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Leg Press",1,140,10,,1400
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",1,100,10,,1000
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Leg Press",2,140,10,,1400
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",2,100,10,,1000
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Leg Press",3,140,12,3,1680
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",3,100,8,4,800
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",1,80,10,,800
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",1,100,10,,1000
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",2,80,10,,800
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",2,100,10,,1000
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",3,80,10,3,800
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",3,100,8,3,800
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",1,50,12,,600
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",2,50,12,,600
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",3,50,12,4,600
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",1,50,10,,500
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",2,50,10,,500
2026-01-02,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",3,50,8,4,400
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Leg Press",1,140,10,,1400
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Leg Press",2,140,10,,1400
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Leg Press",3,140,10,3,1400
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",1,76,10,,760
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",2,75,10,,750
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Chest Press Machine",3,75,10,3,750
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",1,100,10,,1000
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",2,100,10,,1000
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Lat Pulldown Machine",3,100,10,3,1000
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",1,50,10,,500
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",2,50,10,,500
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Shoulder Press Machine",3,50,10,3,500
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",1,50,12,,600
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",2,50,12,,600
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Leg Curl Machine",3,50,10,3,500
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",1,100,10,,1000
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",2,100,10,,1000
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Seated Row Machine",3,100,10,3,1000
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Calf Raise Machine",1,45,10,,450
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Calf Raise Machine",2,45,10,,450
2025-12-31,"Full Body Strength (3 Days)","Full Body Day","Calf Raise Machine",3,45,10,3,450`;

interface CsvRow {
    Date: string;
    Program: string;
    Workout: string;
    Exercise: string;
    SetNumber: number;
    Weight: number;
    Reps: number;
    RPE: number | null;
    Volume: number;
}

// Simple CSV parser that handles quoted strings
function parseCSV(csvText: string): CsvRow[] {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    const result: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Split by comma, but ignore commas inside quotes
        const values: string[] = [];
        let current = '';
        let inQuotes = false;

        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current);

        // Remove quotes from values
        const cleanValues = values.map(v => v.replace(/^"|"$/g, ''));

        result.push({
            Date: cleanValues[0],
            Program: cleanValues[1],
            Workout: cleanValues[2],
            Exercise: cleanValues[3],
            SetNumber: parseInt(cleanValues[4], 10),
            Weight: parseFloat(cleanValues[5]),
            Reps: parseInt(cleanValues[6], 10),
            RPE: cleanValues[7] ? parseFloat(cleanValues[7]) : null,
            Volume: parseFloat(cleanValues[8])
        });
    }

    return result;
}

async function importLegacyData() {
    // Sync DB first to ensure tables exist
    await sequelize.sync();
    console.log('Database synced.');

    const rows = parseCSV(CSV_DATA);
    console.log(`Parsed ${rows.length} rows.`);

    // Group by Date + Program + Workout to make Sessions
    const sessionsMap = new Map<string, CsvRow[]>();

    for (const row of rows) {
        const key = `${row.Date}|${row.Program}|${row.Workout}`;
        if (!sessionsMap.has(key)) {
            sessionsMap.set(key, []);
        }
        sessionsMap.get(key)!.push(row);
    }

    console.log(`Found ${sessionsMap.size} unique sessions to import.`);

    // Cleanup previous runs: Delete sessions that match our legacy criteria
    const legacyProgramNames = ['Full Body Strength (3 Days)', 'Kajja'];
    const deletedCount = await Session.destroy({
        where: {
            isAdHoc: true,
            programName: legacyProgramNames
        }
    });
    console.log(`Cleaned up ${deletedCount} previously imported sessions.`);

    const transaction = await sequelize.transaction();

    try {
        for (const [key, sessionRows] of sessionsMap.entries()) {
            const [dateStr, programName, workoutName] = key.split('|');

            // Fix: Append noon time to date string to ensure it stays on the correct day 
            // regardless of local timezone offsets (avoids midnight shifting to previous day)
            const completedAt = new Date(dateStr + 'T12:00:00');

            const session = await Session.create({
                programName: programName,
                workoutName: workoutName,
                completedAt: completedAt,
                isAdHoc: true, // Legacy sessions are disconnected from current program definitions
                programId: null,
                workoutId: null
            }, { transaction });

            for (const row of sessionRows) {
                await Set.create({
                    sessionId: session.id,
                    exerciseName: row.Exercise,
                    weight: row.Weight,
                    reps: row.Reps,
                    setNumber: row.SetNumber,
                    perceivedEffort: row.RPE,
                    dropIndex: 0, // Default assume 0
                    exerciseId: null // Legacy exercises might not match current IDs
                }, { transaction });
            }
        }

        await transaction.commit();
        console.log('Successfully imported legacy sessions (Correction Applied)!');
    } catch (error) {
        await transaction.rollback();
        console.error('Error importing data:', error);
    } finally {
        await sequelize.close();
    }
}

importLegacyData();

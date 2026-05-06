import { DataTypes, Model, Optional, Sequelize } from 'sequelize';

export interface SessionAttributes {
  id: number;
  programId: number | null;
  programName: string;
  workoutId: number | null;
  workoutName: string;
  completedAt: Date | null;
  isAdHoc: boolean;
  heartRateAvg: number | null;
  heartRateMin: number | null;
  heartRateMax: number | null;
  heartRateSeries: string | null;
  exerciseNotes: Record<string, string> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SessionCreationAttributes extends Optional<SessionAttributes, 'id' | 'completedAt' | 'isAdHoc' | 'heartRateAvg' | 'heartRateMin' | 'heartRateMax' | 'heartRateSeries' | 'exerciseNotes'> {}

export class Session extends Model<SessionAttributes, SessionCreationAttributes> implements SessionAttributes {
  declare id: number;
  declare programId: number | null;
  declare programName: string;
  declare workoutId: number | null;
  declare workoutName: string;
  declare completedAt: Date | null;
  declare isAdHoc: boolean;
  declare heartRateAvg: number | null;
  declare heartRateMin: number | null;
  declare heartRateMax: number | null;
  declare heartRateSeries: string | null;
  declare exerciseNotes: Record<string, string> | null;
  declare readonly createdAt: Date;
  declare readonly updatedAt: Date;

  static initModel(sequelize: Sequelize): typeof Session {
    Session.init({
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      programId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'Programs',
          key: 'id'
        }
      },
      programName: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      workoutId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'Workouts',
          key: 'id'
        }
      },
      workoutName: {
        type: DataTypes.STRING(255),
        allowNull: false
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true
      },
      isAdHoc: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      heartRateAvg: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 20,
          max: 250
        }
      },
      heartRateMin: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 20,
          max: 250
        }
      },
      heartRateMax: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: {
          min: 20,
          max: 250
        }
      },
      heartRateSeries: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      exerciseNotes: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: null
      }
    }, {
      sequelize,
      tableName: 'Sessions',
      timestamps: true,
      indexes: [
        { fields: ['programId'] },
        { fields: ['workoutId'] },
        { fields: ['completedAt'] },
        { fields: ['programId', 'workoutId'] }
      ]
    });

    return Session;
  }
}

export default Session;

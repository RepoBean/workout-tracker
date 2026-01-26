const BAR_WEIGHT = 45;
const AVAILABLE_PLATES = [45, 35, 25, 10, 5, 2.5];

export interface PlateResult {
  perSide: { plate: number; count: number }[];
  remainder: number;
  achievableWeight: number;
}

export function calculatePlates(targetWeight: number): PlateResult {
  if (targetWeight <= BAR_WEIGHT) {
    return { perSide: [], remainder: 0, achievableWeight: BAR_WEIGHT };
  }

  let weightPerSide = (targetWeight - BAR_WEIGHT) / 2;
  const perSide: { plate: number; count: number }[] = [];

  for (const plate of AVAILABLE_PLATES) {
    const count = Math.floor(weightPerSide / plate);
    if (count > 0) {
      perSide.push({ plate, count });
      weightPerSide -= plate * count;
    }
  }

  // Round remainder to avoid floating point issues
  const remainder = Math.round(weightPerSide * 10) / 10;
  const achievableWeight = targetWeight - remainder * 2;

  return { perSide, remainder, achievableWeight };
}

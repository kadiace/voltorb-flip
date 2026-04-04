import { BoardState, CellAnalysis } from './recommendation';

export function calculateCellStatistics(boards: BoardState[]): CellAnalysis[] {
  const BOARD_SIZE = 5;
  const totalBoards = boards.length;
  const stats: CellAnalysis[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      let voltorbCount = 0;
      let sumValues = 0;
      const valueCounts: [number, number, number, number] = [0, 0, 0, 0];

      for (const board of boards) {
        const value = board[row][col];
        if (value !== 0 && value !== 1 && value !== 2 && value !== 3) {
          throw new Error(
            `Invalid board value at [${row}, ${col}]: ${String(value)}`,
          );
        }

        valueCounts[value] += 1;

        if (value === 0) voltorbCount++;
        else sumValues += value;
      }

      const safeProb = (totalBoards - voltorbCount) / totalBoards;
      const expectedValue = sumValues / totalBoards;
      const valueProbabilities: [number, number, number, number] = [
        valueCounts[0] / totalBoards,
        valueCounts[1] / totalBoards,
        valueCounts[2] / totalBoards,
        valueCounts[3] / totalBoards,
      ];

      stats.push({
        row,
        col,
        safeProb,
        expectedValue,
        valueProbabilities,
      });
    }
  }

  return stats;
}

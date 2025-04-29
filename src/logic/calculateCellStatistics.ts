import { BoardState, CellAnalysis } from './recommendation';

export function calculateCellStatistics(
  boards: BoardState[],
  originalBoard: BoardState,
): CellAnalysis[] {
  const BOARD_SIZE = 5;
  const totalBoards = boards.length;
  const stats: CellAnalysis[] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      let voltorbCount = 0;
      let sumValues = 0;

      for (const board of boards) {
        const value = board[row][col];
        if (value === 0) voltorbCount++;
        else sumValues += value ?? 0;
      }

      const safeProb = (totalBoards - voltorbCount) / totalBoards;
      const expectedValue = sumValues / totalBoards;

      stats.push({
        row,
        col,
        safeProb,
        expectedValue,
        riskLabel: 'mid',
      });
    }
  }

  const unopenedCells = stats.filter(
    (c) =>
      originalBoard[c.row][c.col] === null &&
      c.safeProb !== 0 &&
      c.expectedValue > 0,
  );
  const maxExpected = Math.max(...unopenedCells.map((c) => c.expectedValue));

  for (const cell of stats) {
    if (originalBoard[cell.row][cell.col] !== null) {
      if (originalBoard[cell.row][cell.col] === 0) {
        cell.riskLabel = 'voltorb';
      } else {
        cell.riskLabel = 'recommend';
      }
      continue;
    }
    if (cell.safeProb === 0 || cell.expectedValue < 1.0) {
      cell.riskLabel = 'voltorb';
    } else if (cell.safeProb === 1 || cell.expectedValue === maxExpected) {
      if (cell.safeProb !== 0) {
        cell.riskLabel = 'recommend';
      }
    } else {
      cell.riskLabel = 'mid';
    }
  }

  return stats;
}

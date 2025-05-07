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

  // Step 1: Recommend 100% safe cellss
  const fullSafeCells = unopenedCells.filter(
    (c) => Math.abs(c.safeProb - 1) < 1e-3,
  );

  // Step 2: Recommend cells with the highest expected value and safe probability
  let maxSafeProb = Math.max(
    ...unopenedCells.filter((c) => c.expectedValue >= 1).map((c) => c.safeProb),
  );
  let maxExpectedValue = Math.max(...unopenedCells.map((c) => c.expectedValue));

  for (const cell of stats) {
    if (originalBoard[cell.row][cell.col] !== null) {
      // Opened cell
      if (originalBoard[cell.row][cell.col] === 0) {
        cell.riskLabel = 'voltorb';
      } else {
        cell.riskLabel = 'recommend';
      }
      continue;
    }

    if (cell.safeProb === 0 || cell.expectedValue < 1.0) {
      cell.riskLabel = 'voltorb';
    } else if (fullSafeCells.length > 0) {
      if (
        fullSafeCells.some(
          (safeCell) => safeCell.row === cell.row && safeCell.col === cell.col,
        )
      ) {
        cell.riskLabel = 'recommend';
      } else {
        cell.riskLabel = 'mid';
      }
    } else if (
      Math.abs(cell.safeProb - maxSafeProb) < 1e-3 ||
      Math.abs(cell.expectedValue - maxExpectedValue) < 1e-3
    ) {
      cell.riskLabel = 'recommend';
    } else {
      cell.riskLabel = 'mid';
    }
  }

  return stats;
}

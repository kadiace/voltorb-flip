import { generateAllBoards } from './generateAllBoards';
import { calculateCellStatistics } from './calculateCellStatistics';

export type CellAnalysis = {
  row: number;
  col: number;
  safeProb: number; // 0.0 ~ 1.0
  expectedValue: number;
  riskLabel: 'recommend' | 'mid' | 'voltorb';
};

export type HintBoard = {
  rowHints: [number, number][]; // [sum, voltorbCount]
  colHints: [number, number][];
};

export type BoardState = (number | null)[][]; // 5x5, null for empty cells

export function analyzeBoard(
  board: BoardState,
  hints: HintBoard,
): CellAnalysis[] {
  const BOARD_SIZE = 5;

  // Step 1: Generate row candidates
  const rowCandidates: number[][][] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    const [rowSum, rowVolt] = hints.rowHints[row];

    // Set fixed cells
    const fixed = board[row];

    const candidates = generateRowCandidatesWithFixed(rowSum, rowVolt, fixed);
    rowCandidates.push(candidates);
  }

  // Step 2: Generate all possible boards
  const allBoards = generateAllBoards(rowCandidates, hints);

  // Filter out invalid boards
  if (allBoards.length === 0) {
    console.warn('No valid board combinations found.');
    return [];
  }

  // Step 3: Calculate expected values and safe probabilities per each cell
  const stats = calculateCellStatistics(allBoards, board);

  return stats;
}

function generateRowCandidatesWithFixed(
  sum: number,
  voltorb: number,
  fixed: (number | null)[],
): number[][] {
  const BOARD_SIZE = 5;
  const results: number[][] = [];

  function backtrack(
    index: number,
    currentRow: number[],
    currentSum: number,
    currentVolt: number,
  ) {
    if (index === BOARD_SIZE) {
      if (currentSum === sum && currentVolt === voltorb) {
        results.push([...currentRow]);
      }
      return;
    }

    const fixedVal = fixed[index];
    if (fixedVal !== null) {
      // Insert fixed value
      const nextSum = currentSum + (fixedVal > 0 ? fixedVal : 0);
      const nextVolt = currentVolt + (fixedVal === 0 ? 1 : 0);

      if (nextSum > sum || nextVolt > voltorb) return;

      currentRow.push(fixedVal);
      backtrack(index + 1, currentRow, nextSum, nextVolt);
      currentRow.pop();
    } else {
      // Check all possible values (0, 1, 2, 3)
      for (const num of [0, 1, 2, 3]) {
        const nextSum = currentSum + (num > 0 ? num : 0);
        const nextVolt = currentVolt + (num === 0 ? 1 : 0);

        if (nextSum > sum || nextVolt > voltorb) continue;

        currentRow.push(num);
        backtrack(index + 1, currentRow, nextSum, nextVolt);
        currentRow.pop();
      }
    }
  }

  backtrack(0, [], 0, 0);

  return results;
}

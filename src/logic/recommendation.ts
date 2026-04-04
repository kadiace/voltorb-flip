import { generateAllBoards } from './generateAllBoards';
import { calculateCellStatistics } from './calculateCellStatistics';

export type CellAnalysis = {
  row: number;
  col: number;
  safeProb: number; // 0.0 ~ 1.0
  expectedValue: number;
  valueProbabilities: [number, number, number, number]; // [P(0), P(1), P(2), P(3)]
};

export type HintBoard = {
  rowHints: [number, number][]; // [sum, voltorbCount]
  colHints: [number, number][];
};

export type BoardState = (number | null)[][]; // 5x5, null for empty cells
export type CandidateBoard = BoardState;

export type AnalyzeResult = {
  stats: CellAnalysis[];
  candidateBoards: CandidateBoard[];
};

export function analyzeBoardWithCandidates(
  board: BoardState,
  hints: HintBoard,
): AnalyzeResult {
  const BOARD_SIZE = 5;

  const rowCandidates: number[][][] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    const [rowSum, rowVolt] = hints.rowHints[row];
    const fixed = board[row];

    const candidates = generateRowCandidatesWithFixed(rowSum, rowVolt, fixed);
    rowCandidates.push(candidates);
  }

  const allBoards = generateAllBoards(rowCandidates, hints);

  if (allBoards.length === 0) {
    console.warn('No valid board combinations found.');
    return { stats: [], candidateBoards: [] };
  }

  return {
    stats: calculateCellStatistics(allBoards),
    candidateBoards: allBoards,
  };
}

export function analyzeBoard(
  board: BoardState,
  hints: HintBoard,
): CellAnalysis[] {
  return analyzeBoardWithCandidates(board, hints).stats;
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

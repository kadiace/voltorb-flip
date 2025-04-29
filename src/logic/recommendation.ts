import { generateAllBoards } from './generateAllBoards';
import { calculateCellStatistics } from './calculateCellStatistics';

export type CellAnalysis = {
  row: number;
  col: number;
  safeProb: number; // 0.0 ~ 1.0
  expectedValue: number; // 기대값
  riskLabel: 'recommend' | 'mid' | 'voltorb';
};

export type HintBoard = {
  rowHints: [number, number][]; // [sum, voltorbCount]
  colHints: [number, number][];
};

export type BoardState = (number | null)[][]; // 5x5, null은 미입력

export function analyzeBoard(
  board: BoardState,
  hints: HintBoard,
): CellAnalysis[] {
  const BOARD_SIZE = 5;

  // Step 1: 각 행별 가능한 조합 생성
  const rowCandidates: number[][][] = [];

  for (let row = 0; row < BOARD_SIZE; row++) {
    const [rowSum, rowVolt] = hints.rowHints[row];

    // 이미 입력된 셀 반영
    const fixed = board[row];

    const candidates = generateRowCandidatesWithFixed(rowSum, rowVolt, fixed);
    rowCandidates.push(candidates);
  }

  // Step 2: 전체 보드 조합 생성
  const allBoards = generateAllBoards(rowCandidates, hints);

  // 만약 가능한 보드가 하나도 없다면 → 비어있는 결과 리턴
  if (allBoards.length === 0) {
    console.warn('가능한 보드 없음!');
    return [];
  }

  // Step 3: 셀별 확률, 기대값 계산
  const stats = calculateCellStatistics(allBoards, board);

  return stats;
}

// ✅ 수정: 고정된 셀을 고려한 조합 생성기
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
      // 고정된 값 강제 삽입
      const nextSum = currentSum + (fixedVal > 0 ? fixedVal : 0);
      const nextVolt = currentVolt + (fixedVal === 0 ? 1 : 0);

      if (nextSum > sum || nextVolt > voltorb) return;

      currentRow.push(fixedVal);
      backtrack(index + 1, currentRow, nextSum, nextVolt);
      currentRow.pop();
    } else {
      // 자유롭게 삽입 가능
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

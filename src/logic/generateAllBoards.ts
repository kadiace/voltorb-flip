import { BoardState, HintBoard } from './recommendation';

export function generateAllBoards(
  rowCandidates: number[][][],
  hints: HintBoard,
  currentBoard: number[][] = [],
  depth: number = 0,
): BoardState[] {
  if (depth === 5) {
    if (validateColumns(currentBoard, hints)) {
      return [currentBoard.map((row) => [...row])];
    }
    return [];
  }

  const results: BoardState[] = [];

  for (const candidateRow of rowCandidates[depth]) {
    const nextBoard = [...currentBoard, candidateRow];
    results.push(
      ...generateAllBoards(rowCandidates, hints, nextBoard, depth + 1),
    );
  }

  return results;
}

function validateColumns(board: number[][], hints: HintBoard): boolean {
  const BOARD_SIZE = 5;
  const { colHints } = hints;

  for (let col = 0; col < BOARD_SIZE; col++) {
    let sum = 0;
    let volt = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      const value = board[row][col];
      if (value === 0) volt++;
      else sum += value;
    }

    const [targetSum, targetVolt] = colHints[col];
    if (sum !== targetSum || volt !== targetVolt) {
      return false;
    }
  }

  return true;
}

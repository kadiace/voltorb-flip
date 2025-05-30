import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  MouseEvent,
} from 'react';
import './Board.css';
import {
  analyzeBoard,
  BoardState,
  HintBoard,
  CellAnalysis,
} from '../logic/recommendation';
import { CellTooltip } from './CellTooltip';

const BOARD_SIZE = 5;

export const Board: React.FC = () => {
  const [gameStarted, setGameStarted] = useState(false);
  const [hintErrorMap, setHintErrorMap] = useState<{ [key: string]: boolean }>(
    {},
  );
  const [analysis, setAnalysis] = useState<CellAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    row: number;
    col: number;
  }>({ row: 0, col: 0 });
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    expectedValue: number;
    safeProb: number;
  } | null>(null);

  const gameRefs = useRef<HTMLInputElement[][]>([]);
  const hintRowRefs = useRef<HTMLInputElement[][]>([]);
  const hintColRefs = useRef<HTMLInputElement[][]>([]);

  useEffect(() => {
    gameRefs.current = Array.from({ length: BOARD_SIZE }, () =>
      Array(BOARD_SIZE),
    );
    hintRowRefs.current = Array.from({ length: BOARD_SIZE }, () => Array(2));
    hintColRefs.current = Array.from({ length: BOARD_SIZE }, () => Array(2));
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        if (selectedCell) {
          const { row, col } = selectedCell;
          gameRefs.current[row]?.[col]?.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedCell]);

  useEffect(() => {
    // Analyzing the board when game starts
    if (gameStarted && isLoading) {
      setTimeout(() => {
        const boardState = getCurrentBoardState();
        const hintState = getCurrentHint();
        const result = analyzeBoard(boardState, hintState);
        setAnalysis(result);
        setIsLoading(false);
        setSelectedCell({ row: 0, col: 0 });
      }, 100);
    }
  }, [gameStarted, isLoading]);

  // DEBUG: Set initial hints
  useLayoutEffect(() => {
    const rowHintValues: [string, string][] = [
      ['4', '2'],
      ['5', '3'],
      ['7', '0'],
      ['3', '3'],
      ['5', '2'],
    ];

    const colHintValues: [string, string][] = [
      ['4', '2'],
      ['6', '2'],
      ['4', '3'],
      ['5', '2'],
      ['5', '1'],
    ];

    // Row Hints
    hintRowRefs.current.forEach((pair, i) => {
      const [sumInput, voltInput] = pair;
      if (sumInput) sumInput.value = rowHintValues[i][0];
      if (voltInput) voltInput.value = rowHintValues[i][1];
    });

    // Column Hints
    hintColRefs.current.forEach((pair, i) => {
      const [sumInput, voltInput] = pair;
      if (sumInput) sumInput.value = colHintValues[i][0];
      if (voltInput) voltInput.value = colHintValues[i][1];
    });
  }, []);

  const getCurrentBoardState = (): BoardState => {
    return gameRefs.current.map((row) =>
      row.map((cell) => {
        const val = cell?.value;
        return val ? Number(val) : null;
      }),
    );
  };

  const getCurrentHint = (): HintBoard => {
    const rowHints = hintRowRefs.current.map(
      ([s, v]) =>
        [Number(s?.value || 0), Number(v?.value || 0)] as [number, number],
    );
    const colHints = hintColRefs.current.map(
      ([s, v]) =>
        [Number(s?.value || 0), Number(v?.value || 0)] as [number, number],
    );
    return { rowHints, colHints };
  };

  const updateAnalysisIfStarted = () => {
    if (!gameStarted) return;
    setIsLoading(true);
  };

  const validateGameCell = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (/^[0-3]$/.test(val) || val === '') {
      e.target.value = val;
      updateAnalysisIfStarted();
    } else {
      e.preventDefault();
      e.target.value = '';
    }
  };

  const validateHintCell = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: 'sum' | 'volt',
  ) => {
    const val = e.target.value;

    // Get rid of non-numeric characters
    if (!/^[0-9]*$/.test(val)) {
      e.target.value = val.replace(/[^0-9]/g, '');
    }

    const num = Number(e.target.value);

    // Reset to empty if out of range
    if (
      e.target.value !== '' &&
      ((type === 'sum' && (num < 0 || num > 15)) ||
        (type === 'volt' && (num < 0 || num > 5)))
    ) {
      e.target.value = '';
    }
  };

  const handleStartClick = () => {
    const errorMap: { [key: string]: boolean } = {};

    [...hintRowRefs.current, ...hintColRefs.current].forEach((pair, idx) => {
      pair.forEach((input, i) => {
        const key = `${idx < 5 ? 'row' : 'col'}-${idx % 5}-${i}`;
        errorMap[key] = !input?.value;
      });
    });

    const hasError = Object.values(errorMap).some((v) => v);
    setHintErrorMap(errorMap);

    if (hasError) return;

    const nextState = !gameStarted;
    setGameStarted(nextState);

    if (nextState) {
      setIsLoading(true);
    } else {
      setAnalysis([]);
      gameRefs.current.forEach((row) =>
        row.forEach((cell) => cell && (cell.value = '')),
      );
    }
  };

  const handleRefreshClick = () => {
    setGameStarted(false);
    setHintErrorMap({});
    setAnalysis([]);
    setSelectedCell({ row: 0, col: 0 });
    gameRefs.current.forEach((row) =>
      row.forEach((cell) => cell && (cell.value = '')),
    );
    hintRowRefs.current.forEach((pair) =>
      pair.forEach((input) => input && (input.value = '')),
    );
    hintColRefs.current.forEach((pair) =>
      pair.forEach((input) => input && (input.value = '')),
    );
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    row: number,
    col: number,
  ) => {
    const key = e.key;
    if (key === 'Escape') {
      e.currentTarget.blur();
    } else if (key.startsWith('Arrow')) {
      e.preventDefault();
      let newRow = row;
      let newCol = col;
      if (key === 'ArrowUp') newRow = Math.max(0, row - 1);
      if (key === 'ArrowDown') newRow = Math.min(BOARD_SIZE - 1, row + 1);
      if (key === 'ArrowLeft') newCol = Math.max(0, col - 1);
      if (key === 'ArrowRight') newCol = Math.min(BOARD_SIZE - 1, col + 1);
      setSelectedCell({ row: newRow, col: newCol });
      setTimeout(() => gameRefs.current[newRow][newCol]?.focus(), 0);
    }
  };

  const handleOnClick = (row: number, col: number) => {
    setSelectedCell({ row, col });
  };

  const handleMouseOver = (e: MouseEvent, row: number, col: number) => {
    if (analysis) {
      const rect = e.currentTarget.getBoundingClientRect();
      const cellAnalysis = analysis.find((a) => a.row === row && a.col === col);
      setTooltip({
        x: rect.left + rect.width + 10,
        y: rect.top,
        expectedValue: cellAnalysis!.expectedValue,
        safeProb: cellAnalysis!.safeProb,
      });
    }
  };

  return (
    <div className='board-wrapper'>
      <div className='board-grid-fixed'>
        {[...Array(BOARD_SIZE)].map((_, row) => (
          <React.Fragment key={`row-${row}`}>
            {[...Array(BOARD_SIZE)].map((_, col) => {
              const cellAnalysis = analysis.find(
                (a) => a.row === row && a.col === col,
              );
              const risk =
                gameStarted && cellAnalysis ? cellAnalysis.riskLabel : '';
              const isSelected =
                selectedCell?.row === row && selectedCell?.col === col;

              return (
                <input
                  key={`cell-${row}-${col}`}
                  type='text'
                  inputMode='numeric'
                  className={`cell game-cell ${risk} ${isSelected ? 'selected' : ''}`}
                  maxLength={1}
                  ref={(el) => {
                    if (!gameRefs.current[row]) gameRefs.current[row] = [];
                    gameRefs.current[row][col] = el!;
                  }}
                  disabled={!gameStarted}
                  style={{ gridColumn: col + 1, gridRow: row + 1 }}
                  onChange={validateGameCell}
                  onKeyDown={(e) => handleKeyDown(e, row, col)}
                  onClick={() => handleOnClick(row, col)}
                  onMouseEnter={(e) => handleMouseOver(e, row, col)}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
            {[0, 1].map((i) => {
              const errorKey = `row-${row}-${i}`;
              const type = i === 0 ? 'sum' : 'volt';
              return (
                <input
                  key={`hint-row-${row}-${i}`}
                  className={`cell hint-input ${hintErrorMap[errorKey] ? 'error' : ''}`}
                  placeholder={i === 0 ? 'S' : 'V'}
                  ref={(el) => {
                    if (!hintRowRefs.current[row])
                      hintRowRefs.current[row] = [];
                    hintRowRefs.current[row][i] = el!;
                  }}
                  disabled={gameStarted}
                  style={{ gridColumn: BOARD_SIZE + i + 1, gridRow: row + 1 }}
                  onChange={(e) => validateHintCell(e, type)}
                />
              );
            })}
          </React.Fragment>
        ))}

        {[...Array(BOARD_SIZE)].map((_, col) => (
          <React.Fragment key={`col-hint-${col}`}>
            {[0, 1].map((i) => {
              const errorKey = `col-${col}-${i}`;
              const type = i === 0 ? 'sum' : 'volt';
              return (
                <input
                  key={`hint-col-${col}-${i}`}
                  className={`cell hint-input ${hintErrorMap[errorKey] ? 'error' : ''}`}
                  placeholder={i === 0 ? 'S' : 'V'}
                  ref={(el) => {
                    if (!hintColRefs.current[col])
                      hintColRefs.current[col] = [];
                    hintColRefs.current[col][i] = el!;
                  }}
                  disabled={gameStarted}
                  style={{ gridColumn: col + 1, gridRow: BOARD_SIZE + i + 1 }}
                  onChange={(e) => validateHintCell(e, type)}
                />
              );
            })}
          </React.Fragment>
        ))}

        <div
          className='cell empty-corner'
          style={{ gridColumn: BOARD_SIZE + 1, gridRow: BOARD_SIZE + 1 }}
        />
        <div
          className='cell empty-corner'
          style={{ gridColumn: BOARD_SIZE + 2, gridRow: BOARD_SIZE + 1 }}
        />
        {isLoading && <div className='loader' title='Analyzing board...' />}
      </div>

      <div className='button-row'>
        <button
          onClick={handleStartClick}
          className='control-button start-button'
        >
          {gameStarted ? '⏹ Stop' : '▶ Start'}
        </button>
        <button
          onClick={handleRefreshClick}
          className='control-button refresh-button'
        >
          🔄 Refresh
        </button>
      </div>
      {tooltip && <CellTooltip {...tooltip} />}
    </div>
  );
};

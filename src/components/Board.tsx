import React, {
  useCallback,
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  DragEvent,
  MouseEvent,
} from 'react';
import './Board.css';
import {
  analyzeBoard,
  BoardState,
  HintBoard,
  CellAnalysis,
} from '../logic/recommendation';
import { extractHintsFromImageBitmap } from '../logic/extractHintsFromImage';
import { CellTooltip } from './CellTooltip';
import refreshIcon from '../assets/icons/refresh.svg';
import voltorbIcon from '../assets/icons/voltorb.png';

const BOARD_SIZE = 5;
const CELL_OPTION_VALUES = [0, 1, 2, 3] as const;
const CANDIDATE_THRESHOLD = 1e-6;
const DEBUG_ROW_HINT_VALUES: [string, string][] = [
  ['4', '2'],
  ['5', '3'],
  ['7', '0'],
  ['3', '3'],
  ['5', '2'],
];
const DEBUG_COL_HINT_VALUES: [string, string][] = [
  ['4', '2'],
  ['6', '2'],
  ['4', '3'],
  ['5', '2'],
  ['5', '1'],
];

export const Board: React.FC = () => {
  const [gameStarted, setGameStarted] = useState(false);
  const [hintErrorMap, setHintErrorMap] = useState<{ [key: string]: boolean }>(
    {},
  );
  const [boardState, setBoardState] = useState<BoardState>(
    Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null)),
  );
  const [boardHistory, setBoardHistory] = useState<BoardState[]>([]);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const [analysis, setAnalysis] = useState<CellAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    valueProbabilities: [number, number, number, number];
  } | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isDragOverPreview, setIsDragOverPreview] = useState(false);
  const [convertStatus, setConvertStatus] = useState<string>('');

  const hintRowRefs = useRef<HTMLInputElement[][]>(
    Array.from({ length: BOARD_SIZE }, () => Array(2)),
  );
  const hintColRefs = useRef<HTMLInputElement[][]>(
    Array.from({ length: BOARD_SIZE }, () => Array(2)),
  );
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const uploadedImageUrlRef = useRef<string | null>(null);
  const uploadedImageBlobRef = useRef<Blob | null>(null);

  const setPreviewImageFromBlob = useCallback((file: Blob) => {
    const nextImageUrl = URL.createObjectURL(file);

    if (uploadedImageUrlRef.current) {
      URL.revokeObjectURL(uploadedImageUrlRef.current);
    }

    uploadedImageUrlRef.current = nextImageUrl;
    uploadedImageBlobRef.current = file;
    setUploadedImage(nextImageUrl);
  }, []);

  const applyDebugInitialHints = () => {
    hintRowRefs.current.forEach((pair, i) => {
      const [sumInput, voltInput] = pair;
      if (sumInput) sumInput.value = DEBUG_ROW_HINT_VALUES[i][0];
      if (voltInput) voltInput.value = DEBUG_ROW_HINT_VALUES[i][1];
    });

    hintColRefs.current.forEach((pair, i) => {
      const [sumInput, voltInput] = pair;
      if (sumInput) sumInput.value = DEBUG_COL_HINT_VALUES[i][0];
      if (voltInput) voltInput.value = DEBUG_COL_HINT_VALUES[i][1];
    });
  };

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const imageBlob = items[i].getAsFile();
          if (imageBlob) {
            setPreviewImageFromBlob(imageBlob);
            break;
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [setPreviewImageFromBlob]);

  useEffect(() => {
    return () => {
      if (uploadedImageUrlRef.current) {
        URL.revokeObjectURL(uploadedImageUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Analyzing the board when game starts
    if (gameStarted && isLoading) {
      setTimeout(() => {
        const boardState = getCurrentBoardState();
        const hintState = getCurrentHint();
        const result = analyzeBoard(boardState, hintState);
        setAnalysis(result);
        setIsLoading(false);
      }, 100);
    }
  }, [boardState, gameStarted, isLoading]);

  useLayoutEffect(() => {
    applyDebugInitialHints();
  }, []);

  const getCurrentBoardState = (): BoardState => {
    return boardState.map((row) => [...row]);
  };

  const getCellKey = (row: number, col: number) => `${row}-${col}`;

  const getRecommendedCell = (): { row: number; col: number } | null => {
    if (!gameStarted || isLoading || analysis.length === 0) return null;

    const unopenedCells = analysis.filter(
      (cell) => boardState[cell.row][cell.col] === null,
    );
    if (unopenedCells.length === 0) return null;

    const minVoltorbProb = Math.min(
      ...unopenedCells.map((cell) => cell.valueProbabilities[0]),
    );
    const safestCells = unopenedCells.filter(
      (cell) =>
        Math.abs(cell.valueProbabilities[0] - minVoltorbProb) <=
        CANDIDATE_THRESHOLD,
    );

    let bestCell = safestCells[0];
    for (const cell of safestCells) {
      if (cell.expectedValue > bestCell.expectedValue) {
        bestCell = cell;
      }
    }

    return { row: bestCell.row, col: bestCell.col };
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

  const isCandidatePossible = (
    cellAnalysis: CellAnalysis | undefined,
    value: number,
  ) => {
    if (!cellAnalysis) return true;
    return cellAnalysis.valueProbabilities[value] > CANDIDATE_THRESHOLD;
  };

  const handleCellOptionClick = (row: number, col: number, value: number) => {
    if (!gameStarted) return;
    if (boardState[row][col] === value) return;

    const snapshot = boardState.map((line) => [...line]);
    setBoardHistory((prev) => [...prev, snapshot]);

    setBoardState((prev) => {
      const next = prev.map((line) => [...line]);
      next[row][col] = value;
      return next;
    });

    setExpandedCells((prev) => {
      const next = new Set(prev);
      next.delete(getCellKey(row, col));
      return next;
    });
    setTooltip(null);
    updateAnalysisIfStarted();
  };

  useEffect(() => {
    const handleUndoKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      if (boardHistory.length === 0) return;

      e.preventDefault();
      const previousBoard = boardHistory[boardHistory.length - 1];
      setBoardHistory((prev) => prev.slice(0, -1));
      setBoardState(previousBoard.map((line) => [...line]));

      if (gameStarted) {
        setIsLoading(true);
      }
    };

    window.addEventListener('keydown', handleUndoKeyDown);
    return () => {
      window.removeEventListener('keydown', handleUndoKeyDown);
    };
  }, [boardHistory, gameStarted]);

  useEffect(() => {
    if (!gameStarted || isLoading || analysis.length === 0) return;

    let changed = false;
    const nextBoard = boardState.map((line) => [...line]);

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (nextBoard[row][col] !== null) continue;

        const cellAnalysis = analysis.find(
          (a) => a.row === row && a.col === col,
        );
        if (!cellAnalysis) continue;

        const candidates = [0, 1, 2, 3].filter((value) =>
          isCandidatePossible(cellAnalysis, value),
        );

        if (candidates.length === 1) {
          nextBoard[row][col] = candidates[0];
          changed = true;
        }
      }
    }

    if (changed) {
      setBoardState(nextBoard);
      setIsLoading(true);
    }
  }, [analysis, boardState, gameStarted, isLoading]);

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
      setBoardState(
        Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null)),
      );
      setBoardHistory([]);
      setExpandedCells(new Set());
    }
  };

  const handleRefreshClick = () => {
    setGameStarted(false);
    setHintErrorMap({});
    setAnalysis([]);
    setBoardState(
      Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null)),
    );
    setBoardHistory([]);
    setExpandedCells(new Set());
    hintRowRefs.current.forEach((pair) =>
      pair.forEach((input) => input && (input.value = '')),
    );
    hintColRefs.current.forEach((pair) =>
      pair.forEach((input) => input && (input.value = '')),
    );
    applyDebugInitialHints();
  };

  const handleMouseOver = (e: MouseEvent, row: number, col: number) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cellAnalysis = analysis.find((a) => a.row === row && a.col === col);
    if (!cellAnalysis) {
      setTooltip(null);
      return;
    }

    setTooltip({
      x: rect.left + rect.width + 10,
      y: rect.top,
      valueProbabilities: cellAnalysis.valueProbabilities,
    });
  };

  const handleImageUploadChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreviewImageFromBlob(file);
    setConvertStatus('');
    e.target.value = '';
  };

  const clearUploadedImage = () => {
    if (uploadedImageUrlRef.current) {
      URL.revokeObjectURL(uploadedImageUrlRef.current);
      uploadedImageUrlRef.current = null;
    }
    uploadedImageBlobRef.current = null;
    setUploadedImage(null);
    setConvertStatus('');
  };

  const handlePreviewDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOverPreview(true);
  };

  const handlePreviewDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOverPreview(false);
  };

  const handlePreviewDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOverPreview(false);

    const imageFile = Array.from(e.dataTransfer.files).find((file) =>
      file.type.startsWith('image/'),
    );

    if (imageFile) {
      setPreviewImageFromBlob(imageFile);
      setConvertStatus('');
    }
  };

  const applyExtractedHints = (
    rowHintValues: [string, string][],
    colHintValues: [string, string][],
  ) => {
    hintRowRefs.current.forEach((pair, rowIdx) => {
      const [sumInput, voltInput] = pair;
      if (sumInput) sumInput.value = rowHintValues[rowIdx][0];
      if (voltInput) voltInput.value = rowHintValues[rowIdx][1];
    });

    hintColRefs.current.forEach((pair, colIdx) => {
      const [sumInput, voltInput] = pair;
      if (sumInput) sumInput.value = colHintValues[colIdx][0];
      if (voltInput) voltInput.value = colHintValues[colIdx][1];
    });

    setHintErrorMap({});
  };

  const handleConvertImageClick = async () => {
    if (!uploadedImage) {
      setConvertStatus('Upload an HGSS board screenshot first.');
      return;
    }

    if (!uploadedImageBlobRef.current) {
      setConvertStatus(
        'Missing image data. Please upload the screenshot again.',
      );
      return;
    }

    try {
      setConvertStatus('Converting image...');
      const extracted = await extractHintsFromImageBitmap(
        uploadedImageBlobRef.current,
      );
      applyExtractedHints(extracted.rowHintValues, extracted.colHintValues);
      setConvertStatus('Hints extracted from image.');

      if (gameStarted) {
        setIsLoading(true);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to convert screenshot into hints.';
      setConvertStatus(message);
    }
  };

  return (
    <div className='board-wrapper'>
      <div className='board-title-wrap'>
        <h1 className='board-title'>VOLTORB FLIP</h1>
        <p className='board-subtitle'>SOLVER</p>
      </div>

      <input
        ref={uploadInputRef}
        type='file'
        accept='image/*'
        className='upload-input-hidden'
        onChange={handleImageUploadChange}
      />

      <div className='image-preview-shell'>
        <div className='image-preview-panel pixel-border'>
          <div
            className={`image-preview-frame ${uploadedImage ? 'has-image' : 'is-empty'} ${isDragOverPreview ? 'drag-over' : ''}`}
            onDragOver={handlePreviewDragOver}
            onDragEnter={handlePreviewDragOver}
            onDragLeave={handlePreviewDragLeave}
            onDrop={handlePreviewDrop}
            onClick={() => uploadInputRef.current?.click()}
            role='button'
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                uploadInputRef.current?.click();
              }
            }}
            aria-label='Upload or drop image preview'
          >
            {uploadedImage && (
              <img
                src={uploadedImage}
                alt='Uploaded board preview'
                className='image-preview'
              />
            )}

            {!uploadedImage && (
              <div className='image-panel-controls'>
                <p className='image-paste-help'>
                  <strong className='image-cta'>CLICK TO UPLOAD</strong>
                  <span className='image-paste-note'>or drop image here</span>
                  <span className='image-paste-note'>
                    or paste clipboard image with Ctrl+V / Cmd+V
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>

        {uploadedImage && (
          <button
            type='button'
            className='image-close-button pixel-button'
            onClick={clearUploadedImage}
            aria-label='Remove uploaded image'
            title='Remove image'
          >
            X
          </button>
        )}
      </div>

      <div className='convert-row'>
        <button
          type='button'
          className='control-button convert-button pixel-button'
          onClick={handleConvertImageClick}
          disabled={!uploadedImage}
        >
          Convert Image To Grid
        </button>
      </div>

      {convertStatus && <div className='convert-status'>{convertStatus}</div>}

      <div className='board-panel pixel-border'>
        <div className='board-grid-fixed'>
          {(() => {
            const recommendedCell = getRecommendedCell();

            return [...Array(BOARD_SIZE)].map((_, row) => (
              <React.Fragment key={`row-${row}`}>
                {[...Array(BOARD_SIZE)].map((_, col) => {
                  const cellAnalysis = analysis.find(
                    (a) => a.row === row && a.col === col,
                  );
                  const fixedValue = boardState[row][col];
                  const isRecommended =
                    recommendedCell?.row === row &&
                    recommendedCell?.col === col;
                  const isExpanded = expandedCells.has(getCellKey(row, col));
                  const showOptions =
                    gameStarted &&
                    fixedValue === null &&
                    (isRecommended || isExpanded);

                  return (
                    <div
                      key={`cell-${row}-${col}`}
                      className={`cell game-cell-option-wrap ${
                        fixedValue === 0 ? 'fixed-voltorb' : ''
                      } ${
                        gameStarted && fixedValue === null && !showOptions
                          ? 'hidden-cell'
                          : ''
                      }`}
                      style={{ gridColumn: col + 1, gridRow: row + 1 }}
                      onMouseEnter={(e) => handleMouseOver(e, row, col)}
                      onMouseLeave={() => setTooltip(null)}
                      onClick={() => {
                        if (
                          gameStarted &&
                          fixedValue === null &&
                          !showOptions
                        ) {
                          setExpandedCells((prev) => {
                            const next = new Set(prev);
                            next.add(getCellKey(row, col));
                            return next;
                          });
                        }
                      }}
                    >
                      {fixedValue !== null ? (
                        <div className='fixed-cell-value'>
                          {fixedValue === 0 ? (
                            <img
                              src={voltorbIcon}
                              className='fixed-cell-voltorb'
                              alt=''
                              aria-hidden='true'
                            />
                          ) : (
                            fixedValue
                          )}
                        </div>
                      ) : showOptions ? (
                        <div className='cell-option-grid'>
                          {CELL_OPTION_VALUES.map((value) => {
                            const isPossible = isCandidatePossible(
                              cellAnalysis,
                              value,
                            );

                            return (
                              <button
                                key={`cell-${row}-${col}-value-${value}`}
                                type='button'
                                className='cell-option-button'
                                style={{ opacity: isPossible ? 1 : 0.3 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCellOptionClick(row, col, value);
                                }}
                                disabled={!gameStarted || !isPossible}
                                aria-label={`Set cell ${row + 1}, ${col + 1} to ${value === 0 ? 'Voltorb' : value}`}
                              >
                                {value === 0 ? (
                                  <img
                                    src={voltorbIcon}
                                    className='cell-option-voltorb'
                                    alt=''
                                    aria-hidden='true'
                                  />
                                ) : (
                                  value
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                <div
                  className='cell hint-slot'
                  style={{ gridColumn: BOARD_SIZE + 1, gridRow: row + 1 }}
                >
                  <input
                    className={`hint-input ${hintErrorMap[`row-${row}-0`] ? 'error' : ''}`}
                    placeholder='S'
                    ref={(el) => {
                      if (!hintRowRefs.current[row])
                        hintRowRefs.current[row] = [];
                      hintRowRefs.current[row][0] = el!;
                    }}
                    disabled={gameStarted}
                    onChange={(e) => validateHintCell(e, 'sum')}
                  />
                  <div className='hint-volt-row'>
                    <img
                      src={voltorbIcon}
                      className='hint-voltorb-icon'
                      alt=''
                      aria-hidden='true'
                    />
                    <input
                      className={`hint-input ${hintErrorMap[`row-${row}-1`] ? 'error' : ''}`}
                      placeholder='V'
                      ref={(el) => {
                        if (!hintRowRefs.current[row])
                          hintRowRefs.current[row] = [];
                        hintRowRefs.current[row][1] = el!;
                      }}
                      disabled={gameStarted}
                      onChange={(e) => validateHintCell(e, 'volt')}
                    />
                  </div>
                </div>
              </React.Fragment>
            ));
          })()}

          {[...Array(BOARD_SIZE)].map((_, col) => (
            <div
              key={`col-hint-${col}`}
              className='cell hint-slot'
              style={{ gridColumn: col + 1, gridRow: BOARD_SIZE + 1 }}
            >
              <input
                className={`hint-input ${hintErrorMap[`col-${col}-0`] ? 'error' : ''}`}
                placeholder='S'
                ref={(el) => {
                  if (!hintColRefs.current[col]) hintColRefs.current[col] = [];
                  hintColRefs.current[col][0] = el!;
                }}
                disabled={gameStarted}
                onChange={(e) => validateHintCell(e, 'sum')}
              />
              <div className='hint-volt-row'>
                <img
                  src={voltorbIcon}
                  className='hint-voltorb-icon'
                  alt=''
                  aria-hidden='true'
                />
                <input
                  className={`hint-input ${hintErrorMap[`col-${col}-1`] ? 'error' : ''}`}
                  placeholder='V'
                  ref={(el) => {
                    if (!hintColRefs.current[col])
                      hintColRefs.current[col] = [];
                    hintColRefs.current[col][1] = el!;
                  }}
                  disabled={gameStarted}
                  onChange={(e) => validateHintCell(e, 'volt')}
                />
              </div>
            </div>
          ))}

          <div
            className='cell grid-action-slot'
            style={{ gridColumn: BOARD_SIZE + 1, gridRow: BOARD_SIZE + 1 }}
          >
            <button
              onClick={handleStartClick}
              className='control-button start-button pixel-button grid-action-button'
              aria-label={gameStarted ? 'Stop game' : 'Start game'}
            >
              <span className='start-symbol' aria-hidden='true'>
                {gameStarted ? '⏹' : '▶'}
              </span>
            </button>
            <button
              onClick={handleRefreshClick}
              className='control-button refresh-button pixel-button grid-action-button'
              aria-label='Refresh board'
            >
              <img
                src={refreshIcon}
                className='refresh-icon-image'
                alt=''
                aria-hidden='true'
              />
            </button>
          </div>

          {isLoading && <div className='loader' title='Analyzing board...' />}
        </div>
      </div>
      <div className='board-help'>
        Top number: row/column sum | Bottom number: Voltorb count
      </div>
      {tooltip && <CellTooltip {...tooltip} />}
    </div>
  );
};

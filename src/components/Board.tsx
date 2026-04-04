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

const BOARD_SIZE = 5;
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
  const [analysis, setAnalysis] = useState<CellAnalysis[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    row: number;
    col: number;
  }>({ row: 0, col: 0 });
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    valueProbabilities: [number, number, number, number];
  } | null>(null);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isDragOverPreview, setIsDragOverPreview] = useState(false);
  const [convertStatus, setConvertStatus] = useState<string>('');

  const gameRefs = useRef<HTMLInputElement[][]>(
    Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE)),
  );
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
        setSelectedCell({ row: 0, col: 0 });
      }, 100);
    }
  }, [gameStarted, isLoading]);

  useLayoutEffect(() => {
    applyDebugInitialHints();
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
    applyDebugInitialHints();
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
            className={`image-preview-frame ${isDragOverPreview ? 'drag-over' : ''}`}
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

          {isLoading && <div className='loader' title='Analyzing board...' />}
        </div>
      </div>

      <div className='button-row'>
        <button
          onClick={handleStartClick}
          className='control-button start-button pixel-button'
        >
          {gameStarted ? '⏹ Stop' : '▶ Start'}
        </button>
        <button
          onClick={handleRefreshClick}
          className='control-button refresh-button pixel-button'
        >
          🔄 Refresh
        </button>
      </div>
      <div className='board-help'>
        Top number: row/column sum | Bottom number: Voltorb count
      </div>
      {tooltip && <CellTooltip {...tooltip} />}
    </div>
  );
};

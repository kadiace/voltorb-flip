import React from 'react';
import './CellTooltip.css';

interface TooltipProps {
  x: number;
  y: number;
  expectedValue: number;
  safeProb: number;
}

export const CellTooltip: React.FC<TooltipProps> = ({
  x,
  y,
  expectedValue,
  safeProb,
}) => {
  return (
    <div className='tooltip' style={{ top: y, left: x }}>
      <div>
        Expected Value: <strong>{expectedValue.toFixed(2)}</strong>
      </div>
      <div>
        Safe Probability: <strong>{(safeProb * 100).toFixed(1)}%</strong>
      </div>
    </div>
  );
};

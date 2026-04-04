import React from 'react';
import './CellTooltip.css';

interface TooltipProps {
  x: number;
  y: number;
  valueProbabilities: [number, number, number, number];
}

export const CellTooltip: React.FC<TooltipProps> = ({
  x,
  y,
  valueProbabilities,
}) => {
  return (
    <div className='tooltip' style={{ top: y, left: x }}>
      {valueProbabilities.map((probability, value) => (
        <div key={`value-${value}`}>
          {value}: <strong>{(probability * 100).toFixed(1)}%</strong>
        </div>
      ))}
    </div>
  );
};

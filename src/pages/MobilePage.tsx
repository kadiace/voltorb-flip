import React, { useEffect, useState } from 'react';
import { Board } from '../components/Board';
import '../components/Board.css';

export const MobilePage: React.FC = () => {
  const [windowHeight, setWindowHeight] = useState(window.innerHeight);

  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      style={{
        width: '100vw',
        height: `${windowHeight}px`, // 안전한 높이 확보
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'auto',
        paddingTop: '1rem',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 'min(95vw, 400px)',
          aspectRatio: '1 / 1',
        }}
      >
        <Board />
      </div>

      {/* 모바일 전용 추가 UI 예시 */}
      <div
        style={{
          marginTop: '1rem',
          textAlign: 'center',
          fontSize: '0.9rem',
          color: 'gray',
        }}
      >
        Tap a cell to edit. Long-press for options.
      </div>
    </div>
  );
};

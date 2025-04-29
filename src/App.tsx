import { useEffect, useState } from 'react';
import { MobilePage } from './pages/MobilePage';
import { PcPage } from './pages/PcPage';

const App = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      // 768px 기준으로 모바일 판단
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile(); // 초기 체크
    window.addEventListener('resize', checkMobile); // 리사이즈 반응

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile ? <MobilePage /> : <PcPage />;
};

export default App;

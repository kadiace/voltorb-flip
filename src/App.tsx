import { useEffect, useState } from 'react';
import { MobilePage } from './pages/MobilePage';
import { PcPage } from './pages/PcPage';

const App = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    checkMobile(); // Initial check
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile ? <MobilePage /> : <PcPage />;
};

export default App;

import { Board } from './components/Board';
import './App.css';

const App = () => {
  return (
    <div className='app-shell'>
      <aside className='ad-rail ad-rail-left'>
        <div className='ad-card'>
          <p>AD SPACE</p>
          <span>160 x 600</span>
        </div>
      </aside>

      <main className='app-main'>
        <Board />
      </main>

      <aside className='ad-rail ad-rail-right'>
        <div className='ad-card'>
          <p>AD SPACE</p>
          <span>160 x 600</span>
        </div>
      </aside>
    </div>
  );
};

export default App;

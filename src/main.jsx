import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const CHUNK_RELOAD_GUARD_KEY = 'grade_tracker_chunk_reload_once';

const isChunkLoadErrorMessage = (message) => {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('failed to fetch dynamically imported module') ||
    text.includes('chunkloaderror') ||
    text.includes('loading chunk') ||
    text.includes('importing a module script failed')
  );
};

const setBootFallbackMessage = (title, detail) => {
  if (typeof document === 'undefined') return;
  const fallback = document.getElementById('boot-fallback');
  if (!fallback) return;
  const titleEl = fallback.querySelector('[data-boot-title]');
  const detailEl = fallback.querySelector('[data-boot-detail]');
  if (titleEl) titleEl.textContent = title || '系統載入中';
  if (detailEl) detailEl.textContent = detail || '';
  fallback.style.display = 'flex';
};

const hideBootFallback = () => {
  if (typeof document === 'undefined') return;
  const fallback = document.getElementById('boot-fallback');
  if (fallback) fallback.style.display = 'none';
};

const notifyBootReady = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('grade-tracker:boot-ready'));
};

const tryRecoverChunkFailure = (message) => {
  if (!isChunkLoadErrorMessage(message)) return false;
  const reloaded = sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1';
  if (reloaded) return false;
  sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
  window.location.reload();
  return true;
};

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error && error.message ? String(error.message) : 'Unknown runtime error'
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Runtime crash captured by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center px-6">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
          <h1 className="text-xl font-black tracking-tight text-slate-800">系統暫時發生錯誤</h1>
          <p className="mt-3 text-sm text-slate-500 leading-relaxed">請重新整理頁面。若仍發生，請把下方錯誤訊息回傳。</p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-500 border border-slate-200">{this.state.message}</pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 w-full rounded-xl bg-slate-800 py-2.5 text-sm font-bold text-white hover:bg-slate-700 transition-colors"
          >
            重新整理
          </button>
        </div>
      </div>
    );
  }
}

const bootstrap = async () => {
  try {
    const module = await import('./App.jsx');
    const App = module.default;
    const rootElement = document.getElementById('root');
    if (!rootElement) throw new Error('Root container #root not found');

    createRoot(rootElement).render(
      <StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StrictMode>,
    );

    document.body.dataset.appMounted = '1';
    sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
    hideBootFallback();
    notifyBootReady();
  } catch (error) {
    const message = error && error.message ? String(error.message) : 'Unknown startup error';
    if (tryRecoverChunkFailure(message)) return;
    console.error('Bootstrap load error:', error);
    setBootFallbackMessage('系統啟動失敗', message);
  }
};

bootstrap();

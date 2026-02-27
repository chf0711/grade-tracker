import { Component, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

const CHUNK_RELOAD_GUARD_KEY = 'grade_tracker_chunk_reload_once';
const CHUNK_RECOVERY_INSTALLED_KEY = '__gradeTrackerChunkRecoveryInstalled';

const isChunkLoadErrorMessage = (message) => {
  const text = String(message || '').toLowerCase();
  return (
    text.includes('failed to fetch dynamically imported module') ||
    text.includes('chunkloaderror') ||
    text.includes('loading chunk') ||
    text.includes('importing a module script failed')
  );
};

const installChunkLoadRecovery = () => {
  if (typeof window === 'undefined') return;
  if (window[CHUNK_RECOVERY_INSTALLED_KEY]) return;
  window[CHUNK_RECOVERY_INSTALLED_KEY] = true;

  const tryRecoverChunkFailure = (message) => {
    if (!isChunkLoadErrorMessage(message)) return;
    const reloaded = sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1';
    if (reloaded) return;
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
    window.location.reload();
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = typeof reason === 'string'
      ? reason
      : (reason && typeof reason.message === 'string' ? reason.message : '');
    tryRecoverChunkFailure(message);
  });

  window.addEventListener('error', (event) => {
    const message = event?.message || event?.error?.message || '';
    tryRecoverChunkFailure(message);
  });

  window.addEventListener('load', () => {
    sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
  });
};

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: error && error.message ? String(error.message) : 'Unknown runtime error'
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
          <p className="mt-3 text-sm text-slate-500 leading-relaxed">已啟用防白屏保護，請先重新整理頁面。若仍發生，請把下方錯誤訊息回傳給我。</p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-500 border border-slate-200">{this.state.errorMessage}</pre>
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

installChunkLoadRecovery();

let rootElement = document.getElementById('root');
if (!rootElement) {
  rootElement = document.createElement('div');
  rootElement.id = 'root';
  document.body.appendChild(rootElement);
}
const root = createRoot(rootElement);

const renderFatalBootstrapError = (error) => {
  const message = error && error.message ? String(error.message) : 'Unknown startup error';
  root.render(
    <div className="min-h-screen bg-slate-100 text-slate-700 flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_18px_40px_rgba(15,23,42,0.12)]">
        <h1 className="text-xl font-black tracking-tight text-slate-800">系統啟動失敗</h1>
        <p className="mt-3 text-sm text-slate-500 leading-relaxed">已攔截白屏錯誤。請先重新整理；若仍發生，請回傳下方錯誤訊息。</p>
        <pre className="mt-4 max-h-28 overflow-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-500 border border-slate-200">{message}</pre>
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
};

const bootstrap = async () => {
  try {
    const module = await import('./App.jsx');
    const App = module.default;
    root.render(
      <StrictMode>
        <AppErrorBoundary>
          <App />
        </AppErrorBoundary>
      </StrictMode>,
    );
  } catch (error) {
    console.error('Bootstrap load error:', error);
    const message = error && error.message ? String(error.message) : '';
    if (isChunkLoadErrorMessage(message)) {
      const reloaded = sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === '1';
      if (!reloaded) {
        sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, '1');
        window.location.reload();
        return;
      }
    }
    renderFatalBootstrapError(error);
  }
};

bootstrap();

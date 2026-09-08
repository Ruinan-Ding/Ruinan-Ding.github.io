import ErrorBoundary from './components/ErrorBoundary';
import Home from './pages/Home';
import NotFound from './pages/NotFound';

// One route and a fallback, so there is no router. Anything GitHub Pages
// can't resolve to a file is served dist/404.html, which is this same
// bundle, so the path it arrived on is the whole of what there is to
// branch on. /index.html does resolve, and arrives spelled that way
// rather than as /, which is the same page and has to read as one.
//
// Against BASE_URL rather than a literal '/': vite.config.ts sets the
// base, and a copy of it here is a second place to change that nothing
// links to the first. Under any other base every path would miss and the
// whole site would render as the 404.
const path = window.location.pathname.replace(/\/index\.html$/, '/');

function App() {
  return (
    <ErrorBoundary>
      {path === import.meta.env.BASE_URL ? <Home /> : <NotFound />}
    </ErrorBoundary>
  );
}

export default App;

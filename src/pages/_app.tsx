import type { AppProps } from 'next/app';
// Removed: import '../app/globals.css';
// The global CSS is imported in src/app/layout.tsx for the App Router.

// This _app.tsx is minimal.
// If your application primarily uses the App Router (src/app), this file might be unnecessary.
function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;

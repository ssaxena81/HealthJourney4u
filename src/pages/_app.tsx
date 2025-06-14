import type { AppProps } from 'next/app';
import '../app/globals.css'; // Assuming your global styles are in src/app/globals.css

// This is a minimal _app.tsx for the Pages Router.
// In a pure App Router setup, this file is typically not needed.
// If present, it can sometimes interfere with the App Router build if not correctly handled.
function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}

export default MyApp;

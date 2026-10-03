import { getApiBaseUrl } from './baseUrl';
import { getShell } from '../lib/shell';

/**
 * Open a server endpoint that answers with `Content-Disposition: attachment`, so the
 * browser downloads it. On the web the path is same-origin. In the Android app the page
 * origin is https://localhost (a relative URL would 404) and the WebView can't save
 * files, so the absolute server URL is handed to the system browser, which downloads it.
 */
export function openServerDownload(apiPath: string): void {
  const url = `${getApiBaseUrl() || window.location.origin}/api${apiPath}`;
  // Served from the server (B3), the URL is same-host and window.open would stay inside the
  // WebView, which can't save it — the shell opens it in the system browser instead.
  if (getShell()?.openExternal(url)) return;
  window.open(url, '_blank');
}

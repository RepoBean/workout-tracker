import { getApiBaseUrl } from './baseUrl';

/**
 * Open a server endpoint that answers with `Content-Disposition: attachment`, so the
 * browser downloads it. On the web the path is same-origin. In the Android app the page
 * origin is https://localhost (a relative URL would 404) and the WebView can't save
 * files, so the absolute server URL is handed to the system browser, which downloads it.
 */
export function openServerDownload(apiPath: string): void {
  window.open(`${getApiBaseUrl()}/api${apiPath}`, '_blank');
}

package dev.repobean.workouttracker;

import android.webkit.JavascriptInterface;

/**
 * `window.WorkoutShell` — the page's handle on the native shell (see MainActivity).
 *
 * Every page in the WebView sees this object, including the bundled offline.html (which
 * has no Capacitor bridge), so it stays small: server URL, restart, open-in-browser.
 * Bump VERSION when adding a method; the JS side feature-checks before calling.
 */
public class ShellInterface {

    static final int VERSION = 2;

    private final MainActivity activity;

    ShellInterface(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public int getVersion() {
        return VERSION;
    }

    /** The saved server origin, or "" when the bundled UI is in use. */
    @JavascriptInterface
    public String getServerUrl() {
        String url = activity.getSavedServerUrl();
        return url == null ? "" : url;
    }

    /** Saves an http(s) origin; takes effect on restart(). False when the URL is not usable. */
    @JavascriptInterface
    public boolean setServerUrl(String url) {
        String origin = MainActivity.toOrigin(url);
        if (origin == null) return false;
        activity.saveServerUrl(origin);
        return true;
    }

    /** v2: the user chose the built-in UI (clearServerUrl since the last setServerUrl). */
    @JavascriptInterface
    public boolean isBundledByChoice() {
        return activity.isBundledByChoice();
    }

    /** Back to the bundled UI on restart(). */
    @JavascriptInterface
    public void clearServerUrl() {
        activity.clearServerUrl();
    }

    /** Recreates the activity so the saved server (or the bundled UI) loads. */
    @JavascriptInterface
    public void restart() {
        activity.restartShell();
    }

    /** Opens an http(s) URL in the system browser (downloads; the WebView can't save files). */
    @JavascriptInterface
    public boolean openExternal(String url) {
        return activity.openExternal(url);
    }
}

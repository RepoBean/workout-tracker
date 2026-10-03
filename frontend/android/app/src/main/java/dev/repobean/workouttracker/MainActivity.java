package dev.repobean.workouttracker;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.getcapacitor.Logger;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/**
 * Loads the UI from the user's server instead of the bundled copy (v3 bundle B3).
 *
 * The server origin is saved in SharedPreferences and handed to Capacitor as `server.url`
 * at startup. That matters: Capacitor injects its plugin bridge only into the origin it
 * was started with, so navigating a bundled page to the server would lose BLE,
 * notifications and the foreground service. With no saved server, the bundled UI loads
 * exactly as before. If the server can't be reached, Capacitor shows the bundled
 * `offline.html` (server.errorPath), which can retry or change the server.
 *
 * Pages talk to the shell through `window.WorkoutShell` (ShellInterface below). It is
 * feature-detected on the JS side, so a served frontend never assumes a newer APK.
 */
public class MainActivity extends BridgeActivity {

    static final String PREFS = "workout_shell";
    static final String KEY_SERVER_URL = "server_url";
    private static final String ERROR_PATH = "offline.html";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        String serverUrl = getSavedServerUrl();
        if (serverUrl != null) {
            CapConfig remote = remoteConfig(serverUrl);
            if (remote != null) config = remote;
        }
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void load() {
        // Must be attached before the bridge's first loadUrl: an interface added later only
        // appears after the next page load. Bridge.Builder finds this same WebView by id.
        WebView webView = findViewById(com.getcapacitor.android.R.id.webview);
        if (webView != null) {
            webView.addJavascriptInterface(new ShellInterface(this), "WorkoutShell");
        }
        super.load();
    }

    String getSavedServerUrl() {
        String url = getSharedPreferences(PREFS, MODE_PRIVATE).getString(KEY_SERVER_URL, null);
        return url == null || url.isEmpty() ? null : url;
    }

    void saveServerUrl(String origin) {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_SERVER_URL, origin).apply();
    }

    void clearServerUrl() {
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().remove(KEY_SERVER_URL).apply();
    }

    /** The bundled capacitor.config.json with server.url + errorPath set, loaded from app files. */
    private CapConfig remoteConfig(String serverUrl) {
        try (InputStream in = getAssets().open("capacitor.config.json")) {
            byte[] bytes = new byte[in.available()];
            int read = 0;
            while (read < bytes.length) {
                int n = in.read(bytes, read, bytes.length - read);
                if (n < 0) break;
                read += n;
            }
            JSONObject json = new JSONObject(new String(bytes, 0, read, StandardCharsets.UTF_8));
            JSONObject server = json.optJSONObject("server");
            if (server == null) server = new JSONObject();
            server.put("url", serverUrl);
            server.put("errorPath", ERROR_PATH);
            json.put("server", server);

            File dir = new File(getFilesDir(), "shell-config");
            if (!dir.exists() && !dir.mkdirs()) return null;
            try (FileOutputStream out = new FileOutputStream(new File(dir, "capacitor.config.json"))) {
                out.write(json.toString().getBytes(StandardCharsets.UTF_8));
            }
            return CapConfig.loadFromFile(this, dir.getAbsolutePath());
        } catch (Exception ex) {
            // Fall back to the bundled UI rather than fail to start.
            Logger.error("WorkoutShell: could not build server config", ex);
            return null;
        }
    }

    /** Normalizes to scheme://host[:port]; null unless http(s) with a host. */
    static String toOrigin(String raw) {
        if (raw == null) return null;
        Uri uri = Uri.parse(raw.trim());
        String scheme = uri.getScheme();
        String authority = uri.getEncodedAuthority();
        if (scheme == null || authority == null || authority.isEmpty()) return null;
        scheme = scheme.toLowerCase();
        if (!scheme.equals("http") && !scheme.equals("https")) return null;
        return scheme + "://" + authority;
    }

    void restartShell() {
        runOnUiThread(this::recreate);
    }

    boolean openExternal(String url) {
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
                return false;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        } catch (Exception ex) {
            Logger.error("WorkoutShell: openExternal failed", ex);
            return false;
        }
    }
}

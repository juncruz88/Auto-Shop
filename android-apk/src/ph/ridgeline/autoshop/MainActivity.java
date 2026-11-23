package ph.ridgeline.autoshop;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {

    private static final String START_URL = "https://app.local/index.html";
    private static final String RELEASES_URL = "https://github.com/juncruz88/Auto-Shop/releases/latest";
    private static final int CAMERA_REQUEST = 41;
    private static final int SAVE_BACKUP_REQUEST = 42;
    private static final int OPEN_BACKUP_REQUEST = 43;
    private static final int AUTO_BACKUP_PERMISSION_REQUEST = 44;

    private WebView webView;
    private AutoBackupStore autoBackupStore;
    private PermissionRequest pendingCameraRequest;
    private ValueCallback<Uri[]> pendingFileChooser;
    private volatile String pendingBackupContent;
    private volatile String pendingAutoBackupContent;
    private volatile boolean autoBackupPermissionAsked;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        autoBackupStore = new AutoBackupStore(this);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);

        webView.addJavascriptInterface(new BackupBridge(), "AndroidBackup");
        webView.addJavascriptInterface(new AppBridge(), "AndroidApp");
        webView.addJavascriptInterface(new AutoBackupBridge(), "AndroidAutoBackups");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String path = request.getUrl().getPath();
                if (path == null || path.equals("/")) {
                    path = "/index.html";
                }
                if (path.startsWith("/")) {
                    path = path.substring(1);
                }
                if (path.contains("..")) {
                    return null;
                }
                try {
                    InputStream stream = getAssets().open(path);
                    return new WebResourceResponse(mimeType(path), "utf-8", stream);
                } catch (IOException missing) {
                    return new WebResourceResponse(
                            "text/plain",
                            "utf-8",
                            new ByteArrayInputStream("Not found".getBytes())
                    );
                }
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                boolean wantsCamera = false;
                for (String resource : request.getResources()) {
                    if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) {
                        wantsCamera = true;
                    }
                }
                if (wantsCamera
                        && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    pendingCameraRequest = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
                } else {
                    request.grant(request.getResources());
                }
            }

            @Override
            public boolean onShowFileChooser(
                    WebView view,
                    ValueCallback<Uri[]> callback,
                    FileChooserParams params
            ) {
                if (pendingFileChooser != null) {
                    pendingFileChooser.onReceiveValue(null);
                }
                pendingFileChooser = callback;

                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                startActivityForResult(
                        Intent.createChooser(intent, "Choose backup file"),
                        OPEN_BACKUP_REQUEST
                );
                return true;
            }
        });

        if (savedInstanceState == null) {
            webView.loadUrl(START_URL);
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    /** Receives backup JSON from the web app and lets the user choose where to save it. */
    private class BackupBridge {
        @JavascriptInterface
        public void save(final String filename, final String content) {
            pendingBackupContent = content;
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, filename);
                startActivityForResult(intent, SAVE_BACKUP_REQUEST);
            });
        }
    }

    /** Stores rotating snapshots in shared Downloads so they survive clearing app data. */
    private class AutoBackupBridge {
        @JavascriptInterface
        public boolean save(final String content) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q || hasStorageAccess()) {
                return autoBackupStore.save(content);
            }

            pendingAutoBackupContent = content;
            if (!autoBackupPermissionAsked) {
                autoBackupPermissionAsked = true;
                runOnUiThread(() -> requestPermissions(
                        new String[]{
                                Manifest.permission.WRITE_EXTERNAL_STORAGE,
                                Manifest.permission.READ_EXTERNAL_STORAGE,
                        },
                        AUTO_BACKUP_PERMISSION_REQUEST
                ));
            }
            return false;
        }

        @JavascriptInterface
        public String list() {
            return autoBackupStore.list();
        }

        @JavascriptInterface
        public String read(String id) {
            return autoBackupStore.read(id);
        }
    }

    private boolean hasStorageAccess() {
        return checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED
                && checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED;
    }

    /** Opens the latest GitHub Release in the system browser. */
    private class AppBridge {
        @JavascriptInterface
        public void openReleases() {
            runOnUiThread(() -> {
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(RELEASES_URL)));
                } catch (Exception error) {
                    toast("Could not open the releases page");
                }
            });
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == AUTO_BACKUP_PERMISSION_REQUEST) {
            String content = pendingAutoBackupContent;
            pendingAutoBackupContent = null;
            if (content != null && hasStorageAccess()) {
                autoBackupStore.save(content);
            }
            notifyAutoBackupsChanged();
            return;
        }
        if (requestCode != CAMERA_REQUEST || pendingCameraRequest == null) {
            return;
        }
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            pendingCameraRequest.grant(pendingCameraRequest.getResources());
        } else {
            pendingCameraRequest.deny();
        }
        pendingCameraRequest = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == SAVE_BACKUP_REQUEST) {
            String content = pendingBackupContent;
            pendingBackupContent = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && content != null) {
                try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                    if (out != null) {
                        out.write(content.getBytes(StandardCharsets.UTF_8));
                        out.flush();
                    }
                    toast("Backup saved");
                } catch (Exception error) {
                    toast("Could not save the backup");
                }
            }
            return;
        }

        if (requestCode == OPEN_BACKUP_REQUEST) {
            if (pendingFileChooser == null) {
                return;
            }
            Uri[] results = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    results = new Uri[count];
                    for (int i = 0; i < count; i++) {
                        results[i] = data.getClipData().getItemAt(i).getUri();
                    }
                } else if (data.getData() != null) {
                    results = new Uri[]{data.getData()};
                }
            }
            pendingFileChooser.onReceiveValue(results);
            pendingFileChooser = null;
        }
    }

    private void notifyAutoBackupsChanged() {
        if (webView == null) return;
        webView.post(() -> webView.evaluateJavascript(
                "window.dispatchEvent(new Event('android-auto-backups-changed'))",
                null
        ));
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    private static String mimeType(String path) {
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "text/javascript";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".webmanifest")) return "application/manifest+json";
        if (path.endsWith(".json")) return "application/json";
        return "text/html";
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        super.onDestroy();
    }
}

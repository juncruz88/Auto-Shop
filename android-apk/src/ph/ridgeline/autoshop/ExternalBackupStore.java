package ph.ridgeline.autoshop;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import org.json.JSONObject;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Mirrors automatic snapshots into a folder chosen with Android's Storage Access Framework.
 *
 * The chosen tree can live on a USB SSD, an SD card, or a cloud provider such as Google Drive.
 * Access is persisted across launches, but cloud providers still need a connection when a file
 * is written.
 */
final class ExternalBackupStore {

    static final int MAX_BACKUPS = 10;

    private static final String PREFS = "external-backup";
    private static final String KEY_URI = "tree-uri";
    private static final String KEY_LABEL = "label";
    private static final String PREFIX = "ridgeline-auto-backup-";
    private static final String SUFFIX = ".json";

    private final ContentResolver resolver;
    private final SharedPreferences prefs;

    ExternalBackupStore(Context context) {
        Context appContext = context.getApplicationContext();
        this.resolver = appContext.getContentResolver();
        this.prefs = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    String status() {
        Uri tree = treeUri();
        boolean configured = tree != null;
        try {
            JSONObject result = new JSONObject();
            result.put("configured", configured);
            result.put("ready", configured && hasAccess(tree));
            result.put("label", prefs.getString(KEY_LABEL, ""));
            return result.toString();
        } catch (Exception error) {
            return "{\"configured\":false,\"ready\":false,\"label\":\"\"}";
        }
    }

    void setTree(Uri tree) {
        prefs.edit()
                .putString(KEY_URI, tree.toString())
                .putString(KEY_LABEL, treeLabel(tree))
                .apply();
    }

    void clear() {
        Uri tree = treeUri();
        if (tree != null) {
            int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
                    | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
            try {
                resolver.releasePersistableUriPermission(tree, flags);
            } catch (Exception ignored) {
                // The provider may already have revoked access.
            }
        }
        prefs.edit().remove(KEY_URI).remove(KEY_LABEL).apply();
    }

    String save(String json) {
        Uri tree = treeUri();
        if (tree == null) {
            return result("not-configured", "No backup folder chosen.");
        }
        if (!hasAccess(tree)) {
            return result(
                    "failed",
                    "The app no longer has access to that folder. Choose it again."
            );
        }

        try {
            writeFile(tree, json);
            prune(tree);
            return result("saved", "");
        } catch (SecurityException error) {
            return result(
                    "failed",
                    "The app no longer has access to that folder. Choose it again."
            );
        } catch (Exception error) {
            return result(
                    "failed",
                    "Could not write to the backup folder. Check the connection or free space."
            );
        }
    }

    private void writeFile(Uri tree, String json) throws IOException {
        Uri parent = DocumentsContract.buildDocumentUriUsingTree(
                tree,
                DocumentsContract.getTreeDocumentId(tree)
        );
        Uri file = DocumentsContract.createDocument(
                resolver,
                parent,
                "application/json",
                nextName(tree)
        );
        if (file == null) {
            throw new IOException("Could not create the backup file.");
        }

        try {
            try (OutputStream out = resolver.openOutputStream(file)) {
                if (out == null) throw new IOException("Could not open the backup file.");
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
        } catch (Exception error) {
            try {
                DocumentsContract.deleteDocument(resolver, file);
            } catch (Exception ignored) {
                // Leave a partial file rather than masking the original failure.
            }
            if (error instanceof IOException) throw (IOException) error;
            throw new IOException("Could not write the backup file.", error);
        }
    }

    private String nextName(Uri tree) {
        Set<String> names = new HashSet<>();
        for (Child child : children(tree)) {
            names.add(child.name);
        }

        String base = PREFIX + System.currentTimeMillis();
        String name = base + SUFFIX;
        int suffix = 1;
        while (names.contains(name)) {
            name = base + "-" + suffix + SUFFIX;
            suffix += 1;
        }
        return name;
    }

    private void prune(Uri tree) {
        try {
            List<Child> children = children(tree);
            children.sort((left, right) -> {
                int byTime = Long.compare(right.modified, left.modified);
                return byTime != 0 ? byTime : right.name.compareTo(left.name);
            });

            for (int index = MAX_BACKUPS; index < children.size(); index += 1) {
                Child child = children.get(index);
                Uri uri = DocumentsContract.buildDocumentUriUsingTree(tree, child.documentId);
                try {
                    DocumentsContract.deleteDocument(resolver, uri);
                } catch (Exception ignored) {
                    // Keeping an extra file is safer than failing a successful snapshot.
                }
            }
        } catch (Exception ignored) {
            // The snapshot was written; pruning can be retried on the next save.
        }
    }

    private List<Child> children(Uri tree) {
        List<Child> children = new ArrayList<>();
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
                tree,
                DocumentsContract.getTreeDocumentId(tree)
        );
        String[] projection = {
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_LAST_MODIFIED,
        };

        try (Cursor cursor = resolver.query(childrenUri, projection, null, null, null)) {
            if (cursor == null) return children;
            while (cursor.moveToNext()) {
                String documentId = cursor.getString(0);
                String name = cursor.getString(1);
                if (documentId == null || name == null) continue;
                if (!name.startsWith(PREFIX) || !name.endsWith(SUFFIX)) continue;
                long modified = cursor.isNull(2) ? 0L : cursor.getLong(2);
                children.add(new Child(documentId, name, modified));
            }
        }
        return children;
    }

    private boolean hasAccess(Uri tree) {
        for (UriPermission permission : resolver.getPersistedUriPermissions()) {
            if (permission.getUri().equals(tree)
                    && permission.isReadPermission()
                    && permission.isWritePermission()) {
                return true;
            }
        }
        return false;
    }

    private Uri treeUri() {
        String raw = prefs.getString(KEY_URI, null);
        if (raw == null) return null;
        try {
            return Uri.parse(raw);
        } catch (Exception error) {
            return null;
        }
    }

    private String treeLabel(Uri tree) {
        try {
            Uri document = DocumentsContract.buildDocumentUriUsingTree(
                    tree,
                    DocumentsContract.getTreeDocumentId(tree)
            );
            try (Cursor cursor = resolver.query(
                    document,
                    new String[]{DocumentsContract.Document.COLUMN_DISPLAY_NAME},
                    null,
                    null,
                    null
            )) {
                if (cursor != null && cursor.moveToFirst()) {
                    String name = cursor.getString(0);
                    if (name != null && !name.trim().isEmpty()) return name.trim();
                }
            }
        } catch (Exception ignored) {
            // Fall back to a neutral label when the provider cannot be queried.
        }
        return "Selected folder";
    }

    private static String result(String status, String reason) {
        try {
            JSONObject result = new JSONObject();
            result.put("status", status);
            if (reason != null && !reason.isEmpty()) result.put("reason", reason);
            return result.toString();
        } catch (Exception error) {
            return "{\"status\":\"failed\"}";
        }
    }

    private static final class Child {
        final String documentId;
        final String name;
        final long modified;

        Child(String documentId, String name, long modified) {
            this.documentId = documentId;
            this.name = name;
            this.modified = modified;
        }
    }
}

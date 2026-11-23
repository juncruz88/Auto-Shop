package ph.ridgeline.autoshop;

import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * Keeps the newest automatic backups in shared Downloads.
 *
 * On Android 10+ this uses MediaStore and needs no storage permission. Android 6-9 needs the
 * legacy storage permission because shared Downloads is outside the app's private storage.
 */
final class AutoBackupStore {

    static final int MAX_BACKUPS = 10;

    private static final String FOLDER = "Ridgeline Auto Shop";
    private static final String PREFIX = "ridgeline-auto-backup-";
    private static final String SUFFIX = ".json";

    private final Context context;

    AutoBackupStore(Context context) {
        this.context = context.getApplicationContext();
    }

    boolean save(String json) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                return saveDownload(json);
            }
            return saveLegacy(json);
        } catch (Exception error) {
            return false;
        }
    }

    String list() {
        try {
            List<JSONObject> entries = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? listDownloads()
                    : listLegacy();
            Collections.sort(entries, (left, right) -> right.optString("savedAt")
                    .compareTo(left.optString("savedAt")));

            JSONArray result = new JSONArray();
            for (JSONObject entry : entries) {
                result.put(entry);
            }
            return result.toString();
        } catch (Exception error) {
            return "[]";
        }
    }

    String read(String id) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                return readDownload(id);
            }
            return readLegacy(id);
        } catch (Exception error) {
            return null;
        }
    }

    private boolean saveDownload(String json) throws IOException {
        ContentResolver resolver = context.getContentResolver();
        String filename = PREFIX + System.currentTimeMillis() + SUFFIX;

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
        values.put(MediaStore.Downloads.RELATIVE_PATH, downloadPath());
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) return false;

        try {
            try (OutputStream out = resolver.openOutputStream(uri)) {
                if (out == null) throw new IOException("Could not open the shared backup file.");
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }

            ContentValues ready = new ContentValues();
            ready.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, ready, null, null);
            pruneDownloads(resolver);
            return true;
        } catch (Exception error) {
            resolver.delete(uri, null, null);
            throw error;
        }
    }

    private List<JSONObject> listDownloads() throws IOException {
        ContentResolver resolver = context.getContentResolver();
        String[] projection = {MediaStore.Downloads._ID};
        String selection = MediaStore.Downloads.RELATIVE_PATH + " LIKE ? AND "
                + MediaStore.Downloads.DISPLAY_NAME + " LIKE ?";
        String[] args = {downloadPath() + "%", PREFIX + "%"};
        String order = MediaStore.Downloads.DATE_ADDED + " DESC, "
                + MediaStore.Downloads._ID + " DESC";

        List<JSONObject> entries = new ArrayList<>();
        try (Cursor cursor = resolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                args,
                order
        )) {
            if (cursor == null) return entries;
            while (cursor.moveToNext()) {
                String id = String.valueOf(cursor.getLong(0));
                JSONObject summary = summary(id, readDownload(id));
                if (summary != null) entries.add(summary);
            }
        }
        return entries;
    }

    private String readDownload(String id) throws IOException {
        long numericId;
        try {
            numericId = Long.parseLong(id);
        } catch (NumberFormatException error) {
            return null;
        }

        ContentResolver resolver = context.getContentResolver();
        Uri uri = ContentUris.withAppendedId(MediaStore.Downloads.EXTERNAL_CONTENT_URI, numericId);
        String selection = MediaStore.Downloads.RELATIVE_PATH + " LIKE ? AND "
                + MediaStore.Downloads.DISPLAY_NAME + " LIKE ?";
        String[] args = {downloadPath() + "%", PREFIX + "%"};

        try (Cursor cursor = resolver.query(
                uri,
                new String[]{MediaStore.Downloads._ID},
                selection,
                args,
                null
        )) {
            if (cursor == null || !cursor.moveToFirst()) return null;
        }

        try (InputStream in = resolver.openInputStream(uri)) {
            return in == null ? null : readAll(in);
        }
    }

    private void pruneDownloads(ContentResolver resolver) {
        String[] projection = {MediaStore.Downloads._ID};
        String selection = MediaStore.Downloads.RELATIVE_PATH + " LIKE ? AND "
                + MediaStore.Downloads.DISPLAY_NAME + " LIKE ?";
        String[] args = {downloadPath() + "%", PREFIX + "%"};
        String order = MediaStore.Downloads.DATE_ADDED + " DESC, "
                + MediaStore.Downloads._ID + " DESC";

        try (Cursor cursor = resolver.query(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                projection,
                selection,
                args,
                order
        )) {
            if (cursor == null) return;
            int kept = 0;
            while (cursor.moveToNext()) {
                kept += 1;
                if (kept <= MAX_BACKUPS) continue;
                Uri uri = ContentUris.withAppendedId(
                        MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                        cursor.getLong(0)
                );
                resolver.delete(uri, null, null);
            }
        }
    }

    private boolean saveLegacy(String json) throws IOException {
        File folder = legacyFolder();
        if (!folder.exists() && !folder.mkdirs()) return false;

        long stamp = System.currentTimeMillis();
        File file = new File(folder, PREFIX + stamp + SUFFIX);
        int suffix = 1;
        while (file.exists()) {
            file = new File(folder, PREFIX + stamp + "-" + suffix + SUFFIX);
            suffix += 1;
        }
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
            out.flush();
        }
        pruneLegacy(folder);
        return true;
    }

    private List<JSONObject> listLegacy() throws IOException {
        File folder = legacyFolder();
        File[] files = backupFiles(folder);
        if (files == null) return new ArrayList<>();

        Arrays.sort(files, (left, right) -> Long.compare(right.lastModified(), left.lastModified()));
        List<JSONObject> entries = new ArrayList<>();
        for (File file : files) {
            JSONObject summary = summary(file.getName(), readFile(file));
            if (summary != null) entries.add(summary);
        }
        return entries;
    }

    private String readLegacy(String id) throws IOException {
        if (id == null
                || !id.startsWith(PREFIX)
                || !id.endsWith(SUFFIX)
                || id.contains("/")
                || id.contains("\\")
                || id.contains("..")) {
            return null;
        }
        File file = new File(legacyFolder(), id);
        return file.isFile() ? readFile(file) : null;
    }

    private void pruneLegacy(File folder) {
        File[] files = backupFiles(folder);
        if (files == null) return;
        Arrays.sort(files, (left, right) -> Long.compare(left.lastModified(), right.lastModified()));
        for (int index = 0; index < files.length - MAX_BACKUPS; index += 1) {
            files[index].delete();
        }
    }

    private static File[] backupFiles(File folder) {
        return folder.listFiles((dir, name) -> name.startsWith(PREFIX) && name.endsWith(SUFFIX));
    }

    private File legacyFolder() {
        return new File(
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                FOLDER
        );
    }

    private static JSONObject summary(String id, String json) {
        if (json == null) return null;
        try {
            JSONObject record = new JSONObject(json);
            JSONObject summary = new JSONObject();
            summary.put("id", id);
            summary.put("savedAt", record.optString("savedAt"));
            summary.put("customers", record.optInt("customers"));
            summary.put("vehicles", record.optInt("vehicles"));
            summary.put("jobs", record.optInt("jobs"));
            summary.put("items", record.optInt("items"));
            summary.put("appointments", record.optInt("appointments"));
            return summary;
        } catch (Exception error) {
            return null;
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int count;
        while ((count = in.read(buffer)) != -1) {
            out.write(buffer, 0, count);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private static String readFile(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            return readAll(in);
        }
    }

    private static String downloadPath() {
        return Environment.DIRECTORY_DOWNLOADS + "/" + FOLDER + "/";
    }
}

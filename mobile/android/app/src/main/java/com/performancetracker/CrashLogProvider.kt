package com.performancetracker

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Installs a process-wide UncaughtExceptionHandler the moment the process
 * starts (ContentProviders initialize before Application.onCreate), so any
 * crash - native or a release-mode JavaScript error - is written to files:
 *
 *   1. app-private dir:  files/perf-tracker-crash-*.txt
 *   2. user-visible dir: Downloads/perf-tracker-crash-*.txt (Android 10+)
 *
 * The Downloads copy is readable with any Files app - no adb, no developer
 * options. Diagnostics must never crash the app or block crash delivery, so
 * every step is guarded and the previous handler is always chained.
 */
class CrashLogProvider : ContentProvider() {

    override fun onCreate(): Boolean {
        try {
            val appContext = context?.applicationContext ?: return true
            val previous = Thread.getDefaultUncaughtExceptionHandler()
            Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
                try {
                    CrashLogWriter.write(appContext, thread, throwable)
                } catch (ignored: Throwable) {
                    // never let logging itself interfere with crash handling
                }
                previous?.uncaughtException(thread, throwable)
            }
        } catch (ignored: Throwable) {
            // diagnostics must never prevent startup
        }
        return true
    }

    override fun query(uri: Uri, projection: Array<String>?, selection: String?, selectionArgs: Array<String>?, sortOrder: String?): Cursor? = null

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<String>?): Int = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<String>?): Int = 0
}

object CrashLogWriter {
    private const val PREFIX = "perf-tracker-crash"

    fun write(context: Context, thread: Thread, throwable: Throwable) {
        val report = buildReport(context, thread, throwable)
        writeAppPrivate(context, report)
        writeDownloads(context, report)
    }

    private fun buildReport(context: Context, thread: Thread, throwable: Throwable): String {
        val sb = StringBuilder()
        sb.append("Performance Tracker crash report")
        sb.append('\n')
        sb.append("time: ")
        sb.append(SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date()))
        sb.append('\n')
        try {
            val info = context.packageManager.getPackageInfo(context.packageName, 0)
            sb.append("app version: ").append(info.versionName)
            sb.append('\n')
        } catch (ignored: Throwable) {
            sb.append("app version: unknown")
            sb.append('\n')
        }
        sb.append("device: ").append(Build.MANUFACTURER).append(' ').append(Build.MODEL)
        sb.append(", Android ").append(Build.VERSION.RELEASE)
        sb.append(" (API ").append(Build.VERSION.SDK_INT).append(")")
        sb.append('\n')
        sb.append("thread: ").append(thread.name)
        sb.append('\n')
        sb.append('\n')
        sb.append("stack trace:")
        sb.append('\n')
        val sw = StringWriter()
        throwable.printStackTrace(PrintWriter(sw))
        sb.append(sw.toString())
        return sb.toString()
    }

    private fun writeAppPrivate(context: Context, report: String) {
        try {
            val dir = context.getExternalFilesDir(null) ?: File(context.filesDir, "crash")
            if (!dir.exists()) dir.mkdirs()
            File(dir, PREFIX + "-latest.txt").writeText(report)
            File(dir, PREFIX + "-" + System.currentTimeMillis() + ".txt").writeText(report)
        } catch (ignored: Throwable) {
        }
    }

    private fun writeDownloads(context: Context, report: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        try {
            val resolver = context.contentResolver
            val values = ContentValues()
            values.put(MediaStore.Downloads.DISPLAY_NAME, PREFIX + "-" + System.currentTimeMillis() + ".txt")
            values.put(MediaStore.Downloads.MIME_TYPE, "text/plain")
            values.put(MediaStore.Downloads.IS_PENDING, 1)
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return
            try {
                resolver.openOutputStream(uri)?.use { stream ->
                    stream.write(report.toByteArray())
                }
                values.clear()
                values.put(MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            } catch (ignored: Throwable) {
                try {
                    resolver.delete(uri, null, null)
                } catch (ignoredAgain: Throwable) {
                }
            }
        } catch (ignored: Throwable) {
        }
    }
}

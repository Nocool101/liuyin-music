package cn.lycool.app.media;

import android.content.Context;
import android.os.Process;

import java.io.File;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * 原生层文件日志（荣耀等 ROM 的 logcat 被加密/过滤，无法用 adb 直接查看）。
 * 写入 /sdcard/Android/data/cn.lycool.app/files/liuyin_media.log，可用 adb pull 取出。
 */
public class MediaLog {
    private static volatile File sFile;
    private static final Object LOCK = new Object();

    public static void log(Context context, String msg) {
        try {
            File f = sFile;
            if (f == null) {
                synchronized (LOCK) {
                    f = sFile;
                    if (f == null) {
                        File dir = context.getApplicationContext().getExternalFilesDir(null);
                        if (dir == null) return;
                        f = new File(dir, "liuyin_media.log");
                        sFile = f;
                    }
                }
            }
            String time = new SimpleDateFormat("MM-dd HH:mm:ss.SSS", Locale.US).format(new Date());
            String line = time + " [pid:" + Process.myPid() + "] " + msg + "\n";
            synchronized (LOCK) {
                FileOutputStream os = new FileOutputStream(f, true);
                os.write(line.getBytes("UTF-8"));
                os.close();
            }
        } catch (Throwable ignored) {
        }
    }
}

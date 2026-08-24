package cn.lycool.app;

import android.os.Build;
import android.os.Environment;
import android.util.Log;

import com.facebook.react.PackageList;
import com.reactnativenavigation.NavigationApplication;
import com.facebook.react.ReactNativeHost;
import com.facebook.react.ReactPackage;
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint;
import com.reactnativenavigation.react.NavigationReactNativeHost;
import java.io.File;
import java.io.FileOutputStream;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

import cn.lycool.app.cache.CachePackage;
import cn.lycool.app.crypto.CryptoPackage;
import cn.lycool.app.lyric.LyricPackage;
import cn.lycool.app.media.MediaBridgePackage;
import cn.lycool.app.player.LiuyinPlayerPackage;
import cn.lycool.app.userApi.UserApiPackage;
import cn.lycool.app.utils.UtilsPackage;

public class MainApplication extends NavigationApplication {

  private final ReactNativeHost mReactNativeHost =
      new NavigationReactNativeHost(this) {
        @Override
        public boolean getUseDeveloperSupport() {
          return BuildConfig.DEBUG;
        }

        @Override
        protected List<ReactPackage> getPackages() {
          @SuppressWarnings("UnnecessaryLocalVariable")
          List<ReactPackage> packages = new PackageList(this).getPackages();
          packages.add(new CachePackage());
          packages.add(new LyricPackage());
          packages.add(new UtilsPackage());
          packages.add(new CryptoPackage());
          packages.add(new UserApiPackage());
          packages.add(new MediaBridgePackage());
          packages.add(new LiuyinPlayerPackage());
          return packages;
        }

        @Override
        protected String getJSMainModuleName() {
          return "index";
        }

        @Override
        protected boolean isNewArchEnabled() {
          return BuildConfig.IS_NEW_ARCHITECTURE_ENABLED;
        }

        @Override
        protected Boolean isHermesEnabled() {
          return BuildConfig.IS_HERMES_ENABLED;
        }
      };

  @Override
  public ReactNativeHost getReactNativeHost() {
    return mReactNativeHost;
  }

  private void writeCrashLog(Throwable t) {
    try {
      File dir = new File(getExternalFilesDir(null), "lycool");
      if (!dir.exists()) dir.mkdirs();
      File file = new File(dir, "crash.txt");
      String ts = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
      StringBuilder sb = new StringBuilder();
      sb.append("=== Crash at ").append(ts).append(" ===\n");
      sb.append("SDK: ").append(Build.VERSION.SDK_INT).append(" / ").append(Build.VERSION.RELEASE).append("\n");
      sb.append("Model: ").append(Build.MODEL).append("\n");
      if (t != null) {
        sb.append("Thread: ").append(Thread.currentThread().getName()).append("\n");
        java.io.StringWriter sw = new java.io.StringWriter();
        t.printStackTrace(new PrintWriter(sw));
        sb.append(sw.toString());
      } else {
        sb.append("t == null");
      }
      sb.append("\n");
      FileOutputStream fos = new FileOutputStream(file, true);
      fos.write(sb.toString().getBytes());
      fos.close();
      Log.e("lycool", sb.toString());
    } catch (Throwable e) {
      Log.e("lycool", "writeCrashLog failed", e);
    }
  }

  @Override
  public void onCreate() {
    super.onCreate();

    Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
      @Override
      public void uncaughtException(Thread thread, Throwable t) {
        writeCrashLog(t);
        // fall back to default handler
        Thread.UncaughtExceptionHandler defaultHandler = Thread.getDefaultUncaughtExceptionHandler();
        if (defaultHandler != null && defaultHandler != this) {
          defaultHandler.uncaughtException(thread, t);
        } else {
          android.os.Process.killProcess(android.os.Process.myPid());
        }
      }
    });

    try {
      if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
        DefaultNewArchitectureEntryPoint.load();
      }
    } catch (Throwable t) {
      writeCrashLog(t);
      throw t;
    }
  }
}

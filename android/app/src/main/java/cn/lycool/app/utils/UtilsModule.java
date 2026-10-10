package cn.lycool.app.utils;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.Manifest;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.WindowManager;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.modules.core.PermissionAwareActivity;

import java.util.Locale;

public class UtilsModule extends ReactContextBaseJavaModule {

  private static final int REQUEST_CODE_NOTIFICATION = 1001;

  public UtilsModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "UtilsModule";
  }

  @ReactMethod
  public void exitApp() {
    Activity activity = getCurrentActivity();
    if (activity == null) return;
    activity.runOnUiThread(() -> {
      activity.finish();
    });
  }

  @ReactMethod
  public void getSupportedAbis(Promise promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      String[] abis = Build.SUPPORTED_ABIS;
      promise.resolve(Arguments.makeNativeArray(abis));
    } else {
      String[] abis = { Build.CPU_ABI };
      promise.resolve(Arguments.makeNativeArray(abis));
    }
  }

  @ReactMethod
  public void installApk(String filePath, String fileProviderAuthority) {
    // Not supported
  }

  @ReactMethod
  public void screenkeepAwake() {
    Activity activity = getCurrentActivity();
    if (activity == null) return;
    activity.runOnUiThread(() -> {
      activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    });
  }

  @ReactMethod
  public void screenUnkeepAwake() {
    Activity activity = getCurrentActivity();
    if (activity == null) return;
    activity.runOnUiThread(() -> {
      activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    });
  }

  @ReactMethod
  public void getWIFIIPV4Address(Promise promise) {
    promise.resolve("0.0.0.0");
  }

  @ReactMethod
  public void getDeviceName(Promise promise) {
    String deviceName = Build.MODEL;
    promise.resolve(deviceName);
  }

  @ReactMethod
  public void isNotificationsEnabled(Promise promise) {
    Context context = getReactApplicationContext();
    NotificationManagerCompat nm = NotificationManagerCompat.from(context);
    promise.resolve(nm.areNotificationsEnabled());
  }

  @ReactMethod
  public void openNotificationPermissionActivity(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.resolve(false);
      return;
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      // Android 13+：已授权则直接返回；否则弹系统运行时权限对话框，用户点"允许"即授权
      if (ContextCompat.checkSelfPermission(getReactApplicationContext(), Manifest.permission.POST_NOTIFICATIONS)
          == PackageManager.PERMISSION_GRANTED) {
        promise.resolve(true);
        return;
      }
      if (!(activity instanceof PermissionAwareActivity)) {
        promise.resolve(false);
        return;
      }
      final PermissionAwareActivity awareActivity = (PermissionAwareActivity) activity;
      activity.runOnUiThread(() -> {
        try {
          awareActivity.requestPermissions(
            new String[] { Manifest.permission.POST_NOTIFICATIONS },
            REQUEST_CODE_NOTIFICATION,
            (requestCode, permissions, grantResults) -> {
              boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
              promise.resolve(granted);
              return true;
            }
          );
        } catch (Exception e) {
          promise.resolve(false);
        }
      });
    } else {
      // Android 13 以下通知默认开启；若被禁用则打开系统通知设置页（resolve null 表示走设置页，JS 等待回前台再检测）
      try {
        Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        intent.putExtra(Settings.EXTRA_APP_PACKAGE, getReactApplicationContext().getPackageName());
        activity.startActivity(intent);
        promise.resolve(null);
      } catch (Exception e) {
        promise.resolve(null);
      }
    }
  }

  @ReactMethod
  public void shareText(String shareTitle, String title, String text) {
    Activity activity = getCurrentActivity();
    if (activity == null) return;
    activity.runOnUiThread(() -> {
      try {
        Intent sendIntent = new Intent();
        sendIntent.setAction(Intent.ACTION_SEND);
        sendIntent.putExtra(Intent.EXTRA_TEXT, text);
        sendIntent.putExtra(Intent.EXTRA_TITLE, title);
        sendIntent.putExtra(Intent.EXTRA_SUBJECT, shareTitle);
        sendIntent.setType("text/plain");
        Intent chooser = Intent.createChooser(sendIntent, title);
        activity.startActivity(chooser);
      } catch (Exception e) {
        // ignored
      }
    });
  }

  @ReactMethod
  public void shareImage(String filePath, String title) {
    Activity activity = getCurrentActivity();
    if (activity == null) return;
    try {
      java.io.File file = new java.io.File(filePath);
      if (!file.exists()) return;
      android.net.Uri uri = androidx.core.content.FileProvider.getUriForFile(
        getReactApplicationContext(), getReactApplicationContext().getPackageName() + ".provider", file);
      Intent sendIntent = new Intent();
      sendIntent.setAction(Intent.ACTION_SEND);
      sendIntent.setType("image/png");
      sendIntent.putExtra(Intent.EXTRA_STREAM, uri);
      sendIntent.putExtra(Intent.EXTRA_TITLE, title);
      sendIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      activity.runOnUiThread(() -> {
        try {
          activity.startActivity(Intent.createChooser(sendIntent, title));
        } catch (Exception ignored) {}
      });
    } catch (Exception ignored) {}
  }

  @ReactMethod
  public void getSystemLocales(Promise promise) {
    Locale locale = Locale.getDefault();
    promise.resolve(locale.toLanguageTag());
  }

  @ReactMethod
  public void getWindowSize(Promise promise) {
    Activity activity = getCurrentActivity();
    WritableMap map = Arguments.createMap();
    if (activity != null) {
      DisplayMetrics metrics = new DisplayMetrics();
      activity.getWindowManager().getDefaultDisplay().getMetrics(metrics);
      map.putDouble("width", metrics.widthPixels);
      map.putDouble("height", metrics.heightPixels);
    } else {
      DisplayMetrics metrics = getReactApplicationContext().getResources().getDisplayMetrics();
      map.putDouble("width", metrics.widthPixels);
      map.putDouble("height", metrics.heightPixels);
    }
    promise.resolve(map);
  }

  @ReactMethod
  public void listenWindowSizeChanged() {
    // Not supported
  }

  @ReactMethod
  public void isIgnoringBatteryOptimization(Promise promise) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      PowerManager pm = (PowerManager) getReactApplicationContext().getSystemService(Context.POWER_SERVICE);
      if (pm == null) {
        promise.resolve(true);
        return;
      }
      promise.resolve(pm.isIgnoringBatteryOptimizations(getReactApplicationContext().getPackageName()));
    } else {
      promise.resolve(true);
    }
  }

  @ReactMethod
  public void requestIgnoreBatteryOptimization(Promise promise) {
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.resolve(false);
      return;
    }
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(true);
      return;
    }
    activity.runOnUiThread(() -> {
      try {
        // 直接弹系统对话框，用户点"允许"即生效，无需进设置
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getReactApplicationContext().getPackageName()));
        activity.startActivity(intent);
        promise.resolve(true);
      } catch (Exception e) {
        try {
          // 部分 ROM 没有该页面，回退到电池优化列表页
          activity.startActivity(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS));
          promise.resolve(true);
        } catch (Exception e2) {
          promise.resolve(false);
        }
      }
    });
  }

  @ReactMethod
  public void getSystemInsets(Promise promise) {
    Activity activity = getCurrentActivity();
    WritableMap map = Arguments.createMap();
    if (activity == null) {
      map.putDouble("top", 0);
      map.putDouble("bottom", 0);
      map.putDouble("left", 0);
      map.putDouble("right", 0);
      promise.resolve(map);
      return;
    }
    activity.runOnUiThread(() -> {
      try {
        View decor = activity.getWindow().getDecorView();
        float density = activity.getResources().getDisplayMetrics().density;
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decor);
        boolean landscape = activity.getResources().getConfiguration().orientation
            == android.content.res.Configuration.ORIENTATION_LANDSCAPE;
        if (insets != null) {
          androidx.core.graphics.Insets navInsets = insets.getInsets(WindowInsetsCompat.Type.navigationBars());
          androidx.core.graphics.Insets statusInsets = insets.getInsets(WindowInsetsCompat.Type.statusBars());
          map.putDouble("top", statusInsets.top / density);
          map.putDouble("bottom", navInsets.bottom / density);
          map.putDouble("left", navInsets.left / density);
          map.putDouble("right", navInsets.right / density);
        } else if (!landscape) {
          int resId = activity.getResources().getIdentifier("navigation_bar_height", "dimen", "android");
          int navHeight = resId > 0 ? activity.getResources().getDimensionPixelSize(resId) : 0;
          map.putDouble("top", 0);
          map.putDouble("bottom", navHeight / density);
          map.putDouble("left", 0);
          map.putDouble("right", 0);
        } else {
          map.putDouble("top", 0);
          map.putDouble("bottom", 0);
          map.putDouble("left", 0);
          map.putDouble("right", 0);
        }
        promise.resolve(map);
      } catch (Throwable t) {
        map.putDouble("top", 0);
        map.putDouble("bottom", 0);
        map.putDouble("left", 0);
        map.putDouble("right", 0);
        promise.resolve(map);
      }
    });
  }
}

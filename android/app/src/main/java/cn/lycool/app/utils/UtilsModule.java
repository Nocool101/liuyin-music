package cn.lycool.app.utils;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.WindowManager;

import androidx.core.app.NotificationManagerCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.facebook.react.modules.core.PermissionAwareActivity;
import com.facebook.react.modules.core.PermissionListener;

import java.lang.ref.WeakReference;
import java.util.Locale;

public class UtilsModule extends ReactContextBaseJavaModule {

  private static final int REQUEST_CODE_POST_NOTIFICATIONS = 21001;
  /** 弱引用持有通知权限回调，避免静态引用 Activity 导致泄漏 */
  private static WeakReference<PermissionListener> sNotificationPermissionListener;

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
    Context context = getReactApplicationContext();
    NotificationManagerCompat nm = NotificationManagerCompat.from(context);
    // 已开启则直接成功
    if (nm.areNotificationsEnabled()) {
      promise.resolve(true);
      return;
    }
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.resolve(false);
      return;
    }
    if (Build.VERSION.SDK_INT >= 33) {
      // Android 13+：先弹系统运行时权限弹窗（点"允许"即直接授权）
      activity.runOnUiThread(() -> {
        try {
          PermissionAwareActivity pa = (PermissionAwareActivity) activity;
          PermissionListener listener = (requestCode, permissions, grantResults) -> {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (granted) {
              promise.resolve(true);
              return true;
            }
            // 被拒绝（含永久拒绝）：跳转系统应用通知设置页兜底
            openAppNotificationSettings(activity, context);
            promise.resolve(true);
            return true;
          };
          sNotificationPermissionListener = new WeakReference<>(listener);
          pa.requestPermissions(new String[]{ "android.permission.POST_NOTIFICATIONS" },
            REQUEST_CODE_POST_NOTIFICATIONS, listener);
        } catch (Throwable t) {
          openAppNotificationSettings(activity, context);
          promise.resolve(true);
        }
      });
    } else {
      // Android 13 以下没有通知运行时权限，跳转本应用通知设置页
      openAppNotificationSettings(activity, context);
      promise.resolve(true);
    }
  }

  private void openAppNotificationSettings(Activity activity, Context context) {
    try {
      Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
      intent.putExtra(Settings.EXTRA_APP_PACKAGE, context.getPackageName());
      activity.startActivity(intent);
    } catch (Throwable ignored) {
      try {
        activity.startActivity(new Intent(Settings.ACTION_SETTINGS));
      } catch (Throwable ignored2) {
      }
    }
  }

  @ReactMethod
  public void shareText(String shareTitle, String title, String text) {
    // Not supported
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

  /**
   * JS 启动时兜底读取：内容被 ROM 强制延伸到系统栏下面时需要预留的高度（px）。
   * top：状态栏遮挡（竖屏），bottom：导航栏/手势条遮挡。详见 SystemUiHolder 注释。
   */
  @ReactMethod
  public void getStatusBarReserve(Promise promise) {
    WritableMap map = Arguments.createMap();
    map.putDouble("top", SystemUiHolder.statusbarReserve);
    map.putDouble("bottom", SystemUiHolder.navbarReserve);
    promise.resolve(map);
  }

  @ReactMethod
  public void isIgnoringBatteryOptimization(Promise promise) {
    Context context = getReactApplicationContext();
    PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
    promise.resolve(pm == null || pm.isIgnoringBatteryOptimizations(context.getPackageName()));
  }

  @ReactMethod
  public void requestIgnoreBatteryOptimization(Promise promise) {
    Context context = getReactApplicationContext();
    PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
    if (pm == null || pm.isIgnoringBatteryOptimizations(context.getPackageName())) {
      promise.resolve(true);
      return;
    }
    Activity activity = getCurrentActivity();
    if (activity == null) {
      promise.resolve(false);
      return;
    }
    activity.runOnUiThread(() -> {
      try {
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + context.getPackageName()));
        activity.startActivity(intent);
        promise.resolve(true);
      } catch (Throwable t) {
        promise.resolve(false);
      }
    });
  }
}

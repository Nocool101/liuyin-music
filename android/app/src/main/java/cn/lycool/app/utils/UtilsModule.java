package cn.lycool.app.utils;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.DisplayMetrics;
import android.view.View;
import android.view.WindowManager;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.Locale;

public class UtilsModule extends ReactContextBaseJavaModule {

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
    promise.resolve(true);
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
    promise.resolve(true);
  }

  @ReactMethod
  public void requestIgnoreBatteryOptimization(Promise promise) {
    promise.resolve(true);
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

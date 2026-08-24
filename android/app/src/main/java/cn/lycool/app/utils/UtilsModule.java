package cn.lycool.app.utils;

import android.app.Activity;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
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

  @ReactMethod
  public void isIgnoringBatteryOptimization(Promise promise) {
    promise.resolve(true);
  }

  @ReactMethod
  public void requestIgnoreBatteryOptimization(Promise promise) {
    promise.resolve(true);
  }
}

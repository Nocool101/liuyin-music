package cn.lycool.app.userApi;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;

public class UserApiModule extends ReactContextBaseJavaModule {

  public UserApiModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "UserApiModule";
  }

  @ReactMethod
  public void loadScript(ReadableMap params) {
  }

  @ReactMethod
  public void sendAction(String action, String data) {
  }

  @ReactMethod
  public void destroy() {
  }
}

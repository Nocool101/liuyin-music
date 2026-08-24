package cn.lycool.app.cache;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import cn.lycool.app.player.PlayerCache;

public class CacheModule extends ReactContextBaseJavaModule {

  public CacheModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "CacheModule";
  }

  @ReactMethod
  public void getAppCacheSize(Promise promise) {
    try {
      // long 在 RN 桥接中不可转换，需以 double 传递
      promise.resolve((double) PlayerCache.getInstance(getReactApplicationContext()).getCacheSpace());
    } catch (Throwable t) {
      promise.reject("CACHE_SIZE_ERROR", t);
    }
  }

  @ReactMethod
  public void clearAppCache(Promise promise) {
    try {
      PlayerCache.getInstance(getReactApplicationContext()).clear();
      promise.resolve(null);
    } catch (Throwable t) {
      promise.reject("CACHE_CLEAR_ERROR", t);
    }
  }
}

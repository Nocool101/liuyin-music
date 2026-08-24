package cn.lycool.app.crypto;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.Arguments;

import java.security.MessageDigest;

public class CryptoModule extends ReactContextBaseJavaModule {

  public CryptoModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "CryptoModule";
  }

  @ReactMethod
  public void generateRsaKey(Promise promise) {
    WritableMap map = Arguments.createMap();
    map.putString("publicKey", "");
    map.putString("privateKey", "");
    promise.resolve(map);
  }

  @ReactMethod
  public void rsaEncrypt(String text, String key, String padding, Promise promise) {
    promise.resolve("");
  }

  @ReactMethod
  public void rsaDecrypt(String text, String key, String padding, Promise promise) {
    promise.resolve("");
  }

  @ReactMethod
  public void rsaEncryptSync(String text, String key, String padding) {
  }

  @ReactMethod
  public void rsaDecryptSync(String text, String key, String padding) {
  }

  @ReactMethod
  public void aesEncrypt(String text, String key, String vi, String mode, Promise promise) {
    promise.resolve("");
  }

  @ReactMethod
  public void aesDecrypt(String text, String key, String vi, String mode, Promise promise) {
    promise.resolve("");
  }

  @ReactMethod
  public void aesEncryptSync(String text, String key, String vi, String mode) {
  }

  @ReactMethod
  public void aesDecryptSync(String text, String key, String vi, String mode) {
  }

  @ReactMethod
  public void sha1(String text, Promise promise) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-1");
      byte[] hash = digest.digest(text.getBytes("UTF-8"));
      StringBuilder sb = new StringBuilder();
      for (byte b : hash) {
        sb.append(String.format("%02x", b));
      }
      promise.resolve(sb.toString());
    } catch (Exception e) {
      promise.reject(e);
    }
  }
}

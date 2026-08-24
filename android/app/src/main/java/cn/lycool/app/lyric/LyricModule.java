package cn.lycool.app.lyric;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class LyricModule extends ReactContextBaseJavaModule {

  public LyricModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "LyricModule";
  }

  @ReactMethod
  public void setSendLyricTextEvent(boolean isSend) {
  }

  @ReactMethod
  public void showDesktopLyric(com.facebook.react.bridge.ReadableMap params) {
  }

  @ReactMethod
  public void hideDesktopLyric() {
  }

  @ReactMethod
  public void play(int time) {
  }

  @ReactMethod
  public void pause() {
  }

  @ReactMethod
  public void setLyric(String lyric, String translation, String romalrc) {
  }

  @ReactMethod
  public void setPlaybackRate(int rate) {
  }

  @ReactMethod
  public void toggleTranslation(boolean isShowTranslation) {
  }

  @ReactMethod
  public void toggleRoma(boolean isShowRoma) {
  }

  @ReactMethod
  public void toggleLock(boolean isLock) {
  }

  @ReactMethod
  public void setColor(String unplayColor, String playedColor, String shadowColor) {
  }

  @ReactMethod
  public void setAlpha(int alpha) {
  }

  @ReactMethod
  public void setTextSize(int size) {
  }

  @ReactMethod
  public void setShowToggleAnima(boolean isShowToggleAnima) {
  }

  @ReactMethod
  public void setSingleLine(boolean isSingleLine) {
  }

  @ReactMethod
  public void setPosition(int x, int y) {
  }

  @ReactMethod
  public void setMaxLineNum(int maxLineNum) {
  }

  @ReactMethod
  public void setWidth(int width) {
  }

  @ReactMethod
  public void setLyricTextPosition(String textX, String textY) {
  }

  @ReactMethod
  public void checkOverlayPermission() {
  }

  @ReactMethod
  public void openOverlayPermissionActivity() {
  }
}

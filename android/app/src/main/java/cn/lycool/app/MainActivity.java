package cn.lycool.app;

import android.content.res.Configuration;
import android.view.View;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import com.reactnativenavigation.NavigationActivity;

import cn.lycool.app.utils.SystemUiHolder;

public class MainActivity extends NavigationActivity {

  private final Runnable reapplyUi = this::applySystemUi;
  private final Runnable measureUi = this::measureAndNotify;
  private int lastTopReserve = -1;
  private int lastBottomReserve = -1;
  private boolean layoutListenerAdded = false;

  private void applySystemUi() {
    View decor = getWindow().getDecorView();
    boolean landscape = getResources().getConfiguration().orientation
        == Configuration.ORIENTATION_LANDSCAPE;
    try {
      // 两个方向都保持 decorFits(true)：
      // 竖屏窗口收缩到状态栏下方；横屏状态栏被隐藏后窗口为全高减导航栏，
      // 播放器等底部 UI 不会被手势条遮挡（decorFits(false) 会把内容压到导航栏下面）
      WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
      WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), decor);
      if (landscape) {
        c.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.statusBars());
      } else {
        // 竖屏必须重新显示状态栏：横屏期间被隐藏的话，旋转回来后系统仍按
        // 状态栏 inset 收缩窗口但栏本身不绘制（顶部黑条、底部大片空白）
        c.show(WindowInsetsCompat.Type.statusBars());
      }
    } catch (Throwable ignored) {
    }
    // after the layout pass settles, verify the result and notify JS if the
    // window did NOT actually fit below the status bar (ROM-specific behaviour)
    decor.removeCallbacks(measureUi);
    decor.postDelayed(measureUi, 500);
    decor.postDelayed(measureUi, 1300);
  }

  /**
   * 自适应测量（与机型/ROM 无关）：
   * 顶部预留 = max(0, 状态栏顶部 inset - 内容实际顶部位置)
   * 底部预留 = max(0, 内容实际底部位置 - 导航栏顶部位置)
   * - 内容已在栏下/栏上（decorFits 生效）→ 0，紧凑无空白
   * - 内容延伸到系统栏下面（部分 ROM 强制 edge-to-edge）→ 恰好补齐差值，不重叠
   * 横竖屏都测量（横屏下底部导航栏遮挡同样存在）。
   */
  private void measureAndNotify() {
    try {
      View content = findViewById(android.R.id.content);
      if (content == null) return;
      boolean landscape = getResources().getConfiguration().orientation
          == Configuration.ORIENTATION_LANDSCAPE;
      // 横屏下 RNN 切换屏幕（如进出歌词页）会按屏幕选项重新显示状态栏并覆盖内容，
      // 这里检测到后自动重新隐藏（延 600ms 执行，给下拉临时查看留一点时间）
      if (landscape && statusBarsVisible()) {
        View decor = getWindow().getDecorView();
        decor.removeCallbacks(reapplyUi);
        decor.postDelayed(reapplyUi, 600);
        return;
      }
      int topReserve = 0;
      int bottomReserve = 0;
      int[] loc = new int[2];
      content.getLocationOnScreen(loc);
      if (!landscape) {
        topReserve = Math.max(0, getStatusbarHeightPx() - loc[1]);
      }
      int navHeight = getNavbarHeightPx();
      if (navHeight > 0) {
        int contentBottom = loc[1] + content.getHeight();
        int screenH = getWindow().getDecorView().getHeight();
        bottomReserve = Math.max(0, contentBottom - (screenH - navHeight));
      }
      SystemUiHolder.statusbarReserve = topReserve;
      SystemUiHolder.navbarReserve = bottomReserve;
      if (topReserve != lastTopReserve || bottomReserve != lastBottomReserve) {
        lastTopReserve = topReserve;
        lastBottomReserve = bottomReserve;
        emitReserve(topReserve, bottomReserve);
      }
    } catch (Throwable ignored) {
    }
  }

  private boolean statusBarsVisible() {
    try {
      View decor = getWindow().getDecorView();
      WindowInsetsCompat wi = WindowInsetsCompat.toWindowInsetsCompat(decor.getRootWindowInsets());
      return wi.isVisible(WindowInsetsCompat.Type.statusBars());
    } catch (Throwable ignored) {
      return false;
    }
  }

  private int getNavbarHeightPx() {
    try {
      View decor = getWindow().getDecorView();
      WindowInsetsCompat wi = WindowInsetsCompat.toWindowInsetsCompat(decor.getRootWindowInsets());
      int bottom = wi.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom;
      if (bottom > 0) return bottom;
    } catch (Throwable ignored) {
    }
    return 0;
  }

  private int getStatusbarHeightPx() {
    try {
      View decor = getWindow().getDecorView();
      WindowInsetsCompat wi = WindowInsetsCompat.toWindowInsetsCompat(decor.getRootWindowInsets());
      int top = wi.getInsets(WindowInsetsCompat.Type.statusBars()).top;
      if (top > 0) return top;
    } catch (Throwable ignored) {
    }
    try {
      android.content.res.Resources res = getResources();
      int id = res.getIdentifier("status_bar_height", "dimen", "android");
      if (id > 0) return (int) res.getDimension(id);
    } catch (Throwable ignored) {
    }
    return 0;
  }

  private void emitReserve(int top, int bottom) {
    try {
      ReactContext rc = ((MainApplication) getApplication()).getReactNativeHost()
          .getReactInstanceManager().getCurrentReactContext();
      if (rc == null || !rc.hasActiveReactInstance()) return;
      WritableMap map = Arguments.createMap();
      map.putDouble("top", top);
      map.putDouble("bottom", bottom);
      rc.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
          .emit("liuyin_statusbar_inset", map);
    } catch (Throwable ignored) {
    }
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    // rotation is handled via configChanges; apply after the layout pass settles
    View decor = getWindow().getDecorView();
    decor.removeCallbacks(reapplyUi);
    decor.postDelayed(reapplyUi, 150);
    decor.postDelayed(reapplyUi, 700);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (!hasFocus) return;
    if (!layoutListenerAdded) {
      layoutListenerAdded = true;
      getWindow().getDecorView().getViewTreeObserver()
          .addOnGlobalLayoutListener(this::scheduleMeasure);
    }
    // 重置去重状态：下次测量无论值是否与上次相同都重新发给 JS，
    // 防止旋转/切后台期间某次 emit 因 JS 桥忙被吞掉后 JS 值卡死
    lastTopReserve = -1;
    lastBottomReserve = -1;
    View decor = getWindow().getDecorView();
    decor.removeCallbacks(reapplyUi);
    applySystemUi();
    decor.postDelayed(reapplyUi, 400);
    decor.postDelayed(reapplyUi, 1200);
  }

  private void scheduleMeasure() {
    View decor = getWindow().getDecorView();
    decor.removeCallbacks(measureUi);
    decor.postDelayed(measureUi, 120);
  }
}

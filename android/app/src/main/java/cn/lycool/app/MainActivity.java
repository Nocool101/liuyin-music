package cn.lycool.app;

import android.content.res.Configuration;
import android.view.View;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.reactnativenavigation.NavigationActivity;

public class MainActivity extends NavigationActivity {

  private final Runnable reapplyUi = this::applySystemUi;

  private void applySystemUi() {
    View decor = getWindow().getDecorView();
    boolean landscape = getResources().getConfiguration().orientation
        == Configuration.ORIENTATION_LANDSCAPE;
    try {
      if (landscape) {
        // fullscreen: content extends under the (hidden) status bar
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), decor);
        c.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        c.hide(WindowInsetsCompat.Type.statusBars());
      } else {
        // portrait: window fits below the status bar, so RN re-measures and
        // SizeView reserves the status bar height (like a fresh launch)
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), decor);
        c.show(WindowInsetsCompat.Type.statusBars());
      }
    } catch (Throwable ignored) {
    }
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    // rotation is handled via configChanges; apply after the layout pass settles
    getWindow().getDecorView().removeCallbacks(reapplyUi);
    getWindow().getDecorView().postDelayed(reapplyUi, 150);
    getWindow().getDecorView().postDelayed(reapplyUi, 700);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (!hasFocus) return;
    getWindow().getDecorView().removeCallbacks(reapplyUi);
    applySystemUi();
    getWindow().getDecorView().postDelayed(reapplyUi, 400);
    getWindow().getDecorView().postDelayed(reapplyUi, 1200);
  }
}

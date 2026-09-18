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
    if (decor == null) return;
    boolean landscape = getResources().getConfiguration().orientation
        == Configuration.ORIENTATION_LANDSCAPE;
    try {
      WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
      WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), decor);
      if (c != null) {
        if (landscape) {
          c.setSystemBarsBehavior(
              WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
          c.hide(WindowInsetsCompat.Type.statusBars());
        } else {
          c.show(WindowInsetsCompat.Type.statusBars());
          c.show(WindowInsetsCompat.Type.navigationBars());
        }
      }
    } catch (Throwable ignored) {
    }
  }

  @Override
  public void onConfigurationChanged(Configuration newConfig) {
    super.onConfigurationChanged(newConfig);
    getWindow().getDecorView().removeCallbacks(reapplyUi);
    getWindow().getDecorView().postDelayed(reapplyUi, 150);
    getWindow().getDecorView().postDelayed(reapplyUi, 700);
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    getWindow().getDecorView().removeCallbacks(reapplyUi);
    applySystemUi();
    if (hasFocus) {
      getWindow().getDecorView().postDelayed(reapplyUi, 400);
      getWindow().getDecorView().postDelayed(reapplyUi, 1200);
    }
  }
}

package cn.lycool.app.utils;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RadialGradient;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;
import com.facebook.react.bridge.ReadableMap;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class LyricCardModule extends ReactContextBaseJavaModule {

  private static final String WATERMARK = "流音 · LiuYin Music";
  private static final Typeface FONT_BOLD = Typeface.create("sans-serif", Typeface.BOLD);
  private static final Typeface FONT_NORMAL = Typeface.create("sans-serif", Typeface.NORMAL);

  public LyricCardModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "LyricCardModule";
  }

  // ==========================================
  // 颜色
  // ==========================================

  private static class CardColors {
    int bg1;
    int bg2;
    int accent;
    int textColor;
    int subColor;
    int lyricActive;
    int lyricInactive;
    boolean isDark;
  }

  private static CardColors themeColors(String colorTheme, Bitmap cover) {
    CardColors colors = new CardColors();
    if ("light".equals(colorTheme)) {
      colors.bg1 = Color.parseColor("#ffffff");
      colors.bg2 = Color.parseColor("#f0f4f8");
      colors.accent = Color.parseColor("#4a90e2");
      colors.textColor = Color.parseColor("#1a1a2e");
      colors.subColor = Color.argb(128, 0, 0, 0);
      colors.isDark = false;
    } else if ("album".equals(colorTheme) && cover != null) {
      extractAlbumColors(cover, colors);
    } else {
      colors.bg1 = Color.parseColor("#0f0c29");
      colors.bg2 = Color.parseColor("#302b63");
      colors.accent = Color.parseColor("#a78bfa");
      colors.textColor = Color.WHITE;
      colors.subColor = Color.argb(153, 255, 255, 255);
      colors.isDark = true;
    }
    colors.lyricActive = colors.textColor;
    colors.lyricInactive = colors.subColor;
    return colors;
  }

  private static void extractAlbumColors(Bitmap img, CardColors out) {
    final int size = 100;
    Bitmap src = Bitmap.createScaledBitmap(img, size, size, true);
    int[] data = new int[size * size];
    src.getPixels(data, 0, size, 0, 0, size, size);
    if (src != img) src.recycle();
    int[][] regions = {{0, 0, 30, 30}, {70, 0, 100, 30}, {0, 70, 30, 100}, {70, 70, 100, 100}, {35, 35, 65, 65}};
    int bestR = 0, bestG = 0, bestB = 0;
    float maxSat = -1;
    for (int[] region : regions) {
      long r = 0, g = 0, b = 0;
      int cnt = 0;
      for (int y = region[1]; y < region[3]; y++) {
        for (int x = region[0]; x < region[2]; x++) {
          int px = data[y * size + x];
          r += Color.red(px);
          g += Color.green(px);
          b += Color.blue(px);
          cnt++;
        }
      }
      if (cnt == 0) continue;
      int rr = (int) (r / cnt), gg = (int) (g / cnt), bb = (int) (b / cnt);
      int mx = Math.max(rr, Math.max(gg, bb)), mn = Math.min(rr, Math.min(gg, bb));
      float sat = mx == 0 ? 0 : (mx - mn) / (float) mx;
      if (sat > maxSat) {
        maxSat = sat;
        bestR = rr;
        bestG = gg;
        bestB = bb;
      }
    }
    out.bg1 = Color.rgb((int) (bestR * .2f), (int) (bestG * .2f), (int) (bestB * .2f));
    out.bg2 = Color.rgb((int) (bestR * .08f), (int) (bestG * .08f), (int) (bestB * .08f));
    out.accent = Color.rgb(bestR, bestG, bestB);
    int lum = (int) (0.299f * bestR + 0.587f * bestG + 0.114f * bestB);
    out.isDark = lum < 160;
    out.textColor = out.isDark ? Color.WHITE : Color.parseColor("#1a1a2e");
    out.subColor = out.isDark ? Color.argb(179, 255, 255, 255) : Color.argb(140, 0, 0, 0);
  }

  // ==========================================
  // 绘制工具
  // ==========================================

  private static void roundRect(Canvas canvas, RectF rect, float r, Paint paint) {
    canvas.drawRoundRect(rect, r, r, paint);
  }

  private static void drawTextEllipsized(Canvas canvas, Paint paint, String text, float x, float y, float maxWidth) {
    if (paint.measureText(text) <= maxWidth) {
      canvas.drawText(text, x, y, paint);
      return;
    }
    String t = text;
    while (t.length() > 1 && paint.measureText(t + "…") > maxWidth) {
      t = t.substring(0, t.length() - 1);
    }
    canvas.drawText(t + "…", x, y, paint);
  }

  private static float autoFitFontSize(String text, Paint paint, float baseSize, float maxWidth) {
    for (float ratio = 1.0f; ratio >= 0.5f; ratio -= 0.05f) {
      float fs = baseSize * ratio;
      paint.setTextSize(fs);
      if (paint.measureText(text) <= maxWidth) return fs;
    }
    return baseSize * 0.5f;
  }

  private static void drawCover(Canvas canvas, Bitmap cover, float x, float y, float w, float h) {
    if (cover == null || cover.isRecycled()) return;

    RectF rect = new RectF(x, y, x + w, y + h);
    float radius = Math.min(w, h) * 0.06f;

    // 阴影（深色半透明，无不透明白色底块）
    Paint shadowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    shadowPaint.setColor(Color.argb(80, 0, 0, 0));
    shadowPaint.setShadowLayer(Math.min(w, h) * 0.05f, 0, Math.min(w, h) * 0.015f, Color.argb(130, 0, 0, 0));
    canvas.drawRoundRect(rect, radius, radius, shadowPaint);

    // 完整映射封面到整块 rect，彻底消除多余空白与不当裁切
    int save = canvas.save();
    Path clipPath = new Path();
    clipPath.addRoundRect(rect, radius, radius, Path.Direction.CW);
    canvas.clipPath(clipPath);

    Paint bitmapPaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    canvas.drawBitmap(cover, null, rect, bitmapPaint);
    canvas.restoreToCount(save);

    // 描边
    Paint border = new Paint(Paint.ANTI_ALIAS_FLAG);
    border.setStyle(Paint.Style.STROKE);
    border.setStrokeWidth(2.5f);
    border.setColor(Color.argb(45, 255, 255, 255));
    canvas.drawRoundRect(rect, radius, radius, border);
  }

  private static void drawBackground(Canvas canvas, int W, int H, CardColors colors, Bitmap cover, boolean useCoverBg) {
    if (useCoverBg && cover != null) {
      Paint paint = new Paint(Paint.FILTER_BITMAP_FLAG);
      RectF dst = new RectF(-W * .15f, -H * .15f, W * 1.15f, H * 1.15f);
      canvas.drawBitmap(cover, null, dst, paint);
      canvas.drawColor(colors.isDark ? Color.argb(115, 0, 0, 0) : Color.argb(64, 255, 255, 255));
      return;
    }
    Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    bgPaint.setShader(new LinearGradient(0, 0, W * .4f, H, colors.bg1, colors.bg2, Shader.TileMode.CLAMP));
    canvas.drawRect(0, 0, W, H, bgPaint);
    int accentAlpha = Color.argb(51, Color.red(colors.accent), Color.green(colors.accent), Color.blue(colors.accent));
    Paint glowPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    glowPaint.setShader(new RadialGradient(W * .8f, H * .15f, W * .65f, accentAlpha, Color.TRANSPARENT, Shader.TileMode.CLAMP));
    canvas.drawRect(0, 0, W, H, glowPaint);
  }

  private static void drawWatermark(Canvas canvas, int W, int H, CardColors colors) {
    Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    paint.setTypeface(FONT_BOLD);
    paint.setTextSize(Math.round(W * 0.026f));
    paint.setColor(colors.isDark ? Color.argb(153, 255, 255, 255) : Color.argb(128, 30, 30, 30));
    paint.setTextAlign(Paint.Align.RIGHT);
    canvas.drawText(WATERMARK, W - W * 0.04f, H - H * 0.03f, paint);
  }

  // ==========================================
  // 布局
  // ==========================================

  private static void drawPortrait(Canvas canvas, int W, int H, String title, String artist, ReadableArray lyrics, CardColors colors, Bitmap cover) {
    float pad = W * 0.1f;
    float y = H * 0.07f;
    if (cover != null && !cover.isRecycled()) {
      float maxW = W * 0.76f;
      float maxH = H * 0.40f;
      float imgW = cover.getWidth();
      float imgH = cover.getHeight();
      float scale = Math.min(maxW / imgW, maxH / imgH);
      float coverW = imgW * scale;
      float coverH = imgH * scale;
      float coverX = (W - coverW) / 2f;
      drawCover(canvas, cover, coverX, y, coverW, coverH);
      y += coverH + H * 0.045f;
    }

    Paint titlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    titlePaint.setTypeface(FONT_BOLD);
    titlePaint.setTextAlign(Paint.Align.CENTER);
    titlePaint.setTextSize(autoFitFontSize(title, titlePaint, W * 0.075f, W - pad * 2));
    titlePaint.setColor(colors.textColor);
    canvas.drawText(title, W / 2f, y - titlePaint.ascent(), titlePaint);
    y += titlePaint.descent() - titlePaint.ascent() + H * 0.005f;

    if (artist != null && artist.length() > 0) {
      Paint artistPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
      artistPaint.setTypeface(FONT_NORMAL);
      artistPaint.setTextSize(W * 0.043f);
      artistPaint.setColor(colors.subColor);
      artistPaint.setTextAlign(Paint.Align.CENTER);
      drawTextEllipsized(canvas, artistPaint, artist, W / 2f, y - artistPaint.ascent(), W - pad * 2);
      y += W * 0.043f * 1.4f + H * 0.02f;
    }

    if (lyrics != null && lyrics.size() > 0) {
      Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
      linePaint.setColor(Color.argb(85, Color.red(colors.accent), Color.green(colors.accent), Color.blue(colors.accent)));
      linePaint.setStrokeWidth(1.5f);
      canvas.drawLine(pad * 1.5f, y, W - pad * 1.5f, y, linePaint);
      y += H * 0.025f;
      drawLyricLines(canvas, W, y, H * 0.94f - y, lyrics, colors, true, W / 2f, W * 0.84f, 0, 0);
    }
  }

  private static void drawLandscape(Canvas canvas, int W, int H, String title, String artist, ReadableArray lyrics, CardColors colors, Bitmap cover) {
    float pad = H * 0.1f;
    float coverW = 0;
    if (cover != null && !cover.isRecycled()) {
      float maxW = W * 0.42f;
      float maxH = H * 0.72f;
      float imgW = cover.getWidth();
      float imgH = cover.getHeight();
      float scale = Math.min(maxW / imgW, maxH / imgH);
      coverW = imgW * scale;
      float coverH = imgH * scale;
      float coverX = pad;
      float coverY = (H - coverH) / 2f;
      drawCover(canvas, cover, coverX, coverY, coverW, coverH);
    }
    float textX = coverW > 0 ? pad + coverW + pad * 0.8f : pad;
    float textW = W - textX - pad;
    float startY = H * 0.2f;
    float y = startY;
    float xOff = textX + 12;

    Paint titlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    titlePaint.setTypeface(FONT_BOLD);
    titlePaint.setTextAlign(Paint.Align.LEFT);
    titlePaint.setTextSize(autoFitFontSize(title, titlePaint, H * 0.08f, textW));
    titlePaint.setColor(colors.textColor);
    canvas.drawText(title, xOff, y - titlePaint.ascent(), titlePaint);
    y += titlePaint.descent() - titlePaint.ascent() + H * 0.008f;

    if (artist != null && artist.length() > 0) {
      Paint artistPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
      artistPaint.setTypeface(FONT_NORMAL);
      artistPaint.setTextSize(H * 0.048f);
      artistPaint.setColor(colors.subColor);
      artistPaint.setTextAlign(Paint.Align.LEFT);
      drawTextEllipsized(canvas, artistPaint, artist, xOff, y - artistPaint.ascent(), textW);
      y += H * 0.048f * 1.4f + H * 0.035f;
    }

    float endY = y;
    if (lyrics != null && lyrics.size() > 0) {
      float availH = H * 0.92f - y;
      float lyricFS = Math.min(H * 0.058f, availH / (lyrics.size() * 1.7f));
      float lyricLH = lyricFS * 1.6f;
      float lyricY = y + Math.max(0, (availH - lyricLH * lyrics.size()) / 2f);
      endY = drawLyricLines(canvas, W, lyricY, availH, lyrics, colors, false, xOff, textW, lyricFS, lyricLH);
    }

    Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    linePaint.setColor(colors.accent);
    linePaint.setStrokeWidth(4);
    linePaint.setStrokeCap(Paint.Cap.ROUND);
    canvas.drawLine(textX, startY, textX, endY, linePaint);
  }

  private static void drawSquare(Canvas canvas, int W, int H, String title, String artist, ReadableArray lyrics, CardColors colors, Bitmap cover) {
    float pad = W * 0.08f;
    float y = H * 0.04f;
    if (cover != null && !cover.isRecycled()) {
      float maxW = W * 0.78f;
      float maxH = H * 0.42f;
      float imgW = cover.getWidth();
      float imgH = cover.getHeight();
      float scale = Math.min(maxW / imgW, maxH / imgH);
      float coverW = imgW * scale;
      float coverH = imgH * scale;
      float coverX = (W - coverW) / 2f;
      drawCover(canvas, cover, coverX, y, coverW, coverH);
      y += coverH + H * 0.03f;
    }

    Paint titlePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    titlePaint.setTypeface(FONT_BOLD);
    titlePaint.setTextAlign(Paint.Align.CENTER);
    titlePaint.setTextSize(autoFitFontSize(title, titlePaint, W * 0.068f, W - pad * 2));
    titlePaint.setColor(colors.textColor);
    canvas.drawText(title, W / 2f, y - titlePaint.ascent(), titlePaint);
    y += titlePaint.descent() - titlePaint.ascent() + H * 0.012f;

    if (artist != null && artist.length() > 0) {
      Paint artistPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
      artistPaint.setTypeface(FONT_NORMAL);
      artistPaint.setTextSize(W * 0.04f);
      artistPaint.setColor(colors.subColor);
      artistPaint.setTextAlign(Paint.Align.CENTER);
      drawTextEllipsized(canvas, artistPaint, artist, W / 2f, y - artistPaint.ascent(), W - pad * 2);
      y += W * 0.04f * 1.6f + H * 0.015f;
    }

    if (lyrics != null && lyrics.size() > 0) {
      Paint linePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
      linePaint.setColor(colors.isDark ? Color.argb(64, 255, 255, 255) : Color.argb(38, 0, 0, 0));
      linePaint.setStrokeWidth(1.5f);
      canvas.drawLine(pad * 2, y, W - pad * 2, y, linePaint);
      y += H * 0.02f;
      drawLyricLines(canvas, W, y, H * 0.93f - y, lyrics, colors, true, W / 2f, W * 0.84f, 0, 0);
    }
  }

  /**
   * 画歌词行。
   * center=true 时居中（x 传画布中心 x），否则左对齐（x 为起点 x）
   */
  private static float drawLyricLines(Canvas canvas, int W, float y, float availH, ReadableArray lyrics, CardColors colors,
      boolean center, float x, float maxW, float fsOverride, float lhOverride) {
    int n = lyrics.size();
    if (n == 0) return y;
    float lyricFS = fsOverride > 0 ? fsOverride : Math.min(W * 0.055f, availH / (n * 1.7f));
    if (lyricFS <= 0) return y;
    float lyricLH = lhOverride > 0 ? lhOverride : lyricFS * 1.6f;
    float ly = y + Math.max(0, (availH - lyricLH * n) / 2f);
    for (int i = 0; i < n; i++) {
      ReadableMap item = lyrics.getMap(i);
      String text = item != null && item.hasKey("text") && item.getString("text") != null ? item.getString("text") : "";
      boolean active = item != null && item.hasKey("active") && item.getBoolean("active");
      Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
      paint.setTypeface(active ? FONT_BOLD : FONT_NORMAL);
      paint.setTextSize(active ? lyricFS * 1.15f : lyricFS);
      paint.setColor(active ? colors.lyricActive : colors.lyricInactive);
      paint.setTextAlign(center ? Paint.Align.CENTER : Paint.Align.LEFT);
      float drawX = center ? x : x;
      float width = center ? maxW : maxW;
      drawTextEllipsized(canvas, paint, text, drawX, ly, width);
      ly += lyricLH * (active ? 1.2f : 1.0f);
    }
    return ly;
  }

  // ==========================================
  // 主入口
  // ==========================================

  @ReactMethod
  public void renderLyricCard(final ReadableMap options, final Promise promise) {
    try {
      String layout = options.hasKey("layout") ? options.getString("layout") : "square";
      String colorTheme = options.hasKey("colorTheme") ? options.getString("colorTheme") : "dark";
      String title = options.hasKey("title") && options.getString("title") != null ? options.getString("title") : "未知歌曲";
      String artist = options.hasKey("artist") && options.getString("artist") != null ? options.getString("artist") : "未知歌手";
      String coverPath = options.hasKey("coverPath") ? options.getString("coverPath") : null;
      ReadableArray lyrics = options.hasKey("lyricLines") ? options.getArray("lyricLines") : null;

      int W, H;
      if ("portrait".equals(layout)) {
        W = 1080;
        H = 1920;
      } else if ("landscape".equals(layout)) {
        W = 1920;
        H = 1080;
      } else {
        W = 1080;
        H = 1080;
      }

      Bitmap cover = loadBitmap(coverPath, W);
      CardColors colors = themeColors(colorTheme, cover);

      Bitmap out = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
      Canvas canvas = new Canvas(out);

      drawBackground(canvas, W, H, colors, cover, "album".equals(colorTheme));
      if ("landscape".equals(layout)) {
        drawLandscape(canvas, W, H, title, artist, lyrics, colors, cover);
      } else if ("portrait".equals(layout)) {
        drawPortrait(canvas, W, H, title, artist, lyrics, colors, cover);
      } else {
        drawSquare(canvas, W, H, title, artist, lyrics, colors, cover);
      }
      drawWatermark(canvas, W, H, colors);

      File dir = new File(getReactApplicationContext().getCacheDir(), "lyric_cards");
      if (!dir.exists()) dir.mkdirs();
      File file = new File(dir, "card_" + System.currentTimeMillis() + ".png");
      FileOutputStream fos = new FileOutputStream(file);
      out.compress(Bitmap.CompressFormat.PNG, 100, fos);
      fos.close();
      out.recycle();
      if (cover != null) cover.recycle();
      promise.resolve(file.getAbsolutePath());
    } catch (Exception err) {
      promise.reject("RENDER_ERROR", err != null && err.getMessage() != null ? err.getMessage() : "render failed");
    }
  }

  private static Bitmap loadBitmap(String path, int targetSize) {
    if (path == null || path.length() == 0) return null;
    try {
      BitmapFactory.Options opts = new BitmapFactory.Options();
      opts.inJustDecodeBounds = true;
      BitmapFactory.decodeFile(path, opts);
      int sample = 1;
      while (opts.outWidth / (sample * 2) >= targetSize || opts.outHeight / (sample * 2) >= targetSize) sample *= 2;
      BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
      decodeOpts.inSampleSize = sample;
      return BitmapFactory.decodeFile(path, decodeOpts);
    } catch (Exception err) {
      return null;
    }
  }
}

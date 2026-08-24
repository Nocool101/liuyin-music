package cn.lycool.app.player;

import android.content.ComponentName;

import androidx.core.content.ContextCompat;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.google.common.util.concurrent.ListenableFuture;

import cn.lycool.app.media.LiuyinMediaService;

/**
 * JS ↔ Media3 播放器桥接（替代 react-native-track-player）
 */
public class LiuyinPlayerModule extends ReactContextBaseJavaModule {

    public static final String NAME = "LiuyinPlayer";
    private MediaController mediaController;

    public LiuyinPlayerModule(ReactApplicationContext context) {
        super(context);
        LiuyinPlayer.getInstance(context).setReactContext(context);
    }

    @Override
    public String getName() {
        return NAME;
    }

    /**
     * 连接 MediaSessionService（触发前台服务 + 媒体通知显示，Media3 标准流程）
     */
    @ReactMethod
    public void connect() {
        try {
            if (mediaController != null) return;
            ReactApplicationContext context = getReactApplicationContext();
            SessionToken token = new SessionToken(context,
                    new ComponentName(context, LiuyinMediaService.class));
            ListenableFuture<MediaController> future = new MediaController.Builder(context, token)
                    .buildAsync();
            future.addListener(() -> {
                try {
                    mediaController = future.get();
                } catch (Exception e) {
                    // ignore
                }
            }, ContextCompat.getMainExecutor(context));
        } catch (Throwable t) {
            // ignore
        }
    }

    /** 加载并播放（durationMs/positionMs 为毫秒） */
    @ReactMethod
    public void load(String url, String title, String artist, String album, String artwork, double durationMs, double positionMs) {
        LiuyinPlayer.getInstance(getReactApplicationContext())
                .load(url, title, artist, album, artwork, durationMs, positionMs);
    }

    @ReactMethod
    public void play() {
        LiuyinPlayer.getInstance(getReactApplicationContext()).play();
    }

    @ReactMethod
    public void pause() {
        LiuyinPlayer.getInstance(getReactApplicationContext()).pause();
    }

    @ReactMethod
    public void stop() {
        LiuyinPlayer.getInstance(getReactApplicationContext()).stop();
    }

    @ReactMethod
    public void seekTo(double positionMs) {
        LiuyinPlayer.getInstance(getReactApplicationContext()).seekTo(positionMs);
    }

    @ReactMethod
    public void getPosition(Promise promise) {
        // long 在 RN 桥接中不可转换，需以 double 传递
        promise.resolve((double) LiuyinPlayer.getInstance(getReactApplicationContext()).getPosition());
    }

    @ReactMethod
    public void getDuration(Promise promise) {
        // long 在 RN 桥接中不可转换，需以 double 传递
        promise.resolve((double) LiuyinPlayer.getInstance(getReactApplicationContext()).getDuration());
    }

    @ReactMethod
    public void setVolume(double volume) {
        LiuyinPlayer.getInstance(getReactApplicationContext()).setVolume(volume);
    }

    @ReactMethod
    public void setRate(double rate) {
        LiuyinPlayer.getInstance(getReactApplicationContext()).setRate(rate);
    }

    @ReactMethod
    public void setCacheMaxBytes(double bytes) {
        LiuyinPlayer.getInstance(getReactApplicationContext()).setCacheMaxBytes((long) bytes);
    }

    @ReactMethod
    public void setHandleAudioFocus(boolean enable) {
        LiuyinPlayer.getInstance(getReactApplicationContext()).setHandleAudioFocus(enable);
    }

    @ReactMethod
    public void getCacheSize(Promise promise) {
        try {
            // long 在 RN 桥接中不可转换，需以 double 传递
            promise.resolve((double) PlayerCache.getInstance(getReactApplicationContext()).getCacheSpace());
        } catch (Throwable t) {
            promise.reject("CACHE_SIZE_ERROR", t);
        }
    }

    @ReactMethod
    public void isCached(String key, Promise promise) {
        try {
            promise.resolve(PlayerCache.getInstance(getReactApplicationContext()).isCached(key));
        } catch (Throwable t) {
            promise.reject("CACHE_QUERY_ERROR", t);
        }
    }

    @ReactMethod
    public void clearCache(Promise promise) {
        try {
            PlayerCache.getInstance(getReactApplicationContext()).clear();
            promise.resolve(null);
        } catch (Throwable t) {
            promise.reject("CACHE_CLEAR_ERROR", t);
        }
    }

    @ReactMethod
    public void getState(Promise promise) {
        promise.resolve(LiuyinPlayer.getInstance(getReactApplicationContext()).isPlaying() ? "playing" : "paused");
    }
}

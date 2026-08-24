package cn.lycool.app.player;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.DefaultDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.session.MediaSession;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/**
 * Media3 ExoPlayer 封装（单例）：
 * - 实际播放器（替代 track-player）
 * - 播放状态/结束/错误通过 "LiuyinPlayerEvent" 事件通知 JS
 * - MediaSession 绑定真实 player（Media3 自动处理通知栏/锁屏显示与控制）
 *
 * 注意：ExoPlayer 必须在主线程创建/访问。
 * RN 的 @ReactMethod 默认在主线程执行，因此这里采用懒加载，
 * 首次调用时（主线程）才创建 player；MediaSessionService.onCreate 也在主线程。
 */
@UnstableApi
public class LiuyinPlayer {

    private static LiuyinPlayer instance;

    private Context appContext;
    private ReactApplicationContext reactContext;
    private MediaSession mediaSession;
    private ExoPlayer player;
    private boolean playerCreated = false;
    private long cacheMaxBytes = 1024L * 1024L * 1024L;
    private boolean handleAudioFocus = true;
    private static final long ENDED_WATCHDOG_MS = 8_000;
    private Runnable endedWatchdog;

    public static LiuyinPlayer getInstance(Context context) {
        if (instance == null) {
            instance = new LiuyinPlayer(context.getApplicationContext());
        }
        return instance;
    }

    private LiuyinPlayer(Context context) {
        this.appContext = context;
    }

    /** 主线程懒创建 ExoPlayer */
    private synchronized ExoPlayer ensurePlayer() {
        if (playerCreated) return player;
        // 浏览器 UA：多数音乐 CDN（QQ/酷我等）对非浏览器 UA（ExoPlayerLib/okhttp/自定义）返回 403
        String BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        DefaultHttpDataSource.Factory httpDataSourceFactory = new DefaultHttpDataSource.Factory()
                .setAllowCrossProtocolRedirects(true)
                .setUserAgent(BROWSER_UA);
        DefaultDataSource.Factory upstreamFactory = new DefaultDataSource.Factory(appContext, httpDataSourceFactory);
        PlayerCache cache = PlayerCache.getInstance(appContext);
        cache.configureMaxBytes(cacheMaxBytes);
        player = new ExoPlayer.Builder(appContext)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(
                        cache.getDataSourceFactory(upstreamFactory)))
                .build();
        player.setHandleAudioBecomingNoisy(false);
        applyAudioFocusConfig(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                emit("STATE", isPlaying ? "playing" : "paused");
            }

            @Override
            public void onPlaybackStateChanged(int state) {
                switch (state) {
                    case Player.STATE_ENDED:
                        emit("ENDED", null);
                        // 看门狗：若 JS 在窗口内未加载下一首（后台 JS 挂起/网络卡死），
                        // 重播当前曲目保证持续有声；JS 恢复后收到新的 ENDED 再自动切歌。
                        armEndedWatchdog();
                        break;
                    case Player.STATE_BUFFERING:
                        emit("STATE", "buffering");
                        break;
                    case Player.STATE_READY:
                        emit("STATE", "ready");
                        break;
                    case Player.STATE_IDLE:
                        emit("STATE", "idle");
                        break;
                    default:
                        break;
                }
            }

            @Override
            public void onPlayerError(PlaybackException error) {
                Throwable cause = error;
                while (cause.getCause() != null) cause = cause.getCause();
                emit("ERROR", error.getMessage() + " (" + cause.getClass().getSimpleName() + ": " + cause.getMessage() + ")");
            }
        });
        playerCreated = true;
        return player;
    }

    public void setReactContext(ReactApplicationContext ctx) {
        this.reactContext = ctx;
    }

    public ExoPlayer getPlayer() {
        return ensurePlayer();
    }

    public synchronized void setCacheMaxBytes(long bytes) {
        if (playerCreated) return;
        cacheMaxBytes = Math.max(0L, bytes);
        PlayerCache.getInstance(appContext).configureMaxBytes(cacheMaxBytes);
    }

    /**
     * 音频焦点策略（JS 设置 player.isHandleAudioFocus）：
     * - 其他播放器抢焦点（永久丢失）：暂停且不自动恢复，等用户手动再播
     * - 来电/语音助手/微信电话（瞬态丢失）：暂停，焦点归还后自动续播
     * - 导航/消息提示音（可压低）：音量降到 20% 继续播，结束后还原
     */
    public synchronized void setHandleAudioFocus(boolean enable) {
        if (handleAudioFocus == enable) return;
        handleAudioFocus = enable;
        if (!playerCreated) return;
        applyAudioFocusConfig(player);
    }

    private void applyAudioFocusConfig(ExoPlayer p) {
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build();
        p.setAudioAttributes(attrs, handleAudioFocus);
    }

    public void setMediaSession(MediaSession session) {
        this.mediaSession = session;
    }

    private void armEndedWatchdog() {
        disarmEndedWatchdog();
        if (player == null) return;
        // 播放器绑定在创建它的线程（RN native_modules），看门狗必须在该线程执行，
        // 否则 ExoPlayer 会抛 "Player is accessed on the wrong thread"
        Handler playerHandler = new Handler(player.getApplicationLooper());
        endedWatchdog = () -> {
            endedWatchdog = null;
            if (player == null || player.getPlaybackState() != Player.STATE_ENDED) return;
            // JS 未在窗口内加载下一首：重播当前曲目，保持音频持续
            android.util.Log.i("LiuyinPlayer", "ended watchdog: replay current item");
            player.seekTo(0);
            player.play();
        };
        playerHandler.postDelayed(endedWatchdog, ENDED_WATCHDOG_MS);
    }

    private void disarmEndedWatchdog() {
        if (endedWatchdog != null) {
            endedWatchdog = null;
        }
    }

    private void emit(String type, String data) {
        if (reactContext == null) return;
        WritableMap map = Arguments.createMap();
        map.putString("type", type);
        if (data != null) map.putString("data", data);
        reactContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                .emit("LiuyinPlayerEvent", map);
    }

    /** 加载并播放（单曲模型 + 静音占位队列，保证系统显示"下一曲"按钮） */
    public void load(String url, String title, String artist, String album, String artwork, double durationMs, double positionMs) {
        try {
            ExoPlayer p = ensurePlayer();
            MediaMetadata.Builder mb = new MediaMetadata.Builder()
                    .setTitle(title)
                    .setArtist(artist)
                    .setAlbumTitle(album);
            if (durationMs > 0) mb.setDurationMs((long) durationMs);
            if (artwork != null && !artwork.isEmpty()) {
                try {
                    mb.setArtworkUri(Uri.parse(artwork));
                } catch (Throwable t) {
                    // ignore invalid uri
                }
            }
            MediaItem realItem = new MediaItem.Builder()
                    .setUri(Uri.parse(url))
                    .setMediaMetadata(mb.build())
                    .build();
            // 只保留真实歌曲为当前媒体项：歌曲结束后元数据不会被静音占位项清空，
            // 系统媒体通知/锁屏按钮在暂停或停止时仍保持可用。
            p.setMediaItem(realItem);
            disarmEndedWatchdog();
            p.prepare();
            if (positionMs > 0) p.seekTo((long) positionMs);
            p.play();
        } catch (Throwable t) {
            emit("ERROR", String.valueOf(t.getMessage()));
        }
    }

    public void play() {
        disarmEndedWatchdog();
        ensurePlayer().play();
    }

    public void pause() {
        disarmEndedWatchdog();
        ensurePlayer().pause();
    }

    public void stop() {
        disarmEndedWatchdog();
        ensurePlayer().stop();
    }

    public void seekTo(double positionMs) {
        disarmEndedWatchdog();
        ensurePlayer().seekTo((long) positionMs);
    }

    public double getPosition() {
        if (!playerCreated) return 0;
        return player.getCurrentPosition();
    }

    public double getDuration() {
        if (!playerCreated) return 0;
        long d = player.getDuration();
        return d == androidx.media3.common.C.TIME_UNSET ? 0 : d;
    }

    public boolean isPlaying() {
        if (!playerCreated) return false;
        return player.isPlaying();
    }

    public void setVolume(double volume) {
        ensurePlayer().setVolume((float) volume);
    }

    public void setRate(double rate) {
        ensurePlayer().setPlaybackSpeed((float) rate);
    }
}

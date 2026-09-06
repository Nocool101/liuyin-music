package cn.lycool.app.player;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
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

    private static final String LAST_TRACK_PREFS = "liuyin_last_track";

    private Context appContext;
    private ReactApplicationContext reactContext;
    private MediaSession mediaSession;
    private ExoPlayer player;
    private boolean playerCreated = false;
    private long cacheMaxBytes = 1024L * 1024L * 1024L;
    private boolean handleAudioFocus = true;
    /** 因耳机拔出/蓝牙断开而暂停：重连同类设备后自动续播（跨线程读写，需 volatile） */
    private volatile boolean pausedByNoisy = false;
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
        // 耳机拔出/蓝牙断开时暂停、重新连接后续播：由 registerNoisyHandling 自行实现
        // （ExoPlayer 内置 setHandleAudioBecomingNoisy(true) 只能暂停，无法感知重连）
        player.setHandleAudioBecomingNoisy(false);
        registerNoisyHandling(player);
        applyAudioFocusConfig(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                lastIsPlaying = isPlaying;
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
     * 音频焦点策略（JS 设置 player.isHandleAudioFocus）——完全自管：
     * Media3 内置焦点管理的压低音量固定为 20% 且不可定制，故改为自己请求/处理焦点：
     * - 其他播放器抢焦点（永久丢失）：暂停且不自动恢复，等用户手动再播
     * - 来电/语音助手/微信电话（瞬态丢失）：暂停，焦点归还后自动续播
     * - 导航/消息提示音播报（可压低丢失）：优先要求系统直接暂停本应用（setWillPauseWhenDucked），
     *   播报结束自动恢复；若系统仍派发压低回调，则应用自行把音量降到 0，播报结束恢复。
     * - 通话态（getMode 为 RINGTONE/IN_CALL/IN_COMMUNICATION，即系统来电或微信等 VoIP）：
     *   压低回调与 LOSS 一律按瞬态丢失处理——直接暂停并保留焦点，通话结束（GAIN）自动续播，
     *   不降音量继续播（微信挂断后可能派发 LOSS 而非 GAIN，故 LOSS 同样按瞬态兜底）。
     * 注：部分国产 ROM（如荣耀 MagicOS）的"播报压低媒体"在系统混音层完成，
     * 不派发任何焦点回调也不改流音量，应用侧无法拦截，属 ROM 限制。
     */
    public synchronized void setHandleAudioFocus(boolean enable) {
        if (handleAudioFocus == enable) return;
        handleAudioFocus = enable;
        if (!playerCreated) return;
        if (!enable) {
            abandonFocusInternal();
            pausedByTransient = false;
            pendingPlayByFocus = false;
            restoreDuckVolume();
        }
        applyAudioFocusConfig(player);
    }

    private void applyAudioFocusConfig(ExoPlayer p) {
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(C.USAGE_MEDIA)
                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                .build();
        // 焦点完全自管（false），由 requestFocusIfNeeded/abandonFocusInternal 处理
        p.setAudioAttributes(attrs, false);
        registerFocusHandling(p);
    }

    // ---- 自管音频焦点 ----

    private AudioManager audioManager;
    private Handler focusHandler;
    private AudioManager.OnAudioFocusChangeListener focusListener;
    private android.media.AudioFocusRequest focusRequest;
    /** 是否持有焦点（请求被拒后 false，等 GAIN 回调再播） */
    private boolean hasFocus = false;
    /** 导航播报压低期间记住的原音量（<0 表示未处于压低状态） */
    private float preDuckVolume = -1f;
    /** 因瞬态焦点丢失（来电等）而暂停，GAIN 后自动续播 */
    private volatile boolean pausedByTransient = false;
    /** 因其他播放器永久抢占（AUDIOFOCUS_LOSS）而暂停：等其停止后可 reclaim 按键会话 */
    private volatile boolean pausedByFocusLoss = false;
    /** 焦点请求被拒（如来电中），焦点可用后自动开始播放 */
    private boolean pendingPlayByFocus = false;
    /** 外部播放器上一轮活跃状态（检测 active→inactive 下降沿） */
    private boolean lastForeignActive = false;
    /** 划掉任务后的静默态：抑制按键会话心跳重发（心跳的 play() 会让 Media3 重新发布媒体标签） */
    private volatile boolean taskRemovedSuppressed = false;
    /** 最近一次"是否正在播放"缓存（跨线程只读查询用；ExoPlayer 只允许在创建线程访问） */
    private volatile boolean lastIsPlaying = false;
    /** 抢占按键会话的静音心跳序号（用户手动操作后使未完成的心跳失效） */
    private int reclaimTickSeq = 0;

    private void registerFocusHandling(ExoPlayer p) {
        if (focusListener != null) return;
        audioManager = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
        // 焦点回调统一 post 回播放器 looper，保证与 play/pause 同线程
        focusHandler = new Handler(p.getApplicationLooper());
        focusListener = change -> {
            Handler h = focusHandler;
            if (h == null) return;
            h.post(() -> handleFocusChange(change));
        };
        cn.lycool.app.media.MediaLog.log(appContext, "focus handling registered");
        registerForeignPlaybackMonitor();
    }

    // ---- 外部播放器静音（导航播报等 ROM 混音层压低场景）----
    // 荣耀等 ROM 对导航播报在系统混音层用 VolumeShaper 直接把媒体压到 20%，
    // 且不派发任何焦点回调（dumpsys audio 实证），应用无法经焦点系统感知。
    // 改用 AudioPlaybackCallback（公开 API，任何应用播放器启停均派发）：
    // 检测到外部播放器（导航/语音助手/非音乐类媒体）活跃时把自身音量降到 0
    // （混音层 0.2 × 0 = 0，彻底静音），外部播放结束后还原。
    private volatile boolean foreignMuted = false;

    private void registerForeignPlaybackMonitor() {
        if (Build.VERSION.SDK_INT < 26) return;
        if (audioManager == null) return;
        audioManager.registerAudioPlaybackCallback(new AudioManager.AudioPlaybackCallback() {
            @Override
            public void onPlaybackConfigChanged(java.util.List<android.media.AudioPlaybackConfiguration> configs) {
                Handler h = focusHandler;
                if (h == null) return;
                h.post(() -> applyForeignPlaybackMute(configs));
            }
        }, null);
    }

    private void applyForeignPlaybackMute(java.util.List<android.media.AudioPlaybackConfiguration> configs) {
        if (!playerCreated || player == null) return;
        try {
            boolean foreignActive = foreignActive(configs);
            cn.lycool.app.media.MediaLog.log(appContext, "foreign playback active=" + foreignActive
                    + " foreignMuted=" + foreignMuted + " preDuck=" + preDuckVolume);
            if (foreignActive && player.isPlaying() && !foreignMuted && preDuckVolume < 0) {
                foreignMuted = true;
                preDuckVolume = player.getVolume();
                player.setVolume(0f);
            } else if (!foreignActive && foreignMuted) {
                foreignMuted = false;
                restoreDuckVolume();
            }
            // 外部播放器由活跃转停止，且我们此前被其永久抢占暂停：
            // 静默重获焦点 + 心跳刷新会话活跃时间，夺回系统媒体按键路由目标，
            // 之后双击耳机播放键即可恢复本应用（无论应用在前台/后台）
            if (lastForeignActive && !foreignActive && pausedByFocusLoss) {
                pausedByFocusLoss = false;
                reclaimMediaButtonSession();
            }
            lastForeignActive = foreignActive;
        } catch (Throwable t) {
            android.util.Log.w("LiuyinPlayer", "foreign playback mute failed", t);
        }
    }

    private boolean foreignActive(java.util.List<android.media.AudioPlaybackConfiguration> configs) {
        if (configs == null) return false;
        for (android.media.AudioPlaybackConfiguration c : configs) {
            try {
                android.media.AudioAttributes a = c.getAudioAttributes();
                if (a == null) continue;
                int usage = a.getUsage();
                int contentType = a.getContentType();
                // 本应用自己的播放器是 USAGE_MEDIA + CONTENT_TYPE_MUSIC，必须排除
                boolean foreign = usage == android.media.AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE
                        || usage == android.media.AudioAttributes.USAGE_ASSISTANT
                        || (usage == android.media.AudioAttributes.USAGE_MEDIA
                            && contentType != android.media.AudioAttributes.CONTENT_TYPE_MUSIC);
                if (foreign) return true;
            } catch (Throwable ignored) {
            }
        }
        return false;
    }

    /**
     * 其他播放器停止后夺回媒体按键路由：
     * 系统把耳机按键派发给"最近活跃（播放过）的媒体会话"，被抢占后即使对方已停止，
     * 其暂停态会话仍是按键目标。以 0 音量短暂播放一拍再暂停，把本会话刷新为最近活跃，
     * 之后双击耳机播放键即恢复本应用。用户手动操作（播放/暂停/停止）会使未完成的心跳失效。
     */
    private void reclaimMediaButtonSession() {
        try {
            if (!playerCreated || player == null) return;
            if (player.getCurrentMediaItem() == null) return;
            int state = player.getPlaybackState();
            if (state != Player.STATE_READY && state != Player.STATE_BUFFERING) return;
            if (player.isPlaying()) return;
            if (!requestFocusIfNeeded()) return;
            final int seq = ++reclaimTickSeq;
            final float savedVolume = player.getVolume();
            player.setVolume(0f);
            player.play();
            cn.lycool.app.media.MediaLog.log(appContext, "reclaim tick started");
            Handler h = new Handler(player.getApplicationLooper());
            h.postDelayed(() -> {
                try {
                    if (seq != reclaimTickSeq) return;
                    if (player.isPlaying()) player.pause();
                    player.setVolume(savedVolume);
                    saveLastTrackPosition();
                    cn.lycool.app.media.MediaLog.log(appContext, "reclaim tick done, media button session reclaimed");
                    // 静默态（划掉任务后）：心跳的 play() 触发 Media3 重发了媒体标签，
                    // 跳完一拍后重新摘除，保持"划掉后无标签"的静默外观
                    if (taskRemovedSuppressed) {
                        cn.lycool.app.media.LiuyinMediaService.scheduleMediaLabelRemoval();
                    }
                } catch (Throwable ignored) {
                }
            }, 400);
        } catch (Throwable t) {
            android.util.Log.w("LiuyinPlayer", "reclaim media button session failed", t);
        }
    }

    /** 主动查询一次外部播放器状态（恢复播放后外部播放器可能仍在活跃，回调不会再触发） */
    private void checkForeignPlaybackNow() {
        if (Build.VERSION.SDK_INT < 26 || audioManager == null) return;
        try {
            applyForeignPlaybackMute(audioManager.getActivePlaybackConfigurations());
        } catch (Throwable ignored) {
        }
    }

    private boolean requestFocusIfNeeded() {
        if (hasFocus || focusListener == null) return true;
        if (audioManager == null) return true;
        boolean granted;
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusRequest == null) {
                android.media.AudioAttributes attrs = new android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build();
                focusRequest = new android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(attrs)
                        // 声明"不做压低、直接暂停"：系统对可压低焦点丢失将走暂停通道
                        // （播报结束自动恢复），而非在混音层把音量压到 20%（荣耀等 ROM 行为）
                        .setWillPauseWhenDucked(true)
                        .setOnAudioFocusChangeListener(focusListener, focusHandler)
                        .build();
                // 注册"最后媒体按键接收者"（系统级记录，不随进程/会话死亡而清除）：
                // 应用被划掉/杀死后，耳机播放键由 AudioService 通过该 PendingIntent 重新拉起，
                // 这是"不开 app 双击耳机也能播放"的关键通路
                try {
                    Intent btn = new Intent(Intent.ACTION_MEDIA_BUTTON);
                    btn.setComponent(new android.content.ComponentName(appContext,
                            "androidx.media3.session.MediaButtonReceiver"));
                    android.app.PendingIntent pi = android.app.PendingIntent.getBroadcast(appContext, 3527, btn,
                            android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
                    java.lang.reflect.Method m = AudioManager.class.getMethod("setMediaButtonReceiver",
                            android.app.PendingIntent.class);
                    m.invoke(audioManager, pi);
                    cn.lycool.app.media.MediaLog.log(appContext, "media button receiver registered");
                } catch (Throwable t) {
                    cn.lycool.app.media.MediaLog.log(appContext, "setMediaButtonReceiver failed: " + t);
                }
            }
            granted = audioManager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        } else {
            granted = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        // 并行再走一次旧版请求接口（同一 listener）：部分国产 ROM（如荣耀）对新版
        // AudioFocusRequest 的焦点回调派发存在兼容问题，只派发旧版监听通道。
        // 两通道幂等（压低/恢复由 preDuckVolume 状态保护），重复回调无害。
        try {
            int legacy = audioManager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN);
            if (legacy == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) granted = true;
        } catch (Throwable ignored) {
        }
        hasFocus = granted;
        cn.lycool.app.media.MediaLog.log(appContext, "requestAudioFocus granted=" + granted);
        return granted;
    }

    private void abandonFocusInternal() {
        pendingPlayByFocus = false;
        hasFocus = false;
        if (audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 26 && focusRequest != null) {
                audioManager.abandonAudioFocusRequest(focusRequest);
            }
            if (focusListener != null) {
                audioManager.abandonAudioFocus(focusListener);
            }
        } catch (Throwable ignored) {
        }
    }

    private void restoreDuckVolume() {
        foreignMuted = false;
        if (preDuckVolume < 0) return;
        float v = preDuckVolume;
        preDuckVolume = -1f;
        if (playerCreated && player != null) {
            try { player.setVolume(v); } catch (Throwable ignored) {
            }
        }
    }

    /** 内部恢复播放（耳机重连续播/看门狗重播/冷启动恢复）：确保已持有焦点 */
    private void resumePlaybackInternal() {
        taskRemovedSuppressed = false;
        pausedByFocusLoss = false;
        if (!requestFocusIfNeeded()) {
            pendingPlayByFocus = true;
            return;
        }
        player.play();
    }

    /** 是否处于通话态（系统来电铃声/系统通话/VoIP 通话如微信语音） */
    private boolean isInCallMode() {
        if (audioManager == null) return false;
        int mode = audioManager.getMode();
        return mode == AudioManager.MODE_RINGTONE
                || mode == AudioManager.MODE_IN_CALL
                || mode == AudioManager.MODE_IN_COMMUNICATION;
    }

    private void handleFocusChange(int change) {
        if (!playerCreated || player == null) {
            cn.lycool.app.media.MediaLog.log(appContext, "focus change=" + change + " (player not created)");
            return;
        }
        try {
            cn.lycool.app.media.MediaLog.log(appContext, "focus change=" + change
                    + " isPlaying=" + player.isPlaying()
                    + " vol=" + player.getVolume()
                    + " preDuck=" + preDuckVolume
                    + " transient=" + pausedByTransient);
            switch (change) {
                case AudioManager.AUDIOFOCUS_GAIN:
                    hasFocus = true;
                    restoreDuckVolume();
                    if (pendingPlayByFocus) {
                        pendingPlayByFocus = false;
                        player.play();
                        break;
                    }
                    if (pausedByTransient) {
                        pausedByTransient = false;
                        int state = player.getPlaybackState();
                        if (state == Player.STATE_READY || state == Player.STATE_BUFFERING) {
                            player.play();
                        }
                    }
                    break;
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                    // 来电/语音助手：暂停并保留焦点，GAIN 后自动续播
                    if (player.isPlaying()) {
                        pausedByTransient = true;
                        player.pause();
                    }
                    break;
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                    // 通话态（微信等 VoIP 来电，部分 ROM 派发"可压低"回调）：
                    // 与瞬态丢失同路——还原音量并直接暂停，GAIN 后自动续播
                    if (isInCallMode()) {
                        restoreDuckVolume();
                        if (player.isPlaying()) {
                            pausedByTransient = true;
                            player.pause();
                        }
                        break;
                    }
                    // 普通媒体占用（导航/消息播报）：音量降到 0 继续播，播报结束（GAIN）恢复
                    if (player.isPlaying() && preDuckVolume < 0) {
                        preDuckVolume = player.getVolume();
                        player.setVolume(0f);
                    }
                    break;
                case AudioManager.AUDIOFOCUS_LOSS:
                    // 通话态下的 LOSS（VoIP 挂断后可能派发 LOSS 而非 GAIN）：
                    // 按瞬态处理，保留焦点等 GAIN 自动续播，不当成"被永久抢占"
                    if (isInCallMode()) {
                        restoreDuckVolume();
                        pausedByTransient = true;
                        if (player.isPlaying()) {
                            saveLastTrackPosition();
                            player.pause();
                        }
                        break;
                    }
                    // 被其他播放器永久抢占：暂停且不自动恢复
                    pausedByTransient = false;
                    pausedByFocusLoss = true;
                    restoreDuckVolume();
                    abandonFocusInternal();
                    if (player.isPlaying()) {
                        saveLastTrackPosition();
                        player.pause();
                    }
                    break;
                default:
                    break;
            }
        } catch (Throwable t) {
            android.util.Log.w("LiuyinPlayer", "focus change handling failed", t);
        }
    }

    /**
     * 音频输出设备变更处理：
     * - 拔出耳机/蓝牙断开（ACTION_AUDIO_BECOMING_NOISY）：若正在播放则暂停，并记录 pausedByNoisy
     * - 耳机/蓝牙耳机重新连接：若此前因断开而暂停，则自动续播
     * 用户主动 play/pause/load 会清除 pausedByNoisy，避免陈旧标记导致意外续播。
     */
    private void registerNoisyHandling(ExoPlayer p) {
        // ExoPlayer 绑定在创建它的线程（RN native_modules），
        // 广播/设备回调都在主线程执行，必须 post 回播放器 looper，否则抛 "wrong thread" 崩溃
        Handler playerHandler = new Handler(p.getApplicationLooper());
        appContext.registerReceiver(new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                playerHandler.post(() -> {
                    if (player == null || !player.isPlaying()) return;
                    pausedByNoisy = true;
                    player.pause();
                });
            }
        }, new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY));

        AudioManager am = (AudioManager) appContext.getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        am.registerAudioDeviceCallback(new AudioDeviceCallback() {
            private boolean isHeadlike(AudioDeviceInfo d) {
                switch (d.getType()) {
                    case AudioDeviceInfo.TYPE_WIRED_HEADSET:
                    case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                    case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
                    case AudioDeviceInfo.TYPE_BLE_HEADSET:
                    case AudioDeviceInfo.TYPE_USB_HEADSET:
                        return true;
                    default:
                        return false;
                }
            }

            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] addedDevices) {
                if (!pausedByNoisy) return;
                boolean reconnected = false;
                for (AudioDeviceInfo d : addedDevices) {
                    if (isHeadlike(d)) { reconnected = true; break; }
                }
                if (!reconnected) return;
                // 不在主线程提前清标记：在播放器线程内检查并清除，
                // 避免与用户主动 play/pause（同样在播放器线程）产生竞态
                playerHandler.post(() -> {
                    if (player == null || !pausedByNoisy) return;
                    pausedByNoisy = false;
                    int state = player.getPlaybackState();
                    if (state == Player.STATE_READY || state == Player.STATE_BUFFERING) {
                        resumePlaybackInternal();
                    }
                });
            }
        }, null);
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
            resumePlaybackInternal();
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
        // 注意：url 内含服务器认证参数，不得写入日志，只记录标题与是否成功保存
        cn.lycool.app.media.MediaLog.log(appContext, "load: " + title + " @" + (long) positionMs + "ms");
        try {
            saveLastTrack(url, title, artist, album, artwork, durationMs, positionMs);
            cn.lycool.app.media.MediaLog.log(appContext, "load: last track saved");
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
            pausedByNoisy = false;
            p.prepare();
            if (positionMs > 0) p.seekTo((long) positionMs);
            startPlayback();
        } catch (Throwable t) {
            emit("ERROR", String.valueOf(t.getMessage()));
        }
    }

    /** 统一的"开始播放"入口：先请求音频焦点，被拒（如来电中）则等 GAIN 后自动播放 */
    private void startPlayback() {
        ExoPlayer p = ensurePlayer();
        disarmEndedWatchdog();
        taskRemovedSuppressed = false;
        pausedByNoisy = false;
        pausedByTransient = false;
        pausedByFocusLoss = false;
        reclaimTickSeq++;
        restoreDuckVolume();
        if (!requestFocusIfNeeded()) {
            pendingPlayByFocus = true;
            return;
        }
        p.play();
        // 恢复播放时外部播放器（如仍在播报的导航）可能已活跃且不会再有配置变更回调，主动查一次
        checkForeignPlaybackNow();
    }

    public void play() {
        startPlayback();
    }

    public void pause() {
        disarmEndedWatchdog();
        taskRemovedSuppressed = false;
        pausedByNoisy = false;
        pausedByTransient = false;
        pausedByFocusLoss = false;
        pendingPlayByFocus = false;
        reclaimTickSeq++;
        // 用户主动暂停：若处于导航播报压低状态，先把音量还原，避免下次播放无声
        restoreDuckVolume();
        saveLastTrackPosition();
        // 暂停时保留音频焦点：荣耀 MagicOS 的状态栏媒体标签依赖应用持有焦点，
        // 释放会导致暂停后标签消失。焦点丢失（被其他应用抢占）走 handleFocusChange 处理。
        ensurePlayer().pause();
    }

    public void stop() {
        disarmEndedWatchdog();
        taskRemovedSuppressed = false;
        pausedByNoisy = false;
        pausedByTransient = false;
        pausedByFocusLoss = false;
        pendingPlayByFocus = false;
        reclaimTickSeq++;
        restoreDuckVolume();
        abandonFocusInternal();
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

    /** 线程安全的"是否正在播放"查询（读缓存，任意线程可调；供摘标签等跨线程场景使用） */
    public boolean isPlayingCached() {
        return playerCreated && lastIsPlaying;
    }

    public void setVolume(double volume) {
        ExoPlayer p = ensurePlayer();
        // 导航播报压低期间：暂存用户设置的新音量，播报结束后恢复为该值
        if (preDuckVolume >= 0) {
            preDuckVolume = (float) volume;
            return;
        }
        p.setVolume((float) volume);
    }

    public void setRate(double rate) {
        ensurePlayer().setPlaybackSpeed((float) rate);
    }

    /** 持久化最近播放的曲目：蓝牙耳机/锁屏按键在应用未打开时冷启动恢复播放用 */
    private void saveLastTrack(String url, String title, String artist, String album, String artwork, double durationMs, double positionMs) {
        try {
            if (url == null || url.isEmpty()) return;
            appContext.getSharedPreferences(LAST_TRACK_PREFS, Context.MODE_PRIVATE).edit()
                    .putString("url", url)
                    .putString("title", title == null ? "" : title)
                    .putString("artist", artist == null ? "" : artist)
                    .putString("album", album == null ? "" : album)
                    .putString("artwork", artwork == null ? "" : artwork)
                    .putLong("durationMs", (long) durationMs)
                    .putLong("positionMs", (long) positionMs)
                    .apply();
        } catch (Throwable ignored) {
        }
    }

    /** 记录当前播放进度（暂停/断开耳机时调用），冷启动恢复时从该进度续播 */
    public void saveLastTrackPosition() {
        try {
            if (!playerCreated || player == null || player.getCurrentMediaItem() == null) return;
            long pos = player.getCurrentPosition();
            if (pos < 0) pos = 0;
            appContext.getSharedPreferences(LAST_TRACK_PREFS, Context.MODE_PRIVATE)
                    .edit().putLong("positionMs", pos).apply();
        } catch (Throwable ignored) {
        }
    }

    /**
     * 划掉最近任务：暂停并进入静默态——保留播放队列、音频焦点与 MediaSession，
     * 媒体标签由 LiuyinMediaService 立即摘除。
     * 静默态下抑制按键会话心跳（其 0 音量 play() 会触发 Media3 重发标签）；
     * 恢复播放（耳机键/JS/冷启动）即退出静默态。
     * 耳机键唤醒依赖存活的会话与队列，任何清理式处理都会使其失效（docs/adr/0003）。
     * 保留焦点：荣耀 MagicOS 的状态栏媒体标签依赖应用持有焦点。
     */
    public void pauseForTaskRemoved() {
        saveLastTrackPosition();
        disarmEndedWatchdog();
        pausedByNoisy = false;
        pausedByTransient = false;
        pausedByFocusLoss = false;
        pendingPlayByFocus = false;
        reclaimTickSeq++;
        lastForeignActive = false;
        restoreDuckVolume();
        taskRemovedSuppressed = true;
        if (playerCreated && player != null && player.isPlaying()) {
            player.pause();
        }
    }

    /**
     * 蓝牙耳机/锁屏媒体按键在 JS 未运行（应用未打开/进程刚被系统拉起）时的处理：
     * - 已有曲目：直接原生播放/暂停
     * - 无曲目（冷启动）：从持久化记录恢复上次曲目并播放
     * 切歌等需要 JS 参与的操作在冷启动时同样以"恢复播放"兜底。
     */
    public boolean handleColdMediaButton(String command) {
        cn.lycool.app.media.MediaLog.log(appContext, "cold media button cmd=" + command
                + " playerCreated=" + playerCreated);
        try {
            if (playerCreated && player != null && player.getCurrentMediaItem() != null) {
                switch (command) {
                    case "pause":
                        saveLastTrackPosition();
                        player.pause();
                        return true;
                    case "play":
                        resumePlaybackInternal();
                        return true;
                    default: // playpause / next / prev
                        if (player.isPlaying()) {
                            saveLastTrackPosition();
                            player.pause();
                        } else {
                            resumePlaybackInternal();
                        }
                        return true;
                }
            }
            if ("pause".equals(command)) return false;
            SharedPreferences sp = appContext.getSharedPreferences(LAST_TRACK_PREFS, Context.MODE_PRIVATE);
            String url = sp.getString("url", "");
            if (url.isEmpty()) return false;
            load(url,
                    sp.getString("title", ""),
                    sp.getString("artist", ""),
                    sp.getString("album", ""),
                    sp.getString("artwork", ""),
                    sp.getLong("durationMs", 0),
                    sp.getLong("positionMs", 0));
            android.util.Log.i("LiuyinPlayer", "cold media button: restored last track");
            return true;
        } catch (Throwable t) {
            android.util.Log.w("LiuyinPlayer", "cold media button failed", t);
            return false;
        }
    }
}

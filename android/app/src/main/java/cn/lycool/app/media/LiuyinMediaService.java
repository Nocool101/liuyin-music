package cn.lycool.app.media;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import androidx.core.app.TaskStackBuilder;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaSession;
import androidx.media3.session.SessionCommands;
import androidx.media3.session.MediaSessionService;

import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

import cn.lycool.app.MainActivity;
import cn.lycool.app.player.LiuyinPlayer;

/**
 * Media3 MediaSessionService：让系统把应用识别为媒体播放器，
 * 提供锁屏媒体控件/通知栏媒体卡片（Media3 自动基于播放器生成）。
 * 上一曲/下一曲/播放/暂停转发回 JS（切歌与播放状态逻辑在 JS，见 onPlayerCommandRequest）；
 * 进度拖动（seek）放行给 Media3 直接在播放器上执行。
 */
@UnstableApi
public class LiuyinMediaService extends MediaSessionService {

    private static final String CHANNEL_ID = "liuyin_media";
    /**
     * 保活通知渠道：前台服务身份必须挂一条通知，但划掉任务时媒体标签要摘掉，
     * 于是用一条独立的、最低优先级的静默通知来「占住」前台身份。
     * 这样进程不会被系统回收，MediaSession 得以保持注册与活跃。
     */
    private static final String KEEPALIVE_CHANNEL_ID = "liuyin_keepalive";
    private static final int KEEPALIVE_NOTIFICATION_ID = 9528;
    private static final long TASK_REMOVED_LABEL_REMOVE_DELAY_MS = 800L;
    private static final long TASK_REMOVED_LABEL_REMOVE_RETRY_MS = 5_000L;

    private MediaSession mediaSession;
    private static LiuyinMediaService instance;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private volatile boolean taskRemovedSuppressed;

    public static LiuyinMediaService getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();
        createKeepAliveChannel();

        // 服务一启动就占住前台身份：否则应用退到后台 / 被划掉后进程会被回收，
        // onDestroy 里 mediaSession.release() 会把会话整个注销掉，
        // 语音助手与系统媒体控件就再也找不到本应用。
        startKeepAliveForeground();

        // 绑定真实播放器（单例，与 JS 共享同一 ExoPlayer 实例）
        LiuyinPlayer liuyinPlayer = LiuyinPlayer.getInstance(getApplicationContext());

        Intent intent = new Intent(this, MainActivity.class);
        PendingIntent pi = TaskStackBuilder.create(this)
                .addNextIntentWithParentStack(intent)
                .getPendingIntent(0, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        mediaSession = new MediaSession.Builder(this, new ForwardingPlayer(liuyinPlayer.getPlayer()) {
            @Override
            public boolean isCurrentMediaItemSeekable() {
                return true;
            }

            @Override
            public boolean isCurrentMediaItemDynamic() {
                return false;
            }

            @Override
            public long getContentDuration() {
                long duration = super.getContentDuration();
                return duration != androidx.media3.common.C.TIME_UNSET && duration > 0
                        ? duration : getDuration();
            }

            @Override
            public void seekTo(long positionMs) {
                android.util.Log.i("LiuyinMedia", "seekTo position=" + positionMs);
                super.seekTo(positionMs);
            }

            @Override
            public void seekTo(int mediaItemIndex, long positionMs) {
                android.util.Log.i("LiuyinMedia", "seekTo item=" + mediaItemIndex + " position=" + positionMs);
                super.seekTo(mediaItemIndex, positionMs);
            }

            @Override
            public boolean hasNextMediaItem() {
                return true;
            }

            @Override
            public boolean hasPreviousMediaItem() {
                return true;
            }

            @Override
            public void seekToNextMediaItem() {
                // 切歌由 JS 处理（见 onPlayerCommandRequest），此处不重复转发
            }

            @Override
            public void seekToPreviousMediaItem() {
                // 切歌由 JS 处理（见 onPlayerCommandRequest），此处不重复转发
            }

            @Override
            public Commands getAvailableCommands() {
                return super.getAvailableCommands().buildUpon()
                        .add(Player.COMMAND_SEEK_TO_DEFAULT_POSITION)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                        .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                        .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                        .add(Player.COMMAND_SEEK_TO_NEXT)
                        .add(Player.COMMAND_SEEK_TO_MEDIA_ITEM)
                        .add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
                        .add(Player.COMMAND_SEEK_BACK)
                        .add(Player.COMMAND_SEEK_FORWARD)
                        .build();
            }
        })
                .setSessionActivity(pi)
                .setCallback(new MediaSession.Callback() {
                    public MediaSession.ConnectionResult onConnect(
                            MediaSession session, MediaSession.ControllerInfo controller) {
                        return MediaSession.ConnectionResult.accept(
                                SessionCommands.EMPTY,
                                liuyinPlayer.getPlayer().getAvailableCommands().buildUpon()
                                        .add(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
                                        .add(Player.COMMAND_SEEK_TO_PREVIOUS)
                                        .add(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
                                        .add(Player.COMMAND_SEEK_TO_NEXT)
                                        .add(Player.COMMAND_SEEK_TO_MEDIA_ITEM)
                                        .add(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
                                        .add(Player.COMMAND_SEEK_TO_DEFAULT_POSITION)
                                        .add(Player.COMMAND_SEEK_BACK)
                                        .add(Player.COMMAND_SEEK_FORWARD)
                                        .build());
                    }

                    @Override
                    public int onPlayerCommandRequest(MediaSession session, MediaSession.ControllerInfo controller, int playerCommand) {
                        android.util.Log.i("LiuyinMedia", "playerCommand=" + playerCommand);
                        // JS 未运行（应用未打开、进程刚由媒体按键拉起）：
                        // 播放类按键直接原生恢复/暂停上次曲目，实现“不开 App 也能耳机双击播放”
                        if (!MediaBridgeModule.hasContext()) {
                            String coldCommand = null;
                            switch (playerCommand) {
                                case Player.COMMAND_PLAY_PAUSE:
                                case Player.COMMAND_SEEK_TO_NEXT:
                                case Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM:
                                case Player.COMMAND_SEEK_TO_PREVIOUS:
                                case Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM:
                                    coldCommand = "playpause";
                                    break;
                                default:
                                    break;
                            }
                            if (coldCommand != null) {
                                // 冷启动按键走的是 startForegroundService 通道，5 秒内必须进前台；
                                // 网络流缓冲可能超时，先挂占位通知，播放后由 Media3 替换为真通知
                                ensurePlaceholderForeground();
                                boolean ok = liuyinPlayer.handleColdMediaButton(coldCommand);
                                android.util.Log.i("LiuyinMedia", "cold handle " + coldCommand + " ok=" + ok);
                                if (ok) return Player.COMMAND_INVALID;
                                releasePlaceholderForeground();
                                stopSelf();
                                return Player.COMMAND_INVALID;
                            }
                        }
                        switch (playerCommand) {
                            case Player.COMMAND_PLAY_PAUSE:
                                // 这条路径来自「控制器」：系统媒体卡片、锁屏媒体控件、语音助手的
                                // MediaController.getTransportControls()。
                                //
                                // Media3 的 play() 与 pause() 下发的是**同一个** COMMAND_PLAY_PAUSE，
                                // 真实意图只由随后的 setPlayWhenReady 携带；而实测中该 setPlayWhenReady
                                // 并不会作用到本应用的播放器（原生状态完全没变）。
                                // 因此这里只能按「切换」处理，并把切换交给 JS：
                                //   · JS 的 togglePlay() 依据 playerState.isPlay（由原生 STATE 事件驱动）判断，
                                //     在状态准确时与控制器的意图一致；
                                //   · 切歌等仍由 JS 统一处理。
                                //
                                // 注意：不能把 playerCommand 原样返回给 Media3 —— 实测 Media3 收到后
                                // 并不会真的调用播放器的 play()/pause()，命令会被静默丢弃，
                                // 表现为通知栏/媒体卡片的播放暂停按钮完全无响应。
                                if (liuyinPlayer.getPlayer().getCurrentMediaItem() == null) {
                                    // 播放器没有内容（冷启动/已清空）：交给 JS 走「重新解析并恢复」流程
                                    cn.lycool.app.media.MediaBridgeModule.emitCommand("play", 0);
                                    return Player.COMMAND_INVALID;
                                }
                                cn.lycool.app.media.MediaBridgeModule.emitCommand("playpause", 0);
                                return Player.COMMAND_INVALID;
                            case Player.COMMAND_STOP:
                                cn.lycool.app.media.MediaBridgeModule.emitCommand("stop", 0);
                                return Player.COMMAND_INVALID;
                            case Player.COMMAND_SEEK_TO_NEXT:
                            case Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM:
                                cn.lycool.app.media.MediaBridgeModule.emitCommand("next", 0);
                                return Player.COMMAND_INVALID;
                            case Player.COMMAND_SEEK_TO_PREVIOUS:
                            case Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM:
                                cn.lycool.app.media.MediaBridgeModule.emitCommand("prev", 0);
                                return Player.COMMAND_INVALID;
                            // —— seek 类命令：通知栏 / 锁屏 / 系统媒体卡片 / 语音助手拖动进度条 ——
                            //
                            // Media3 1.8.0 的 onPlayerCommandRequest 契约与直觉相反（字节码
                            // MediaSessionStub.lambda$queueSessionTaskWithPlayerCommandForControllerInfo$14）：
                            //   · 返回 0        → addToCommandQueue，由 SessionTask 调用
                            //                     PlayerWrapper.seekTo(positionMs)，命令真正执行；
                            //   · 返回非 0 的值  → 该值被当作 SessionResult 错误码发给控制器，
                            //                     命令被静默丢弃。
                            // 注意 Player.COMMAND_INVALID 的值是 -1（见 Player.Command），
                            // 它表示「app 接管、Media3 不要执行」，并不是「放行」。
                            //
                            // seek 的目标位置（positionMs）只存在于 controller 侧，本回调签名
                            // 拿不到，因此无法转交 JS，必须放行给 Media3 在播放器上执行。
                            // （历史：曾分别按「原样返回 playerCommand」与「返回
                            //  Player.COMMAND_INVALID」实现，两者均为非 0，导致音乐标签进度条
                            //  拖动完全无效——framework MediaController 探针 + 真机实测证实。）
                            case Player.COMMAND_SEEK_TO_MEDIA_ITEM:
                            case Player.COMMAND_SEEK_TO_DEFAULT_POSITION:
                            case Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM:
                            case Player.COMMAND_SEEK_BACK:
                            case Player.COMMAND_SEEK_FORWARD:
                                return 0;
                            default:
                                // 其余播放器命令（倍速/循环模式等）同样放行给 Media3 在播放器上执行
                                return 0;
                        }
                    }

                    /**
                     * 媒体按键（耳机/蓝牙/语音助手经 MediaButtonReceiver 下发）在进入
                     * Media3 默认处理之前拦截，保留原始按键语义。
                     *
                     * 背景：Media3 会把 KEYCODE_MEDIA_PLAY / KEYCODE_MEDIA_PAUSE / PLAY_PAUSE
                     * 统统折叠成同一个 COMMAND_PLAY_PAUSE 播放器命令（内部还要区分耳机双击）。
                     * 一旦折叠，onPlayerCommandRequest 只看得到「切换」这一个动作，
                     * 于是「播放」键在正在播放时会把音乐暂停、「暂停」键在已暂停时会把音乐放起来——
                     * 语音助手表现为“有时能控制、有时失效”，且与当时恰好处于什么状态强相关。
                     *
                     * 这里抢在折叠之前拿到 KeyCode，按幂等语义分派：
                     *   PLAY      → "play"    （确保处于播放态，重复按不会变成暂停）
                     *   PAUSE     → "pause"   （确保处于暂停态，重复按不会变成播放）
                     *   PLAY_PAUSE / HEADSETHOOK → 交给 Media3 默认处理（保留耳机双击切歌）
                     */
                    @Override
                    public boolean onMediaButtonEvent(MediaSession session, MediaSession.ControllerInfo controller, Intent mediaButtonEvent) {
                        KeyEvent keyEvent = extractKeyEvent(mediaButtonEvent);
                        if (keyEvent == null || keyEvent.getAction() != KeyEvent.ACTION_DOWN) return false;

                        final String command;
                        switch (keyEvent.getKeyCode()) {
                            case KeyEvent.KEYCODE_MEDIA_PLAY:
                                command = "play";
                                break;
                            case KeyEvent.KEYCODE_MEDIA_PAUSE:
                                command = "pause";
                                break;
                            default:
                                // 其余按键（含 PLAY_PAUSE / HEADSETHOOK）交回 Media3，
                                // 以保留其双击切歌等行为
                                return false;
                        }
                        android.util.Log.i("LiuyinMedia", "mediaButton keyCode=" + keyEvent.getKeyCode() + " -> " + command);

                        if (!MediaBridgeModule.hasContext()) {
                            // JS 未运行：原生恢复/暂停上次曲目
                            ensurePlaceholderForeground();
                            boolean ok = liuyinPlayer.handleColdMediaButton(command);
                            android.util.Log.i("LiuyinMedia", "cold handle " + command + " ok=" + ok);
                            if (ok) return true;
                            releasePlaceholderForeground();
                            stopSelf();
                            return true;
                        }
                        cn.lycool.app.media.MediaBridgeModule.emitCommand(command, 0);
                        // 已接管：阻止 Media3 再折叠成一次“切换”，否则会把意图反转
                        return true;
                    }

                    @Override
                    public ListenableFuture<MediaSession.MediaItemsWithStartPosition> onPlaybackResumption(
                            MediaSession session, MediaSession.ControllerInfo controller) {
                        // Android 13+ PlaybackResumption：系统在媒体按键/媒体卡上要恢复我们时回调。
                        // 即使进程被杀、应用被划掉，只要 Session 仍注册且组件可被系统用媒体键拉起，
                        // 这里就能把播放接回来（有当前曲目则续播；进程冷启动则按持久化记录恢复）。
                        try {
                            // 确保已装有曲目：有当前项则续播，进程冷启动则按持久化记录加载
                            liuyinPlayer.handleColdMediaButton("play");
                            androidx.media3.common.MediaItem cur = liuyinPlayer.getPlayer().getCurrentMediaItem();
                            if (cur == null) {
                                return Futures.immediateFuture(
                                        new MediaSession.MediaItemsWithStartPosition(java.util.Collections.emptyList(), 0, 0));
                            }
                            long pos = liuyinPlayer.getPlayer().getCurrentPosition();
                            android.util.Log.i("LiuyinMedia", "onPlaybackResumption resume pos=" + pos);
                            return Futures.immediateFuture(new MediaSession.MediaItemsWithStartPosition(
                                    java.util.Collections.singletonList(cur), 0, pos));
                        } catch (Throwable t) {
                            android.util.Log.w("LiuyinMedia", "onPlaybackResumption failed", t);
                            return Futures.immediateFuture(
                                    new MediaSession.MediaItemsWithStartPosition(java.util.Collections.emptyList(), 0, 0));
                        }
                    }
                })
                .build();
        liuyinPlayer.setMediaSession(mediaSession);
    }

    @Override
    public MediaSession onGetSession(MediaSession.ControllerInfo controllerInfo) {
        return mediaSession;
    }

    /**
     * 从 MEDIA_BUTTON 广播 Intent 中取出原始 KeyEvent。
     * 系统用 {@code android.media.extra.KEY_EVENT} 传递按键；
     * 部分路径（含 {@code Intent.EXTRA_KEY_EVENT}）也用标准 extra，这里两种都兼容。
     */
    @SuppressWarnings("deprecation")
    private static KeyEvent extractKeyEvent(Intent intent) {
        if (intent == null) return null;
        KeyEvent keyEvent = null;
        if (Intent.ACTION_MEDIA_BUTTON.equals(intent.getAction())) {
            keyEvent = intent.getParcelableExtra("android.media.extra.KEY_EVENT");
        }
        if (keyEvent == null) {
            keyEvent = intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT);
        }
        return keyEvent;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // 划掉任务时系统会回收「没有前台组件」的进程。
        // 必须在这里同步占住前台服务身份——而且要在暂停之前：
        // 暂停会让 Media3 交出前台通知，若那时才补，前台身份已经丢了，
        // 进程随即被杀 → onDestroy 里 mediaSession.release() → 会话注销，
        // 语音助手与系统媒体控件就再也找不到本应用（与 ADR-0003 的意图相反）。
        startKeepAliveForeground();
        // 划掉任务时暂停并隐藏媒体标签，但保留队列、会话和服务以支持后续恢复。
        try {
            LiuyinPlayer.getInstance(getApplicationContext()).pauseForTaskRemoved();
        } catch (Throwable ignored) {
        }
        taskRemovedSuppressed = true;
        // Media3 对暂停后的通知更新是异步的，延迟清理并留一次兜底，避免刚移除又被发布。
        mainHandler.postDelayed(this::removeMediaLabel, TASK_REMOVED_LABEL_REMOVE_DELAY_MS);
        mainHandler.postDelayed(this::removeMediaLabel, TASK_REMOVED_LABEL_REMOVE_RETRY_MS);
    }

    @Override
    public void onUpdateNotification(MediaSession session, boolean startInForegroundRequired) {
        LiuyinPlayer player = LiuyinPlayer.getInstance(getApplicationContext());
        if (taskRemovedSuppressed && !player.isPlaybackRequestedCached()) {
            removeMediaLabel();
            return;
        }
        if (player.isPlaybackRequestedCached()) taskRemovedSuppressed = false;
        super.onUpdateNotification(session, startInForegroundRequired);
        if (startInForegroundRequired) {
            // Media3 明确接管了前台服务身份（它自己的媒体通知成为前台通知），
            // 稍后撤掉保活通知，避免通知栏出现两条。等一小会儿再撤，
            // 是为了确保 Media3 已经把媒体通知 post 出来。
            mainHandler.postDelayed(this::cancelKeepAliveIfMediaPosted, 500L);
        } else {
            // 没有前台通知可依：保活通知顶上，保证服务与会话不被回收
            startKeepAliveForeground();
        }
    }

    /** 仅在 Media3 的媒体通知确实已 post 时才撤掉保活通知（否则会失去前台通知身份）。 */
    private void cancelKeepAliveIfMediaPosted() {
        try {
            NotificationManager manager = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? getSystemService(NotificationManager.class)
                    : (NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (manager == null) return;
            if (!isMediaNotificationPosted(manager)) {
                startKeepAliveForeground();
                return;
            }
            manager.cancel(KEEPALIVE_NOTIFICATION_ID);
        } catch (Throwable ignored) {
        }
    }

    /** 移除 Media3 与应用渠道通知，但保留媒体会话与前台服务身份。 */
    private void removeMediaLabel() {
        try {
            LiuyinPlayer player = LiuyinPlayer.getInstance(getApplicationContext());
            if (player.isPlaybackRequestedCached()
                    || player.isPlayingCached()) return;

            NotificationManager manager = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? getSystemService(NotificationManager.class)
                    : (NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            // 顺序很关键：先用保活通知接管前台服务身份，再取消媒体通知。
            // 反过来的话，被取消的正是前台服务自己的通知，系统会直接停掉服务，
            // 进程随之被杀 → onDestroy 里 mediaSession.release() → 会话注销，
            // 划掉任务后语音助手就再也找不到本应用（与 ADR-0003 的意图相反）。
            startKeepAliveForeground();

            manager.cancel(androidx.media3.session.DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                for (android.service.notification.StatusBarNotification notification : manager.getActiveNotifications()) {
                    if (notification.getNotification() == null) continue;
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        String channelId = notification.getNotification().getChannelId();
                        if (CHANNEL_ID.equals(channelId)
                                || androidx.media3.session.DefaultMediaNotificationProvider.DEFAULT_CHANNEL_ID.equals(channelId)) {
                            manager.cancel(notification.getId());
                        }
                    } else if (notification.getId() == androidx.media3.session.DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID) {
                        manager.cancel(notification.getId());
                    }
                }
            }
        } catch (Throwable ignored) {
        }
    }

    /** 创建保活通知渠道：最低优先级、无声音，仅用于维持前台服务身份。 */
    private void createKeepAliveChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    KEEPALIVE_CHANNEL_ID,
                    "后台播放服务",
                    NotificationManager.IMPORTANCE_MIN
            );
            channel.setDescription("保持媒体会话活跃，便于系统与语音助手控制播放");
            channel.setShowBadge(false);
            channel.enableVibration(false);
            channel.setSound(null, null);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private boolean isMediaNotificationPosted(NotificationManager manager) {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false;
            android.service.notification.StatusBarNotification[] list = manager.getActiveNotifications();
            if (list == null) return false;
            for (android.service.notification.StatusBarNotification n : list) {
                if (n.getId() == androidx.media3.session.DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID) return true;
            }
            return false;
        } catch (Throwable t) {
            return false;
        }
    }

    /** 以一条静默的最低优先级通知接管前台服务身份。 */
    private void startKeepAliveForeground() {        try {
            android.app.Notification notification = new androidx.core.app.NotificationCompat.Builder(this, KEEPALIVE_CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_media_play)
                    .setContentTitle(getString(cn.lycool.app.R.string.app_name))
                    .setContentText("后台播放服务")
                    .setOngoing(true)
                    .setSilent(true)
                    .setShowWhen(false)
                    .setPriority(androidx.core.app.NotificationCompat.PRIORITY_MIN)
                    .setVisibility(androidx.core.app.NotificationCompat.VISIBILITY_SECRET)
                    .build();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(KEEPALIVE_NOTIFICATION_ID, notification,
                        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(KEEPALIVE_NOTIFICATION_ID, notification);
            }
        } catch (Throwable t) {
            // Android 12+ 后台启动前台服务受限等情况下会抛异常；
            // 此时退化为普通后台服务，不影响播放功能本身。
            android.util.Log.w("LiuyinMedia", "keep alive foreground failed", t);
        }
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacksAndMessages(null);
        instance = null;
        if (mediaSession != null) {
            mediaSession.release();
            mediaSession = null;
        }
        super.onDestroy();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "播放控制",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("播放进度与媒体控制");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private volatile boolean placeholderForegroundShown = false;

    /** 冷启动按键恢复期间挂占位前台通知（防 startForegroundService 5 秒超时被杀） */
    private void ensurePlaceholderForeground() {
        if (placeholderForegroundShown) return;
        try {
            Intent launchIntent = new Intent(this, MainActivity.class);
            PendingIntent pi = TaskStackBuilder.create(this)
                    .addNextIntentWithParentStack(launchIntent)
                    .getPendingIntent(1, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            android.app.Notification placeholder = new androidx.core.app.NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_media_play)
                    .setContentTitle(getString(cn.lycool.app.R.string.app_name))
                    .setContentText("正在恢复播放…")
                    .setOngoing(true)
                    .setPriority(androidx.core.app.NotificationCompat.PRIORITY_LOW)
                    .setContentIntent(pi)
                    .build();
            // 先接管前台身份，再撤保活通知：反过来会因取消前台通知而被系统停服务
            startForeground(9527, placeholder);
            placeholderForegroundShown = true;
            NotificationManager manager = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? getSystemService(NotificationManager.class)
                    : (NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(KEEPALIVE_NOTIFICATION_ID);
        } catch (Throwable t) {
            android.util.Log.w("LiuyinMedia", "placeholder foreground failed", t);
        }
    }

    private void releasePlaceholderForeground() {
        if (!placeholderForegroundShown) return;
        placeholderForegroundShown = false;
        try {
            // 不用 stopForeground：那会把前台服务身份一起丢掉，进程随即可能被回收、
            // MediaSession 被注销。改为让保活通知重新接管前台身份，再撤掉占位通知。
            startKeepAliveForeground();
            NotificationManager manager = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    ? getSystemService(NotificationManager.class)
                    : (NotificationManager) getSystemService(android.content.Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.cancel(9527);
        } catch (Throwable ignored) {
        }
    }
}


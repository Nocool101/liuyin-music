package cn.lycool.app.media;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import androidx.core.app.TaskStackBuilder;
import androidx.media3.common.ForwardingPlayer;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.session.MediaSession;
import androidx.media3.session.SessionCommands;
import androidx.media3.session.MediaSessionService;

import cn.lycool.app.MainActivity;
import cn.lycool.app.player.LiuyinPlayer;

/**
 * Media3 MediaSessionService：让系统把应用识别为媒体播放器，
 * 提供锁屏媒体控件/通知栏媒体卡片（Media3 自动基于播放器生成）。
 * 上一曲/下一曲转发回 JS（切歌逻辑在 JS），播放/暂停/拖动由 MediaSession 直接控制播放器。
 */
@UnstableApi
public class LiuyinMediaService extends MediaSessionService {

    private static final String CHANNEL_ID = "liuyin_media";

    private MediaSession mediaSession;
    private static LiuyinMediaService instance;

    /** 划掉任务后延时摘除媒体标签：等待 Media3 处理完暂停事件的通知更新，避免刚摘又被发布 */
    private static final long TASK_REMOVED_LABEL_REMOVE_DELAY_MS = 800L;
    private static final long TASK_REMOVED_LABEL_REMOVE_RETRY_MS = 5000L;
    private Handler mainHandler;

    public static LiuyinMediaService getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        MediaLog.log(this, "media service onCreate (created=true)");
        instance = this;
        createNotificationChannel();

        // 绑定真实播放器（单例，与 JS 共享同一 ExoPlayer 实例）
        LiuyinPlayer liuyinPlayer = LiuyinPlayer.getInstance(getApplicationContext());
        mainHandler = new Handler(Looper.getMainLooper());

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
                        boolean jsAlive = MediaBridgeModule.hasContext();
                        android.util.Log.i("LiuyinMedia", "playerCommand=" + playerCommand);
                        MediaLog.log(LiuyinMediaService.this, "player command=" + playerCommand + " jsAlive=" + jsAlive);
                        // JS 未运行（应用未打开、进程刚由媒体按键拉起）：
                        // 播放类按键直接原生恢复/暂停上次曲目，实现"不开 app 也能耳机双击播放"
                        if (!jsAlive) {
                            String coldCommand;
                            switch (playerCommand) {
                                case Player.COMMAND_PLAY_PAUSE:
                                case Player.COMMAND_SEEK_TO_NEXT:
                                case Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM:
                                case Player.COMMAND_SEEK_TO_PREVIOUS:
                                case Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM:
                                    coldCommand = "playpause";
                                    break;
                                default:
                                    coldCommand = null;
                                    break;
                            }
                            if (coldCommand != null) {
                                // 冷启动按键走的是 startForegroundService 通道，5 秒内必须进前台；
                                // 网络流缓冲可能超时，先挂占位通知，播放后由 Media3 替换为真通知
                                ensurePlaceholderForeground();
                                boolean ok = liuyinPlayer.handleColdMediaButton(coldCommand);
                                MediaLog.log(LiuyinMediaService.this, "cold handle " + coldCommand + " ok=" + ok);
                                if (ok) return Player.COMMAND_INVALID;
                                releasePlaceholderForeground();
                                stopSelf();
                                return Player.COMMAND_INVALID;
                            }
                        }
                        switch (playerCommand) {
                            case Player.COMMAND_PLAY_PAUSE:
                                // 播放/暂停由 JS 统一处理（避免与 MediaSession 直接控制播放器双重切换）
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
                            case Player.COMMAND_SEEK_TO_MEDIA_ITEM:
                                return Player.COMMAND_SEEK_TO_MEDIA_ITEM;
                            case Player.COMMAND_SEEK_TO_DEFAULT_POSITION:
                                return Player.COMMAND_SEEK_TO_DEFAULT_POSITION;
                            case Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM:
                                return Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM;
                            case Player.COMMAND_SEEK_BACK:
                                return Player.COMMAND_SEEK_BACK;
                            case Player.COMMAND_SEEK_FORWARD:
                                return Player.COMMAND_SEEK_FORWARD;
                            default:
                                // seek 等由 MediaSession 直接控制播放器
                                return playerCommand;
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

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // 从最近任务划掉：立即暂停并摘除媒体标签（状态栏/锁屏）。
        // 不清队列、不弃焦点、不杀会话、不 stopSelf：
        // Android 16 上耳机媒体按键只路由给存活的 MediaSession，
        // 彻底清理会使其失效（见 docs/adr/0003）。
        // 摘除后进入静默态（LiuyinPlayer.taskRemovedSuppressed）：
        // 抑制按键会话心跳的 0 音量 play()（它会让 Media3 重新发布标签），
        // 恢复播放（耳机键/JS/冷启动）即退出静默态，标签随播放重新出现。
        // 应用在后台（未划掉）时永不触发本方法，故不受影响。
        MediaLog.log(this, "onTaskRemoved: pause & remove media label, keep session alive");
        try {
            LiuyinPlayer.getInstance(getApplicationContext()).pauseForTaskRemoved();
        } catch (Throwable ignored) {
        }
        // 延时摘除：等 Media3 异步处理完暂停事件的通知更新（暂停态以普通 notify 发布标签）；
        // 二次兜底清理晚到的更新
        mainHandler.postDelayed(this::removeMediaLabel, TASK_REMOVED_LABEL_REMOVE_DELAY_MS);
        mainHandler.postDelayed(this::removeMediaLabel, TASK_REMOVED_LABEL_REMOVE_RETRY_MS);
    }

    /** 摘除媒体标签（暂停态）。恢复播放时 Media3 会重新发布通知。 */
    private void removeMediaLabel() {
        try {
            // 若已恢复播放（耳机键唤醒等）则不摘。
            // 注意：ExoPlayer 只允许在创建线程访问，这里可能运行在主线程，
            // 必须用缓存态（isPlayingCached），不能调 isPlaying()
            if (LiuyinPlayer.getInstance(getApplicationContext()).isPlayingCached()) return;
            MediaLog.log(this, "remove media label, keep session");
            stopForeground(STOP_FOREGROUND_REMOVE);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null) return;
            // Media3 默认通知使用自有渠道（default_channel_id），不在我们的 liuyin_media 通道内，
            // 按通知 ID 兜底取消；暂停态下 Media3 以普通 notify 发布，stopForeground 摘不到它
            nm.cancel(androidx.media3.session.DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                for (android.service.notification.StatusBarNotification n : nm.getActiveNotifications()) {
                    if (n.getNotification() == null) continue;
                    String ch = n.getNotification().getChannelId();
                    if (CHANNEL_ID.equals(ch)
                            || androidx.media3.session.DefaultMediaNotificationProvider.DEFAULT_CHANNEL_ID.equals(ch)) {
                        nm.cancel(n.getId());
                    }
                }
            }
        } catch (Throwable t) {
            MediaLog.log(this, "remove media label failed: " + t);
        }
    }

    /** 供 LiuyinPlayer 心跳结束（静默态下 Media3 重发了标签）后再次摘除 */
    public static void scheduleMediaLabelRemoval() {
        LiuyinMediaService s = instance;
        if (s == null || s.mainHandler == null) return;
        MediaLog.log(s, "schedule media label removal after reclaim tick");
        s.mainHandler.postDelayed(s::removeMediaLabel, TASK_REMOVED_LABEL_REMOVE_DELAY_MS);
    }

    @Override
    public void onDestroy() {
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
            startForeground(9527, placeholder);
            placeholderForegroundShown = true;
        } catch (Throwable t) {
            MediaLog.log(this, "placeholder foreground failed: " + t);
        }
    }

    private void releasePlaceholderForeground() {
        if (!placeholderForegroundShown) return;
        placeholderForegroundShown = false;
        try {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } catch (Throwable ignored) {
        }
    }
}

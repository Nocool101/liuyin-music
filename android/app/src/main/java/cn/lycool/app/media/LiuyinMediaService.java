package cn.lycool.app.media;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
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

    public static LiuyinMediaService getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createNotificationChannel();

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
        // 保留后台播放
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
}

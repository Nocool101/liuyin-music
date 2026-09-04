package cn.lycool.app.media;

import android.content.Intent;
import android.util.Log;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/**
 * JS ↔ Media3 MediaSession 桥接：
 * - JS 调用：start/updateMetadata/updateState
 * - 原生事件：MediaBridgeCommand（play/pause/stop/next/prev/seekTo）
 */
public class MediaBridgeModule extends ReactContextBaseJavaModule {

    public static final String NAME = "MediaBridge";
    private static final String TAG = "LiuyinMediaBridge";
    private static ReactApplicationContext sContext;
    private static final ArrayDeque<Command> pendingCommands = new ArrayDeque<>();
    private static final int MAX_PENDING_COMMANDS = 16;

    private static final class Command {
        final String name;
        final long positionMs;
        Command(String name, long positionMs) {
            this.name = name;
            this.positionMs = positionMs;
        }
    }

    public MediaBridgeModule(ReactApplicationContext context) {
        super(context);
        sContext = context;
    }

    @Override
    public String getName() {
        return NAME;
    }

    /** JS 是否在运行（进程冷启动、JS 未加载时为 false，媒体按键走原生恢复播放） */
    public static boolean hasContext() {
        return sContext != null;
    }

    public static void emitCommand(String command, long positionMs) {
        Command cmd = new Command(command, positionMs);
        ReactApplicationContext ctx = sContext;
        if (ctx == null) {
            Log.w(TAG, "command queued (no react context): " + cmd.name);
            enqueue(cmd);
            return;
        }
        try {
            ctx.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                    .emit("MediaBridgeCommand", toMap(cmd));
            Log.i(TAG, "command emitted: " + cmd.name);
        } catch (Throwable t) {
            Log.w(TAG, "command queued (emit failed): " + cmd.name + " " + t);
            enqueue(cmd);
        }
    }

    private static void enqueue(Command cmd) {
        if (pendingCommands.size() >= MAX_PENDING_COMMANDS) pendingCommands.removeFirst();
        pendingCommands.addLast(cmd);
    }

    private static WritableMap toMap(Command cmd) {
        WritableMap map = Arguments.createMap();
        map.putString("command", cmd.name);
        map.putDouble("position", cmd.positionMs);
        return map;
    }

    /** JS 注册监听器后主动拉取排队中的命令，避免锁屏期间事件在原生侧堆积丢失 */
    @ReactMethod
    public void drainMediaCommands(Promise promise) {
        try {
            List<WritableMap> maps = new ArrayList<>();
            while (!pendingCommands.isEmpty()) {
                maps.add(toMap(pendingCommands.removeFirst()));
            }
            if (!maps.isEmpty()) Log.i(TAG, "drained commands: " + maps.size());
            promise.resolve(com.facebook.react.bridge.Arguments.makeNativeArray(maps));
        } catch (Throwable t) {
            promise.reject("DRAIN_ERROR", t);
        }
    }

    /** 启动 MediaSessionService（Media3 会在播放时自动转前台服务） */
    @ReactMethod
    public void start() {
        try {
            Intent intent = new Intent(getReactApplicationContext(), LiuyinMediaService.class);
            // 注意：不能用 startForegroundService —— Media3 的 MediaSessionService
            // 只在播放时才 startForeground，startForegroundService 会在 5 秒超时后杀进程
            getReactApplicationContext().startService(intent);
            MediaLog.log(getReactApplicationContext(), "MediaBridge.start(): service start requested from JS");
            Log.i(TAG, "media service start requested");
        } catch (Throwable t) {
            Log.w(TAG, "media service start failed", t);
        }
    }
}

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
    /**
     * JS 是否已经注册好命令监听。
     * 原生模块是在 JS 首次访问 NativeModules 时才构造的，比 JS 注册监听器更早；
     * 在这个窗口里 emit 出去的事件没有任何监听者，会被静默丢弃（表现为偶发“语音助手没反应”）。
     * 因此以 JS 显式握手为准：握手之前一律入队，握手之后再直接派发。
     */
    private static volatile boolean jsReady = false;
    /** 保护 pendingCommands 与 jsReady 的切换（媒体命令来自主线程，握手来自原生模块线程）。 */
    private static final Object QUEUE_LOCK = new Object();

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

    /**
     * JS 是否可接收命令（进程冷启动、JS 未加载或监听器尚未注册时为 false，
     * 此时媒体按键走原生恢复播放）。
     */
    public static boolean hasContext() {
        return sContext != null && jsReady;
    }

    /**
     * JS 注册好命令监听后调用：原子地「标记就绪 + 取出排队命令」。
     *
     * 必须合并成一次调用——若先标记就绪再排空，两者之间到达的命令既不会被派发也不会被排空，
     * 会被永久丢失；而排空后再标记就绪，同样会漏掉这一小段窗口内的命令。
     * 在同一把锁内完成标记与排空，两种时序都不会丢、也不会重复处理。
     */
    @ReactMethod
    public void setJsReady(Promise promise) {
        try {
            List<WritableMap> maps;
            synchronized (QUEUE_LOCK) {
                jsReady = true;
                maps = new ArrayList<>();
                while (!pendingCommands.isEmpty()) {
                    maps.add(toMap(pendingCommands.removeFirst()));
                }
            }
            if (!maps.isEmpty()) Log.i(TAG, "js ready, drained commands: " + maps.size());
            else Log.i(TAG, "js ready");
            promise.resolve(Arguments.makeNativeArray(maps));
        } catch (Throwable t) {
            promise.reject("SET_JS_READY_ERROR", t);
        }
    }

    public static void emitCommand(String command, long positionMs) {
        Command cmd = new Command(command, positionMs);
        ReactApplicationContext ctx = sContext;
        if (ctx == null || !jsReady) {
            Log.w(TAG, "command queued (js not ready): " + cmd.name);
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
        synchronized (QUEUE_LOCK) {
            if (pendingCommands.size() >= MAX_PENDING_COMMANDS) pendingCommands.removeFirst();
            pendingCommands.addLast(cmd);
        }
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
            synchronized (QUEUE_LOCK) {
                while (!pendingCommands.isEmpty()) {
                    maps.add(toMap(pendingCommands.removeFirst()));
                }
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
            Log.i(TAG, "media service start requested");
        } catch (Throwable t) {
            Log.w(TAG, "media service start failed", t);
        }
    }
}

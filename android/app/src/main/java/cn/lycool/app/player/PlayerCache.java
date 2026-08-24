package cn.lycool.app.player;

import android.content.Context;

import androidx.media3.database.StandaloneDatabaseProvider;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.cache.Cache;
import androidx.media3.datasource.cache.CacheDataSource;
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor;
import androidx.media3.datasource.cache.SimpleCache;

import com.facebook.cache.disk.FileCache;
import com.facebook.imagepipeline.core.ImagePipelineFactory;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** Shared Media3 cache used by playback and the React Native cache controls. */
public final class PlayerCache {
    private static final long DEFAULT_MAX_BYTES = 1024L * 1024L * 1024L;
    private static PlayerCache instance;

    private final Context appContext;
    private long maxBytes = DEFAULT_MAX_BYTES;
    private SimpleCache cache;

    private PlayerCache(Context context) {
        appContext = context.getApplicationContext();
    }

    public static synchronized PlayerCache getInstance(Context context) {
        if (instance == null) instance = new PlayerCache(context);
        return instance;
    }

    public synchronized void configureMaxBytes(long bytes) {
        if (cache != null) return;
        maxBytes = Math.max(0L, bytes);
    }

    public synchronized SimpleCache getCache() {
        if (cache == null) {
            File cacheDir = new File(appContext.getFilesDir(), "TrackPlayer");
            cache = new SimpleCache(
                    cacheDir,
                    new LeastRecentlyUsedCacheEvictor(maxBytes),
                    new StandaloneDatabaseProvider(appContext));
        }
        return cache;
    }

    public synchronized DataSource.Factory getDataSourceFactory(DataSource.Factory upstream) {
        return new CacheDataSource.Factory()
                .setCache(getCache())
                .setUpstreamDataSourceFactory(upstream)
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR);
    }

    public synchronized long getCacheSpace() {
        long total = directorySize(new File(appContext.getFilesDir(), "TrackPlayer"));
        // 旧 track-player 缓存（JS 迁移未覆盖到的残留）
        total += directorySize(new File(appContext.getCacheDir(), "TrackPlayer"));
        total += getFrescoCacheSize();
        return total;
    }

    private long getFrescoCacheSize() {
        try {
            ImagePipelineFactory factory = ImagePipelineFactory.getInstance();
            FileCache mainCache = factory.getMainFileCache();
            FileCache smallCache = factory.getSmallImageFileCache();
            return mainCache.getSize() + (smallCache == mainCache ? 0 : smallCache.getSize());
        } catch (Throwable t) {
            // Fresco 未初始化时按默认目录名统计
            return directorySize(new File(appContext.getCacheDir(), "image_cache"))
                    + directorySize(new File(appContext.getCacheDir(), "image_manager_disk_cache"));
        }
    }

    private void clearFrescoCache() {
        try {
            ImagePipelineFactory factory = ImagePipelineFactory.getInstance();
            factory.getMainFileCache().clearAll();
            factory.getSmallImageFileCache().clearAll();
        } catch (Throwable t) {
            deleteRecursively(new File(appContext.getCacheDir(), "image_cache"));
            deleteRecursively(new File(appContext.getCacheDir(), "image_manager_disk_cache"));
        }
    }

    private static long directorySize(File file) {
        if (!file.exists()) return 0L;
        if (file.isFile()) return file.length();
        File[] children = file.listFiles();
        if (children == null) return 0L;
        long total = 0L;
        for (File child : children) total += directorySize(child);
        return total;
    }

    private static boolean deleteRecursively(File file) {
        if (!file.exists()) return false;
        if (file.isFile()) return file.delete();
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        return file.delete();
    }

    public synchronized boolean isCached(String key) {
        Cache current = getCache();
        long contentLength = current.getContentMetadata(key).get(
                androidx.media3.datasource.cache.ContentMetadata.KEY_CONTENT_LENGTH, -1L);
        return contentLength > 0 && current.isCached(key, 0, contentLength);
    }

    public synchronized void clear() {
        SimpleCache current = getCache();
        List<String> keys = new ArrayList<>(current.getKeys());
        for (String key : keys) current.removeResource(key);
        clearFrescoCache();
        deleteRecursively(new File(appContext.getCacheDir(), "TrackPlayer"));
    }
}

package io.github.karuifeather.featherlounge;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.SystemClock;
import android.util.Log;

/**
 * The launch sting (res/raw/launch_chime.ogg), played at most once per app process.
 * It is prepared as soon as the activity is created and started by the page when its intro begins,
 * so the sound's hit lands with the animation. It plays on the media path, the one a TV's sound system is tuned for.
 */
class LaunchSound {
    private static boolean played;

    private final Context context;
    private MediaPlayer player;
    private boolean ready;
    private boolean startRequested;
    private Runnable onStarted;
    private long requestedAt;

    LaunchSound(Context context) {
        this.context = context.getApplicationContext();
    }

    /** Called (on the player's thread) at the moment the sound actually starts; the page starts its animation then. */
    synchronized void setOnStarted(Runnable callback) {
        onStarted = callback;
    }

    private void started(MediaPlayer m) {
        m.start();
        Log.i("FLSound", "sound started at " + SystemClock.uptimeMillis() + "ms (" + (SystemClock.uptimeMillis() - requestedAt) + "ms after the page asked)");
        if (onStarted != null) onStarted.run();
    }

    /** Begins loading the sound; call early (onCreate). Does nothing if it already played in this process. */
    synchronized void prepare() {
        if (played || player != null) return;
        try {
            int id = context.getResources().getIdentifier("launch_chime", "raw", context.getPackageName());
            if (id == 0) return;
            AssetFileDescriptor fd = context.getResources().openRawResourceFd(id);
            MediaPlayer mp = new MediaPlayer();
            mp.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
            mp.setDataSource(fd.getFileDescriptor(), fd.getStartOffset(), fd.getLength());
            fd.close();
            mp.setOnCompletionListener(MediaPlayer::release);
            mp.setOnErrorListener((m, what, extra) -> { synchronized (LaunchSound.this) { player = null; } m.release(); return true; });
            mp.setOnPreparedListener(m -> { synchronized (LaunchSound.this) { ready = true; if (startRequested) started(m); } });
            player = mp;
            mp.prepareAsync();
        } catch (Exception ignored) {
            player = null; // a missing or failing sound must never break launching
        }
    }

    /** Starts the sound. Returns true on the first launch of this process (the page then plays the full intro). */
    synchronized boolean play() {
        if (played) return false;
        played = true;
        startRequested = true;
        requestedAt = SystemClock.uptimeMillis();
        Log.i("FLSound", "page asked at " + requestedAt + "ms, player ready=" + ready);
        if (player != null && ready) started(player);
        return true;
    }
}

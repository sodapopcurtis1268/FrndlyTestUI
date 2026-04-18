package com.automation.utils;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.monte.media.Format;
import org.monte.media.math.Rational;
import org.monte.screenrecorder.ScreenRecorder;

import java.awt.*;
import java.io.File;
import java.util.List;

import static org.monte.media.FormatKeys.*;
import static org.monte.media.VideoFormatKeys.*;

/**
 * Utility that records the full screen to an AVI file in the {@code videos/}
 * directory using Monte Screen Recorder.
 *
 * <h2>Usage</h2>
 * <pre>
 *   VideoRecorder recorder = new VideoRecorder();
 *   recorder.start("my-test-name");
 *   // ... run the test ...
 *   String videoPath = recorder.stop();
 *   // videoPath is the absolute path to the saved AVI, or null if unavailable
 * </pre>
 *
 * <h2>When recording is skipped</h2>
 * <ul>
 *   <li>Headless mode ({@code headless=true}) — no display to capture.</li>
 *   <li>LambdaTest runs ({@code lt.enabled=true}) — LambdaTest records the
 *       remote session as MP4 server-side; local recording is redundant.</li>
 *   <li>Any environment where {@link GraphicsEnvironment#isHeadless()} is
 *       {@code true} (e.g. most CI servers).</li>
 * </ul>
 *
 * <h2>macOS permissions</h2>
 * macOS Mojave and later require explicit screen-recording permission for the
 * process that calls this class. If the recorded file is blank/black:
 * <ol>
 *   <li>Open <b>System Settings → Privacy &amp; Security → Screen Recording</b>.</li>
 *   <li>Enable the checkbox for <b>Terminal</b> (or IntelliJ IDEA / your IDE).</li>
 * </ol>
 */
public class VideoRecorder {

    private static final Logger log = LogManager.getLogger(VideoRecorder.class);

    private ScreenRecorder screenRecorder;
    private String testName;

    /**
     * Starts recording the default screen to {@code videos/<timestamp>.avi}.
     *
     * <p>Fails silently if the environment does not support screen recording
     * (headless, no display, or missing permissions). Check the log for details.
     *
     * @param testName label used in log messages to identify which test is recording
     */
    public void start(String testName) {
        this.testName = testName;

        if (GraphicsEnvironment.isHeadless()) {
            log.info("Video recording skipped — headless environment");
            return;
        }
        if (com.automation.config.ConfigReader.isLtEnabled()) {
            log.info("Video recording skipped — LambdaTest records the remote session");
            return;
        }
        if (com.automation.config.ConfigReader.isHeadless()) {
            log.info("Video recording skipped — browser running headless");
            return;
        }

        try {
            File dir = new File("videos");
            if (!dir.exists()) dir.mkdirs();

            GraphicsConfiguration gc = GraphicsEnvironment
                    .getLocalGraphicsEnvironment()
                    .getDefaultScreenDevice()
                    .getDefaultConfiguration();

            screenRecorder = new ScreenRecorder(
                    gc,
                    gc.getBounds(),
                    // Container format: AVI file
                    new Format(MediaTypeKey, MediaType.FILE, MimeTypeKey, MIME_AVI),
                    // Video track: Techsmith lossless codec @ 15 fps
                    new Format(
                            MediaTypeKey,          MediaType.VIDEO,
                            EncodingKey,           ENCODING_AVI_TECHSMITH_SCREEN_CAPTURE,
                            CompressorNameKey,     ENCODING_AVI_TECHSMITH_SCREEN_CAPTURE,
                            DepthKey,              24,
                            FrameRateKey,          Rational.valueOf(15),
                            QualityKey,            1.0f,
                            KeyFrameIntervalKey,   15 * 60),
                    // Mouse-cursor track: 30 fps overlay
                    new Format(
                            MediaTypeKey,  MediaType.VIDEO,
                            EncodingKey,   "black",
                            FrameRateKey,  Rational.valueOf(30)),
                    null,   // no audio
                    dir);

            screenRecorder.start();
            log.info("Video recording started — test: '{}'", testName);

        } catch (Exception e) {
            log.warn("Could not start video recording for '{}': {}", testName, e.getMessage());
            screenRecorder = null;
        }
    }

    /**
     * Stops the recording and returns the absolute path of the saved AVI file.
     *
     * @return absolute path to the video file, or {@code null} if recording was
     *         not started or failed
     */
    public String stop() {
        if (screenRecorder == null) return null;

        try {
            screenRecorder.stop();
            List<File> files = screenRecorder.getCreatedMovieFiles();
            if (!files.isEmpty()) {
                String path = files.get(files.size() - 1).getAbsolutePath();
                log.info("Video saved: {}", path);
                return path;
            }
            log.warn("Screen recorder stopped but no output file was created for '{}'", testName);
        } catch (Exception e) {
            log.warn("Could not stop video recording for '{}': {}", testName, e.getMessage());
        }
        return null;
    }
}

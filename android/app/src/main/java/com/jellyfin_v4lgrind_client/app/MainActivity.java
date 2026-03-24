package com.jellyfin_v4lgrind_client.app;

import android.os.Bundle;
import android.util.Log;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "SafeArea";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeVideoPlugin.class);
        registerPlugin(DownloadPlugin.class);
        registerPlugin(CastPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        Log.d(TAG, "onWindowFocusChanged hasFocus=" + hasFocus);
        if (hasFocus) {
            // Post with a small delay so the window has fully settled after
            // returning from NativePlayerActivity and any orientation change.
            getWindow().getDecorView().postDelayed(this::injectSafeAreaInsets, 100);
        }
    }

    private void injectSafeAreaInsets() {
        View decorView = getWindow().getDecorView();
        WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(decorView);
        if (insets == null) {
            Log.w(TAG, "injectSafeAreaInsets: insets null, retrying...");
            decorView.postDelayed(this::injectSafeAreaInsets, 100);
            return;
        }

        Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
        Insets cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout());

        float density = getResources().getDisplayMetrics().density;
        int top    = Math.max(bars.top,    cutout.top);
        int bottom = Math.max(bars.bottom, cutout.bottom);
        int left   = Math.max(bars.left,   cutout.left);
        int right  = Math.max(bars.right,  cutout.right);

        // Convert px → dp (CSS uses dp/pt not raw px on Android)
        float topDp    = top    / density;
        float bottomDp = bottom / density;
        float leftDp   = left   / density;
        float rightDp  = right  / density;

        Log.d(TAG, String.format(
            "injectSafeAreaInsets px top=%d bot=%d left=%d right=%d | dp top=%.1f bot=%.1f left=%.1f right=%.1f | density=%.2f",
            top, bottom, left, right, topDp, bottomDp, leftDp, rightDp, density));

        String js = String.format(
            "document.documentElement.style.setProperty('--sat','%.1fpx');" +
            "document.documentElement.style.setProperty('--sab','%.1fpx');" +
            "document.documentElement.style.setProperty('--sal','%.1fpx');" +
            "document.documentElement.style.setProperty('--sar','%.1fpx');" +
            "console.log('[SafeArea][native] sat=%.1fpx sab=%.1fpx sal=%.1fpx sar=%.1fpx');",
            topDp, bottomDp, leftDp, rightDp,
            topDp, bottomDp, leftDp, rightDp);

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(js, null)
            );
        } else {
            Log.w(TAG, "injectSafeAreaInsets: bridge/webview null");
        }
    }
}

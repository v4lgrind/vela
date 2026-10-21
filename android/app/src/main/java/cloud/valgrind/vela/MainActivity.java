package cloud.valgrind.vela;

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
        registerPlugin(NativeAudioPlugin.class);
        registerPlugin(CastAudioPlugin.class);
        registerPlugin(AirPlayPlugin.class);
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

        // Convert px → rounded dp (CSS px == dp on Android WebView)
        int topDp    = Math.round(top    / density);
        int bottomDp = Math.round(bottom / density);
        int leftDp   = Math.round(left   / density);
        int rightDp  = Math.round(right  / density);

        Log.d(TAG, "injectSafeAreaInsets px top=" + top + " bot=" + bottom +
            " left=" + left + " right=" + right +
            " | dp top=" + topDp + " bot=" + bottomDp +
            " left=" + leftDp + " right=" + rightDp);

        String js =
            "document.documentElement.style.setProperty('--sat','" + topDp + "px');" +
            "document.documentElement.style.setProperty('--sab','" + bottomDp + "px');" +
            "document.documentElement.style.setProperty('--sal','" + leftDp + "px');" +
            "document.documentElement.style.setProperty('--sar','" + rightDp + "px');" +
            "console.log('[SafeArea][native] sat=" + topDp + "px sab=" + bottomDp + "px sal=" + leftDp + "px sar=" + rightDp + "px');";

        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() ->
                getBridge().getWebView().evaluateJavascript(js, null)
            );
        } else {
            Log.w(TAG, "injectSafeAreaInsets: bridge/webview null");
        }
    }
}

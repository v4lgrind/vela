package com.jellyfin_v4lgrind_client.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeVideoPlugin.class);
        registerPlugin(DownloadPlugin.class);
        registerPlugin(CastPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package com.jellyfin_v4lgrind_client.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.jellyfin_v4lgrind_client.app.NativeVideoPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeVideoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

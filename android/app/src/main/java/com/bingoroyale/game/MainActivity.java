package com.bingoroyale.game;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(BingoLocalServerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

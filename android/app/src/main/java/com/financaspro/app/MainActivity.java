package com.financaspro.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayBillingPlugin.class);
        registerPlugin(FpSecureScreenPlugin.class);
        registerPlugin(FpInAppReviewPlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && getBridge() != null
                && getBridge().getWebView() != null) {
            getBridge().getWebView().setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        }
    }

    /* Antes do Android 13 não há setRecentsScreenshotEnabled: com o PIN ligado,
       FLAG_SECURE entra no onPause, antes de o sistema fotografar a tela para
       a lista de recentes, e sai no onResume para não bloquear print no uso. */
    @Override
    public void onPause() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && FpSecureScreenPlugin.ocultarRecentes) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
        super.onPause();
    }

    @Override
    public void onResume() {
        super.onResume();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU && FpSecureScreenPlugin.ocultarRecentes
                && !FpSecureScreenPlugin.telaSensivel) {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        }
    }
}

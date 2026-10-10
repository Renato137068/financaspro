package com.financaspro.app;

import android.os.Build;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bloqueia screenshots e preview em apps recentes (FLAG_SECURE)
 * durante telas sensíveis (login, PIN, saldos).
 *
 * ocultarRecentes: com o PIN ligado, a foto que o Android guarda para a lista
 * de apps recentes não mostra o app (auditoria de segurança de 08/10/2026).
 * No Android 13+ usa setRecentsScreenshotEnabled, que não bloqueia print. Nos
 * anteriores, MainActivity liga FLAG_SECURE no onPause (antes da foto) e
 * desliga no onResume, a menos que uma tela sensível o esteja usando.
 */
@CapacitorPlugin(name = "FpSecureScreen")
public class FpSecureScreenPlugin extends Plugin {

    /** Uma tela sensível (login, PIN) pediu FLAG_SECURE. */
    static volatile boolean telaSensivel = false;
    /** O PIN está ligado: esconder o app na lista de recentes. */
    static volatile boolean ocultarRecentes = false;

    @PluginMethod
    public void enable(PluginCall call) {
        telaSensivel = true;
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }

    @PluginMethod
    public void disable(PluginCall call) {
        telaSensivel = false;
        getActivity().runOnUiThread(() -> {
            getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
            call.resolve();
        });
    }

    @PluginMethod
    public void ocultarRecentes(PluginCall call) {
        ocultarRecentes = Boolean.TRUE.equals(call.getBoolean("ativo", false));
        getActivity().runOnUiThread(() -> {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getActivity().setRecentsScreenshotEnabled(!ocultarRecentes);
            }
            call.resolve();
        });
    }
}

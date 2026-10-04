package com.financaspro.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Task;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Janela de avaliação da Play dentro do app (In-App Review API).
 *
 * Quem decide QUANDO pedir é js/avaliacao-loja.js. Aqui só se abre o fluxo do
 * Google, que tem cota própria e pode não mostrar nada: por isso o resultado
 * é sempre "concluído", nunca "a pessoa avaliou" (a API não conta isso).
 */
@CapacitorPlugin(name = "FpInAppReview")
public class FpInAppReviewPlugin extends Plugin {

    @PluginMethod
    public void solicitar(PluginCall call) {
        ReviewManager manager = ReviewManagerFactory.create(getContext());
        Task<ReviewInfo> pedido = manager.requestReviewFlow();
        pedido.addOnCompleteListener(tarefa -> {
            if (!tarefa.isSuccessful()) {
                call.reject("Avaliação indisponível agora");
                return;
            }
            if (getActivity() == null) {
                call.reject("Sem tela ativa");
                return;
            }
            ReviewInfo info = tarefa.getResult();
            manager.launchReviewFlow(getActivity(), info).addOnCompleteListener(fluxo -> {
                JSObject ret = new JSObject();
                ret.put("concluido", true);
                call.resolve(ret);
            });
        });
    }
}

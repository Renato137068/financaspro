package com.financaspro.app;

import android.app.Activity;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryProductDetailsResult;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient billingClient;
    private PluginCall pendingPurchaseCall;
    private boolean connecting;

    @Override
    public void load() {
        super.load();
        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
            )
            .build();
        ensureConnected(null);
    }

    private void ensureConnected(Runnable onReady) {
        if (billingClient == null) {
            if (onReady != null) onReady.run();
            return;
        }
        if (billingClient.isReady()) {
            if (onReady != null) onReady.run();
            return;
        }
        if (connecting) return;
        connecting = true;
        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult billingResult) {
                connecting = false;
                if (onReady != null) onReady.run();
            }

            @Override
            public void onBillingServiceDisconnected() {
                connecting = false;
            }
        });
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        ensureConnected(() -> {
            JSObject ret = new JSObject();
            ret.put("available", billingClient != null && billingClient.isReady());
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        if (productId == null || productId.isEmpty()) {
            call.reject("product-id-obrigatorio");
            return;
        }
        if (pendingPurchaseCall != null) {
            call.reject("compra-em-andamento");
            return;
        }

        final String requestedOldToken = call.getString("oldPurchaseToken");
        final String requestedOldProductId = call.getString("oldProductId");

        ensureConnected(() -> {
            if (billingClient == null || !billingClient.isReady()) {
                call.reject("billing-indisponivel");
                return;
            }

            pendingPurchaseCall = call;
            List<QueryProductDetailsParams.Product> products = new ArrayList<>();
            products.add(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            );

            billingClient.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(products).build(),
                (billingResult, queryProductDetailsResult) -> {
                    List<ProductDetails> productDetailsList = queryProductDetailsResult != null
                        ? queryProductDetailsResult.getProductDetailsList()
                        : null;
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
                        || productDetailsList == null
                        || productDetailsList.isEmpty()) {
                        pendingPurchaseCall = null;
                        call.reject("produto-nao-encontrado");
                        return;
                    }

                    ProductDetails details = productDetailsList.get(0);
                    List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
                    if (offers == null || offers.isEmpty()) {
                        pendingPurchaseCall = null;
                        call.reject("oferta-indisponivel");
                        return;
                    }

                    BillingFlowParams.ProductDetailsParams productParams =
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(details)
                            .setOfferToken(offers.get(0).getOfferToken())
                            .build();

                    Activity activity = getActivity();
                    if (activity == null) {
                        pendingPurchaseCall = null;
                        call.reject("activity-indisponivel");
                        return;
                    }

                    // Troca de ciclo (mensal↔anual): precisa do token da compra ativa.
                    if ((requestedOldToken != null && !requestedOldToken.isEmpty())
                        || (requestedOldProductId != null && !requestedOldProductId.isEmpty())) {
                        launchWithPossibleReplacement(
                            activity, call, productParams, productId,
                            requestedOldToken, requestedOldProductId
                        );
                        return;
                    }

                    BillingResult launchResult = billingClient.launchBillingFlow(
                        activity,
                        BillingFlowParams.newBuilder()
                            .setProductDetailsParamsList(Collections.singletonList(productParams))
                            .build()
                    );

                    if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        pendingPurchaseCall = null;
                        call.reject("falha-abrir-compra");
                    }
                }
            );
        });
    }

    /**
     * Compra com SubscriptionUpdateParams quando há assinatura ativa a substituir.
     * Se o JS não mandou o token, consulta compras ativas e usa a que tiver
     * productId diferente do destino (ex.: monthly → yearly).
     */
    private void launchWithPossibleReplacement(
        Activity activity,
        PluginCall call,
        BillingFlowParams.ProductDetailsParams productParams,
        String newProductId,
        String oldTokenHint,
        String oldProductIdHint
    ) {
        billingClient.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder()
                .setProductType(BillingClient.ProductType.SUBS)
                .build(),
            (billingResult, purchases) -> {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    pendingPurchaseCall = null;
                    call.reject("falha-consultar-assinatura");
                    return;
                }

                String oldToken = oldTokenHint;
                String oldProductId = oldProductIdHint;
                if ((oldToken == null || oldToken.isEmpty()) && purchases != null) {
                    for (Purchase purchase : purchases) {
                        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                        for (String pid : purchase.getProducts()) {
                            if (pid == null || pid.equals(newProductId)) continue;
                            if (oldProductId != null && !oldProductId.isEmpty() && !pid.equals(oldProductId)) {
                                continue;
                            }
                            oldToken = purchase.getPurchaseToken();
                            oldProductId = pid;
                            break;
                        }
                        if (oldToken != null && !oldToken.isEmpty()) break;
                    }
                }

                BillingFlowParams.Builder flowBuilder = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(Collections.singletonList(productParams));

                if (oldToken != null && !oldToken.isEmpty()) {
                    flowBuilder.setSubscriptionUpdateParams(
                        BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                            .setOldPurchaseToken(oldToken)
                            .setSubscriptionReplacementMode(
                                BillingFlowParams.SubscriptionUpdateParams.ReplacementMode.WITH_TIME_PRORATION
                            )
                            .build()
                    );
                }

                BillingResult launchResult = billingClient.launchBillingFlow(activity, flowBuilder.build());
                if (launchResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    pendingPurchaseCall = null;
                    call.reject("falha-abrir-compra");
                }
            }
        );
    }

    @PluginMethod
    public void restore(PluginCall call) {
        ensureConnected(() -> {
            if (billingClient == null || !billingClient.isReady()) {
                call.reject("billing-indisponivel");
                return;
            }

            billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build(),
                (billingResult, purchases) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject("falha-restaurar");
                        return;
                    }
                    JSArray arr = new JSArray();
                    if (purchases != null) {
                        for (Purchase purchase : purchases) {
                            if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                            acknowledgeIfNeeded(purchase);
                            for (String pid : purchase.getProducts()) {
                                JSObject item = new JSObject();
                                item.put("productId", pid);
                                item.put("purchaseToken", purchase.getPurchaseToken());
                                arr.put(item);
                            }
                        }
                    }
                    JSObject ret = new JSObject();
                    ret.put("purchases", arr);
                    call.resolve(ret);
                }
            );
        });
    }

    @Override
    public void onPurchasesUpdated(BillingResult billingResult, List<Purchase> purchases) {
        PluginCall call = pendingPurchaseCall;
        pendingPurchaseCall = null;

        if (call == null) return;

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            call.reject("compra-cancelada");
            return;
        }

        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK
            || purchases == null
            || purchases.isEmpty()) {
            call.reject("compra-falhou");
            return;
        }

        Purchase purchase = purchases.get(0);
        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) {
            call.reject("compra-pendente");
            return;
        }

        acknowledgeIfNeeded(purchase);

        String productId = purchase.getProducts().isEmpty() ? "" : purchase.getProducts().get(0);
        JSObject ret = new JSObject();
        ret.put("productId", productId);
        ret.put("purchaseToken", purchase.getPurchaseToken());
        call.resolve(ret);
    }

    @PluginMethod
    public void getProductDetails(PluginCall call) {
        JSArray rawIds = call.getArray("productIds");
        if (rawIds == null || rawIds.length() == 0) {
            call.reject("product-ids-obrigatorios");
            return;
        }
        ensureConnected(() -> {
            if (billingClient == null || !billingClient.isReady()) {
                call.reject("billing-indisponivel");
                return;
            }
            List<QueryProductDetailsParams.Product> products = new ArrayList<>();
            try {
                for (int i = 0; i < rawIds.length(); i++) {
                    String pid = rawIds.getString(i);
                    if (pid == null || pid.isEmpty()) continue;
                    products.add(
                        QueryProductDetailsParams.Product.newBuilder()
                            .setProductId(pid)
                            .setProductType(BillingClient.ProductType.SUBS)
                            .build()
                    );
                }
            } catch (Exception e) {
                call.reject("product-ids-invalidos");
                return;
            }
            if (products.isEmpty()) {
                call.reject("product-ids-obrigatorios");
                return;
            }
            billingClient.queryProductDetailsAsync(
                QueryProductDetailsParams.newBuilder().setProductList(products).build(),
                (billingResult, queryProductDetailsResult) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject("falha-consultar-produtos");
                        return;
                    }
                    List<ProductDetails> list = queryProductDetailsResult != null
                        ? queryProductDetailsResult.getProductDetailsList()
                        : null;
                    JSArray out = new JSArray();
                    if (list != null) {
                        for (ProductDetails details : list) {
                            JSObject item = new JSObject();
                            item.put("productId", details.getProductId());
                            item.put("title", details.getTitle());
                            String formatted = "";
                            List<ProductDetails.SubscriptionOfferDetails> offers =
                                details.getSubscriptionOfferDetails();
                            if (offers != null && !offers.isEmpty()) {
                                List<ProductDetails.PricingPhase> phases =
                                    offers.get(0).getPricingPhases().getPricingPhaseList();
                                if (phases != null && !phases.isEmpty()) {
                                    formatted = phases.get(phases.size() - 1).getFormattedPrice();
                                }
                            }
                            item.put("formattedPrice", formatted);
                            out.put(item);
                        }
                    }
                    JSObject ret = new JSObject();
                    ret.put("products", out);
                    call.resolve(ret);
                }
            );
        });
    }

    private void acknowledgeIfNeeded(Purchase purchase) {
        if (purchase == null || purchase.isAcknowledged()) return;
        if (billingClient == null || !billingClient.isReady()) return;
        billingClient.acknowledgePurchase(
            AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.getPurchaseToken())
                .build(),
            result -> { /* best effort */ }
        );
    }
}

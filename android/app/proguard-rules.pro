# Capacitor core + plugins (@PluginMethod reflection)
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
    @com.getcapacitor.PluginMethod *;
}
-keep class com.getcapacitor.** { *; }

# App plugins (billing, biometria, FLAG_SECURE)
-keep class com.financaspro.app.** { *; }

# Google Play Billing
-keep class com.android.billingclient.** { *; }

# Biometric plugin (@capgo/capacitor-native-biometric)
# O pacote Java é ee.forgr.biometric — ver android/app/src/main/assets/
# capacitor.plugins.json. A regra apontava para io.capgo.**, que não existe no
# build: guardava zero classes. A classe anotada com @CapacitorPlugin sobrevivia
# pela regra genérica acima, mas as auxiliares do pacote não estavam cobertas —
# e a biometria é a saída offline do app, então ela precisa funcionar no AAB
# minificado, não só no debug.
-keep class ee.forgr.** { *; }

-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

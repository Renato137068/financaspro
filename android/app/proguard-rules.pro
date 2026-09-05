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

# Biometric plugin
-keep class io.capgo.** { *; }

-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

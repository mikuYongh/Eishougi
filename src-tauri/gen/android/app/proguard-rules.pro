# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Keep JNI-called methods that are not `native` — called from Rust via JNI,
# R8 cannot see the call site and will strip them as dead code otherwise.
-keepclassmembers class com.promptmuse.app.MainActivity {
  public static java.lang.String saveImageToGallery(java.lang.String, java.lang.String);
  public static void startComfyService(java.lang.String);
  public static void updateComfyProgress(java.lang.String, int);
  public static void stopComfyService();
}
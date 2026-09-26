# WebView: keep any @JavascriptInterface members if they are ever added,
# so shrinking can't strip the bridge between the page and the shell.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# androidx.webkit feature checks are reflection-heavy on some OEM builds.
-keep class androidx.webkit.** { *; }
-dontwarn android.webkit.**

# NOT APPLIED.
#
# This file is intentionally NOT wired into the build. `minifyEnabled` and
# `shrinkResources` are hard-disabled for every build type, and no
# `proguardFiles` entry points here — see the "NO SHRINKING. EVER." block in
# build.gradle and the checkNoShrinking guard task that fails the build if
# shrinking is ever switched back on.
#
# Why: the 4.5.0/4.5.1 release APK was built with R8 + resource shrinking and
# crashed instantly on launch. Diffing it against the debug APK showed the
# shrinker had removed all 30 `androidx.core.splashscreen` classes and every
# trace of `installSplashScreen` — which MainActivity.onCreate() calls on the
# first line of the launch path. APK size is not a goal for this app; stability
# is.
#
# The notes below are kept only as a record of what those rules used to do, in
# case shrinking is ever revisited deliberately (it should not be, without a
# device to launch the result on).
#
#   -keepclassmembers class * {
#       @android.webkit.JavascriptInterface <methods>;
#   }
#
#   -keep class androidx.webkit.** { *; }
#   -dontwarn android.webkit.**
#
# Note that even with those rules the bridge was not the problem: the crash came
# from a library whose only reference is the launch path, which is exactly the
# class of bug that shrinking turns from "wrong-looking stack trace" into "app
# does not start" with no way to diagnose it from the APK alone.
/**
 * The build must never shrink, minify, compress or obfuscate anything.
 *
 * The 4.5.0/4.5.1 release APK was built with `minifyEnabled true` +
 * `shrinkResources true` and crashed instantly on launch. Diffing it against the
 * unshrunk debug APK showed the shrinker had removed every one of the 30
 * `androidx.core.splashscreen` classes and every trace of `installSplashScreen`
 * — the call `MainActivity.onCreate()` makes on the first line of the launch
 * path. APK size is not a goal for this app; being able to start is.
 *
 * A Gradle guard task (`checkNoShrinking`) already fails the build if the switches
 * are flipped back on. These tests pin the same rule at the source level, so the
 * reason is recorded where someone editing the build will actually read it.
 */
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = dirname(import.meta.dir);
const BUILD_GRADLE = join(ROOT, 'app/build.gradle');

/** Strips comments so prose explaining the rule cannot read as breaking it. */
function codeOnly(source: string): string {
  return source
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/.*$/, ''))
    .join('\n');
}

const gradle = readFileSync(BUILD_GRADLE, 'utf-8');
const code = codeOnly(gradle);

describe('the Android build never shrinks anything', () => {
  test('no build type enables minification', () => {
    expect(code).not.toMatch(/minifyEnabled\s+true/);
  });

  test('no build type enables resource shrinking', () => {
    expect(code).not.toMatch(/shrinkResources\s+true/);
  });

  test('no ProGuard/R8 configuration is wired into a build type', () => {
    expect(code).not.toMatch(/proguardFiles/);
    expect(code).not.toMatch(/proguard-android/);
  });

  test('every build type explicitly disables both switches', () => {
    // Being explicit is the point: a new build type must opt OUT, never in.
    const minifyOff = (code.match(/minifyEnabled\s+false/g) ?? []).length;
    const shrinkOff = (code.match(/shrinkResources\s+false/g) ?? []).length;
    expect(minifyOff).toBeGreaterThanOrEqual(2);
    expect(shrinkOff).toBeGreaterThanOrEqual(2);
  });

  test('a build-time guard exists so this cannot regress silently', () => {
    expect(gradle).toContain("tasks.register('checkNoShrinking')");
  });

  test('the launch-path splash screen is still installed on the first line', () => {
    const main = readFileSync(
      join(ROOT, 'app/src/main/java/com/victuscloud/ecosystem/MainActivity.java'),
      'utf-8'
    );
    // The class whose disappearance under R8 caused the crash must stay wired up.
    expect(main).toContain('import androidx.core.splashscreen.SplashScreen;');
    expect(main).toMatch(/protected void onCreate[\s\S]{0,200}SplashScreen\.installSplashScreen\(this\)/);
  });
});
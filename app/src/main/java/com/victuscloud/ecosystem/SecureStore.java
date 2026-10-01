package com.victuscloud.ecosystem;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.util.Log;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Encrypted-at-rest storage for the signed-in session (API key, its identifier,
 * the panel account, and the expiry), used by {@link VictusAuth}.
 *
 * <p>The payload is sealed with AES-256-GCM under a key that lives in the Android
 * Keystore and never leaves it. That matters for three reasons beyond simple
 * obfuscation:</p>
 *
 * <ul>
 *   <li>the ciphertext is only readable on the device that created it, so a
 *       {@code backup}/{@code adb backup} of the app's data (this app still allows
 *       backup) cannot be replayed onto another device,</li>
 *   <li>another app cannot read it even on a rooted device without the Keystore
 *       key, and</li>
 *   <li>a GCM tag means a tampered payload fails to open instead of being parsed.</li>
 * </ul>
 *
 * <p>No third-party crypto dependency is added — this is the platform Keystore and
 * the platform cipher, roughly sixty lines. If the Keystore is unavailable (a
 * broken/absent provider, or an invalidated key), the store degrades to
 * app-private plaintext rather than locking the user out, and records which form
 * it used; {@link #isEncrypted()} reports that honestly.</p>
 */
final class SecureStore {

    private static final String TAG = "VictusSecureStore";

    private static final String PREFS = "victus_auth_secure";
    private static final String KEY_PAYLOAD = "session";
    private static final String KEYSTORE_PROVIDER = "AndroidKeyStore";
    private static final String KEY_ALIAS = "victus_auth_key";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12;

    /** Marks a value sealed with the Keystore key. */
    private static final String ENCRYPTED_PREFIX = "e1:";
    /** Marks the degraded, unencrypted fallback (app-private storage only). */
    private static final String PLAINTEXT_PREFIX = "p0:";

    private final SharedPreferences prefs;
    private final String keyAlias;
    private volatile boolean encrypted;

    SecureStore(Context context) {
        this(context, PREFS, KEY_ALIAS);
    }

    private SecureStore(Context context, String prefsName, String keyAlias) {
        this.prefs = context.getApplicationContext().getSharedPreferences(prefsName, Context.MODE_PRIVATE);
        this.keyAlias = keyAlias;
        String stored = prefs.getString(KEY_PAYLOAD, null);
        this.encrypted = stored == null || stored.startsWith(ENCRYPTED_PREFIX);
    }

    /**
     * A throwaway store in its own preferences file and Keystore alias, used by the
     * compatibility self-test. It never touches the real session, which is why the
     * diagnostics screen can prove encryption works without risking the user's
     * sign-in.
     */
    static SecureStore scratch(Context context) {
        return new SecureStore(context, PREFS + "_selftest", KEY_ALIAS + "_selftest");
    }

    /** True when the last write was actually encrypted by the Keystore. */
    boolean isEncrypted() {
        return encrypted;
    }

    /** True when the session is actually on disk (used by diagnostics). */
    boolean hasStoredSession() {
        return prefs.contains(KEY_PAYLOAD);
    }

    /** Persists the session JSON. Returns false when nothing could be stored. */
    boolean save(String json) {
        if (json == null || json.trim().isEmpty()) return false;
        String sealed = encrypt(json);
        if (sealed != null) {
            encrypted = true;
            return prefs.edit().putString(KEY_PAYLOAD, ENCRYPTED_PREFIX + sealed).commit();
        }
        // Degraded path: app-private storage, clearly marked as unencrypted.
        Log.w(TAG, "Keystore unavailable; storing the session in app-private storage only");
        encrypted = false;
        return prefs.edit().putString(KEY_PAYLOAD, PLAINTEXT_PREFIX + json).commit();
    }

    /** The stored session JSON, or null when absent, unreadable, or tampered with. */
    String load() {
        String stored = prefs.getString(KEY_PAYLOAD, null);
        if (stored == null || stored.isEmpty()) return null;

        if (stored.startsWith(PLAINTEXT_PREFIX)) {
            encrypted = false;
            return stored.substring(PLAINTEXT_PREFIX.length());
        }
        if (!stored.startsWith(ENCRYPTED_PREFIX)) {
            // Unknown format from an older build: discard rather than guess.
            clear();
            return null;
        }

        encrypted = true;
        String opened = decrypt(stored.substring(ENCRYPTED_PREFIX.length()));
        if (opened == null) {
            // Wrong device, rotated key, or tampered payload: start clean.
            clear();
            return null;
        }
        return opened;
    }

    void clear() {
        boolean hadEncryptedValue = encrypted || prefs.contains(KEY_PAYLOAD);
        prefs.edit().remove(KEY_PAYLOAD).commit();
        if (hadEncryptedValue) deleteKey();
    }

    void wipeEverything() {
        prefs.edit().clear().commit();
        deleteKey();
    }

    // ------------------------------------------------------------- crypto

    private String encrypt(String plaintext) {
        try {
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey());
            byte[] iv = cipher.getIV();
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));

            byte[] packed = new byte[iv.length + ciphertext.length];
            System.arraycopy(iv, 0, packed, 0, iv.length);
            System.arraycopy(ciphertext, 0, packed, iv.length, ciphertext.length);
            return Base64.encodeToString(packed, Base64.NO_WRAP);
        } catch (Exception failure) {
            Log.w(TAG, "Could not encrypt the session", failure);
            return null;
        }
    }

    private String decrypt(String encoded) {
        try {
            byte[] packed = Base64.decode(encoded, Base64.NO_WRAP);
            if (packed.length <= IV_BYTES) return null;

            byte[] iv = new byte[IV_BYTES];
            System.arraycopy(packed, 0, iv, 0, IV_BYTES);
            byte[] ciphertext = new byte[packed.length - IV_BYTES];
            System.arraycopy(packed, IV_BYTES, ciphertext, 0, ciphertext.length);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secretKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (Exception failure) {
            Log.w(TAG, "Could not decrypt the stored session", failure);
            return null;
        }
    }

    /** The Keystore key, generated on first use. Never persisted by us. */
    private SecretKey secretKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
        keyStore.load(null);

        KeyStore.Entry entry = keyStore.getEntry(keyAlias, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER);
        generator.init(new KeyGenParameterSpec.Builder(keyAlias,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    private void deleteKey() {
        try {
            KeyStore keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER);
            keyStore.load(null);
            if (keyStore.containsAlias(keyAlias)) keyStore.deleteEntry(keyAlias);
        } catch (Exception failure) {
            Log.w(TAG, "Could not delete the Keystore key", failure);
        }
    }
}

// AIDL contract for the privileged install helper.
//
// This interface is implemented by UpdatePrivilegedService, which Shizuku runs
// in its own process as the shell (ADB) or root identity. The APK is streamed
// through a ParcelFileDescriptor, so the privileged process never needs to read
// the app's private cache directory (which shell cannot access).
package com.victuscloud.ecosystem;

import android.os.ParcelFileDescriptor;

interface IUpdateService {
    /**
     * Stages the APK streamed through [apk] and installs it.
     *
     * @return "OK" on success, otherwise a human readable failure reason.
     */
    String install(in ParcelFileDescriptor apk, String fileName);

    /** Confirmation of the required privilege, e.g. "uid=2000(shell)". */
    String identify();
}

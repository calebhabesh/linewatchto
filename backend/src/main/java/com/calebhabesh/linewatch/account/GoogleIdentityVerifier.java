package com.calebhabesh.linewatch.account;

public interface GoogleIdentityVerifier {
    VerifiedGoogleIdentity verify(String credential);
}
